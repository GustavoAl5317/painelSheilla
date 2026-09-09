export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  shouldTransferToHuman: boolean;
  triageComplete: boolean;
  qualifiedData?: {
    name?: string;
    phone?: string;
    email?: string;
    cpf?: string;
    legalArea?: string;
    caseSummary?: string;
    score: number;
  };
}

export interface AIServiceConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  systemPrompt: string;
  transferKeywords: string[];
}

export async function runAIChat(
  config: AIServiceConfig,
  history: AIMessage[],
  userMessage: string,
  options?: { clientContext?: string; hasMedia?: boolean; operatorIntervened?: boolean; contactName?: string; triageState?: string }
): Promise<AIResponse> {
  const { clientContext, hasMedia = false, operatorIntervened = false, contactName, triageState } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, hasMedia, operatorIntervened, contactName, triageState) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Temperatura baixa na conversa: o fluxo de triagem é determinístico e valores
  // altos causavam respostas fora de contexto (dispensa indevida, troca de módulo).
  const askModel = (msgs: AIMessage[]) =>
    config.provider === "openai"
      ? callOpenAI(config.apiKey, config.model, msgs, 0.2)
      : callAnthropic(config.apiKey, config.model, msgs, 0.2);

  // Roda resposta ao cliente e extração de dados em paralelo
  const [firstResponse, qualifiedData] = await Promise.all([
    askModel(messages),
    extractQualifiedDataWithAI(config.apiKey, config.provider, config.model, history, userMessage),
  ]);

  // Trava contra dispensa indevida: se o modelo mandou uma das mensagens de
  // encerramento em um caso que claramente não é o gatilho dela, pede revisão.
  let responseContent = firstResponse;
  const clientText = [...history.filter(m => m.role === "user").map(m => m.content), userMessage].join("\n");
  const misfire = detectDismissalMisfire(firstResponse, clientText);
  if (misfire) {
    console.warn(`[AI guard] dispensa indevida detectada (${misfire.kind}) — refazendo resposta.`);
    responseContent = await askModel([
      ...messages,
      { role: "assistant", content: firstResponse },
      { role: "user", content: `[REVISÃO INTERNA DO SISTEMA — não é o cliente falando, não mencione esta mensagem]\n${misfire.instruction}\nReescreva agora a resposta ao cliente.` },
    ]).catch(() => firstResponse);
  }

  const shouldTransfer =
    config.transferKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase())) ||
    responseContent.includes("[TRANSFERIR_PARA_HUMANO]");

  const triageComplete = responseContent.includes("[TRIAGEM COMPLETA]");

  const cleanContent = responseContent
    .replace("[TRANSFERIR_PARA_HUMANO]", "")
    .replace("[TRIAGEM COMPLETA]", "")
    .trim();

  return {
    content: cleanContent,
    shouldTransferToHuman: shouldTransfer,
    triageComplete,
    qualifiedData,
  };
}

// ─── Trava contra dispensa indevida ───────────────────────────────────────────

/** Trecho estável da mensagem de "fora de escopo". */
const OUT_OF_SCOPE_MARK = /não se enquadra em nosso escopo de atuação/i;
/** Trecho estável da mensagem de oferta de serviço / parceria. */
const PARTNERSHIP_MARK = /não atua em processos em que o reclamante já possua advogado/i;

/** Sinais de que o assunto É trabalhista / previdenciário — nunca dispensar. */
const IN_SCOPE_HINTS =
  /(empresa|patr(ã|a)o|patroa|chefe|emprego|empregad|trabalh|carteira assinada|ctps|demiss|demitid|dispensad|rescis|verba|fgts|hora[s]? extra|ass[ée]dio|v[íi]nculo|justa causa|aviso pr[ée]vio|sal[áa]rio|holerite|atestado|afastad|acidente|inss|benef[íi]cio|aposentad|aux[íi]lio|bpc|loas|pens(ã|a)o por morte|per[íi]cia|cnis|reclamat[óo]ria|justi[çc]a do trabalho|processar|entrar com (uma )?a[çc](ã|a)o|meus direitos)/i;

/** Sinais de que alguém está OFERECENDO algo ao escritório. */
const OFFER_HINTS =
  /(parceria|oferec|proposta comercial|or[çc]amento|marketing|tr[áa]fego pago|capta[çc](ã|a)o de clientes|divulga[çc](ã|a)o|nossa empresa|nossa ag[êe]ncia|represento a|sou consultor|software|sistema de gest(ã|a)o|planilha|curr[íi]culo|vaga de|estou (me )?candidatando|presta[çc](ã|a)o de servi[çc]os para|fornecedor)/i;

function detectDismissalMisfire(
  response: string,
  clientText: string
): { kind: string; instruction: string } | null {
  if (OUT_OF_SCOPE_MARK.test(response) && IN_SCOPE_HINTS.test(clientText)) {
    return {
      kind: "fora_de_escopo",
      instruction:
        'Sua resposta dispensou o cliente com a mensagem de "fora do escopo de atuação", mas ele mencionou emprego, empresa, INSS ou benefício. Reavalie: se o caso tem qualquer relação com trabalho, empresa, patrão, INSS ou benefício, ele É do escopo — não dispense, continue a triagem perguntando a próxima informação que falta. Só mantenha a mensagem de dispensa, palavra por palavra, se o cliente tiver nomeado explicitamente outra matéria (divórcio, guarda, inventário, criminal, aluguel/despejo, consumidor, tributos, contratos empresariais). Máximo 3 frases quando continuar a triagem.',
    };
  }
  if (PARTNERSHIP_MARK.test(response) && !OFFER_HINTS.test(clientText)) {
    return {
      kind: "parceria",
      instruction:
        'Sua resposta usou a mensagem reservada a quem OFERECE serviços, parcerias ou emprego ao escritório, mas nada na conversa indica isso — a pessoa está pedindo ajuda. Não dispense: responda ao que ela acabou de escrever e continue a triagem, em no máximo 3 frases. Só mantenha a mensagem de dispensa, palavra por palavra, se ela estiver de fato vendendo ou propondo algo ao escritório.',
    };
  }
  return null;
}

function buildSystemPrompt(
  base: string,
  clientContext: string | undefined,
  hasMedia = false,
  operatorIntervened = false,
  contactName?: string,
  triageState?: string
): string {
  const firstNameForGreeting = (() => {
    const raw = contactName?.trim();
    if (!raw) return "";
    if (/^\+?[\d\s().-]{6,}$/.test(raw.replace(/\s/g, ""))) return "";
    return raw.split(/\s+/)[0];
  })();

  const greetingTarget = firstNameForGreeting ? `${firstNameForGreeting}, tudo bem?` : "tudo bem?";

  const menuGreetingRule = clientContext
    ? `
SAUDAÇÃO INICIAL OBRIGATÓRIA (CLIENTE CADASTRADO — MENU DE OPÇÕES):
- Sempre que o cliente iniciar a conversa, cumprimentar ("Olá", "Oi", "Bom dia", "Boa tarde", "Boa noite", "Tudo bem?"), perguntar "como pode ajudar" / "quais são as opções", ou enviar mensagem sem indicar claramente o motivo, responda EXATAMENTE com esta saudação e menu, sem nenhuma palavra adicional, sem perguntar nome, e-mail, CPF ou número de processo antes:

"Olá ${greetingTarget} Para que eu possa lhe direcionar, me diga exatamente em que posso lhe ajudar hoje:

1. Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)
2. Trabalhista (rescisão, horas extras, assédio, vínculo empregatício, acidente de trabalho, etc.)
3. Sou cliente do escritório e gostaria de saber o andamento do meu processo
4. Outros assuntos"

- NUNCA pergunte CPF ou número de processo — você já tem o cadastro dele.
- Se o cliente já disse claramente o motivo do contato na primeira mensagem, NÃO mostre o menu: responda o que ele pediu ou siga a triagem do assunto correspondente.
- Só responda sobre andamento de processo APÓS o cliente escolher a opção 3 ou perguntar diretamente pelo processo.
- Se o cliente pedir explicitamente "quais são as opções" ou "o que você faz", repita o menu.`
    : "";

  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nREGRA OBRIGATÓRIA PARA CLIENTES CADASTRADOS:
- Este cliente JÁ ESTÁ CADASTRADO. NUNCA peça CPF nem número de processo.
- Use o PRIMEIRO NOME do cliente (do campo "Nome" acima) na saudação do menu.
- Quando o cliente perguntar sobre andamento do processo, responda usando os dados da seção "Histórico de movimentações e atualizações do processo" acima.
- NUNCA invente, deduza ou parafraseie movimentações que não estejam EXPLICITAMENTE listadas no histórico acima. Cite a movimentação como está registrada.
- Se o histórico estiver vazio ("Nenhuma movimentação registrada"), responda: "Não tenho movimentações registradas no sistema ainda. A equipe do escritório poderá verificar isso para você." e inclua [TRANSFERIR_PARA_HUMANO] no final.
- NUNCA responda com mensagens genéricas como "as informações estão sendo verificadas" quando houver histórico disponível acima.
- Responda em linguagem simples, sem jargão jurídico. Máximo 3 frases.`
    : `\n\n--- CONTEXTO ---\nVocê NÃO tem cadastro completo desta pessoa neste painel. Faça a triagem coletando o que ainda falta, UMA pergunta por vez.\n- Se ela fizer referência a conversas ou etapas que não aparecem no histórico acima, não tente adivinhar.\n- Se a pessoa quiser saber o andamento de um processo, peça o CPF para localizar.`;

  const mediaInstruction = hasMedia
    ? "\n- IMPORTANTE: O cliente enviou uma imagem ou documento. O conteúdo já foi extraído e está na mensagem abaixo entre colchetes. Use essas informações para responder diretamente — não diga que não consegue ver arquivos.\n- REGRA CRÍTICA: Se o documento for um COMPROVANTE DE PAGAMENTO ou TRANSFERÊNCIA BANCÁRIA, você deve responder APENAS com a frase exata: \"Olá! Recebi sua mensagem Nossa equipe já foi notificada e a doutora responderá em breve.\" e incluir [TRANSFERIR_PARA_HUMANO] no final, sem mais nenhuma palavra ou pergunta."
    : "";

  const pacing = `
REGRA DE RITMO — ABSOLUTA:
- Envie APENAS UMA mensagem curta por vez. Faça UMA pergunta, aguarde a resposta, depois avance.
- NUNCA faça duas perguntas na mesma mensagem.
- Máximo 3 frases por mensagem. Nada de textão nem de listas longas de exemplos.
- NUNCA repita uma pergunta que o cliente já respondeu, nem reformulada com outras palavras. Releia o histórico antes de perguntar.
- Se o cliente já contou o caso espontaneamente, considere o relato coletado e avance — não peça para ele contar de novo.
- Se não faltar mais nenhuma informação, encerre a triagem em vez de continuar perguntando.

REGRAS ANTI-ALUCINAÇÃO — ABSOLUTAS:
- NUNCA invente, suponha ou deduza informações que o cliente não disse explicitamente nesta conversa.
- NUNCA confirme, repita ou valide dados (nome, processo, benefício, datas, valores, decisões) que não estejam no histórico desta conversa ou nos dados do cliente acima.
- Se não sabe algo, diga exatamente: "Não tenho essa informação. A equipe do escritório poderá verificar isso para você."
- NUNCA complete frases do cliente com suposições. Pergunte se precisar confirmar.
- NUNCA mencione leis, artigos, jurisprudências ou prazos específicos — isso é parecer jurídico.
- NUNCA pergunte se há urgência, se o caso é urgente, se precisa com urgência, nem use "urgência", "urgente" ou "rápido" em perguntas ao cliente.
- NUNCA pergunte sobre prazos processuais, vencimento ou "quanto tempo falta" só para saber se o caso é urgente ou prioritário.
- Se o próprio cliente pedir humano ou equipe jurídica, inclua [TRANSFERIR_PARA_HUMANO] no final, sem comentar sobre urgência.

REGRA DE COERÊNCIA — ABSOLUTA:
- Sua resposta precisa responder à ÚLTIMA mensagem do cliente. Nunca envie um texto pronto que não tenha relação com o que ele acabou de escrever.
- As mensagens de dispensa (fora de escopo e oferta de serviço/parceria) só podem ser usadas nos gatilhos inequívocos descritos acima. Na dúvida, siga a triagem — jamais dispense um cliente que fala de emprego, empresa, patrão, INSS ou benefício.
- Nunca peça documentos do INSS (Processo Administrativo, carta de indeferimento, CNIS) em um caso trabalhista. Nunca pergunte sobre empresa/rescisão em um caso previdenciário.`;

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS (cliente cadastrado):
- Este é um cliente existente do escritório. Trate-o com cordialidade pelo PRIMEIRO NOME do campo "Nome" acima.
- Responda APENAS com base nos dados listados acima. Se a informação não estiver lá, não invente.
- NUNCA forneça parecer jurídico, prometa resultados ou invente informações além do que está registrado.
- NUNCA marque consultas, reuniões, ligações ou confirme horários — diga que a equipe entrará em contato pelo WhatsApp.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais, CPF ou senhas por conta própria. Porém, se o cliente enviar esses dados voluntariamente, apenas agradeça e guarde a informação sem dizer que não pode coletar.
- NUNCA pergunte se o cliente já tem advogado.
- Se o cliente quiser falar com a equipe jurídica ou pedir atendimento humano, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : `\nINSTRUÇÕES OBRIGATÓRIAS (não cadastrado — triagem):
- Antes de responder, releia o histórico e liste mentalmente o que JÁ foi informado: nome completo, e-mail, área, situação, tipo do problema e relato do caso.
- Pergunte SOMENTE a primeira dessas informações que ainda estiver faltando. Tudo que já apareceu na conversa está coletado — não pergunte de novo.
- Ordem preferencial quando várias faltam: nome → e-mail → área → situação → tipo → relato. Se o cliente já entregou uma delas fora de ordem, apenas pule.
- Se a área já ficou clara pelo que o cliente escreveu (ex.: falou de empresa, patrão, demissão, INSS, benefício), NÃO apresente o menu de 4 opções: confirme a área em uma frase e siga para o módulo correspondente.
- Se nenhuma área estiver clara e você já tiver nome e e-mail, apresente o menu de 4 opções exatamente como definido acima.
- SEMPRE termine sua mensagem com a próxima informação que falta. NUNCA termine com "Como posso ajudar?", "Em que posso ajudar?" ou qualquer frase genérica.
- Quando nome + e-mail + área + situação + tipo + relato estiverem completos, encerre com a mensagem de registro e inclua [TRIAGEM COMPLETA].
- NUNCA forneça orientação jurídica ou garanta resultados.
- Se o cliente solicitar atendimento humano, inclua [TRANSFERIR_PARA_HUMANO] no final.`;

  const triageStateSection = triageState
    ? `\n\n--- ESTADO DA TRIAGEM (extraído automaticamente desta conversa) ---\n${triageState}\n- Todo item marcado como "JÁ COLETADO" está respondido: é PROIBIDO perguntá-lo novamente.\n- Pergunte apenas o primeiro item marcado como "FALTA".\n- Se nada estiver marcado como "FALTA", encerre a triagem.`
    : "";

  const operatorNote = operatorIntervened
    ? `\n\nREGRA CRÍTICA — MENSAGENS DA DRA. SHEILA NO HISTÓRICO:
- Algumas mensagens anteriores nesta conversa estão marcadas com ⚠️ [MENSAGEM ENVIADA PELA DRA. SHEILA — NÃO FOI VOCÊ QUE ESCREVEU ISSO].
- Essas mensagens foram escritas por uma PESSOA HUMANA (a Dra. Sheila ou equipe). VOCÊ NÃO AS ESCREVEU.
- NUNCA afirme que disse algo que está nessas mensagens. NUNCA continue o raciocínio dessas mensagens como se fossem suas.
- Analise o que o cliente respondeu DEPOIS dessas mensagens e continue a triagem normalmente a partir daí.
- Se o humano já coletou alguma informação (nome, e-mail, área), considere essa informação como disponível e não repita a pergunta.`
    : "";

  return `${base}${clientSection}${menuGreetingRule}${pacing}${instructions}${triageStateSection}${mediaInstruction}${operatorNote}`;
}

// ─── Extração estruturada de dados via IA ────────────────────────────────────

async function extractQualifiedDataWithAI(
  apiKey: string,
  provider: "openai" | "anthropic",
  model: string,
  history: AIMessage[],
  userMessage: string
): Promise<AIResponse["qualifiedData"]> {
  const allUserText = history
    .filter(m => m.role === "user")
    .map(m => m.content)
    .concat(userMessage)
    .join("\n");

  // CPF via regex (mais confiável que IA para formato estruturado)
  const cpfMatch = allUserText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/\D/g, "") : undefined;

  const systemPrompt = `Você é um extrator de dados de conversas jurídicas. Analise o histórico e retorne APENAS um JSON válido.

REGRAS CRÍTICAS:
- Só preencha "name" se o cliente disse o próprio nome de forma explícita e direta (ex: "me chamo Ana", "sou o Carlos", "meu nome é..."). NUNCA infira, suponha ou invente um nome.
- Se o nome não foi dito claramente, omita o campo "name" completamente.
- Só preencha "email" se o cliente informou o próprio e-mail de forma explícita (ex: "meu e-mail é...", "pode me mandar para...@..."). NUNCA extraia e-mails que apareçam como exemplos, contexto ou de terceiros.
- Só preencha "legalArea" se o tipo do problema jurídico ficou claro na conversa.
- Preencha "caseSummary" sempre que o cliente já tiver descrito o que aconteceu com ele, mesmo que de forma desorganizada ou incompleta. Esse campo é usado para não pedir o relato duas vezes — se ele já contou algo do caso, resuma.

Campos possíveis (omita os que não tiver certeza):
{
  "name": "nome exato como o cliente disse",
  "email": "e-mail informado pelo próprio cliente",
  "phone": "telefone alternativo informado pelo cliente",
  "legalArea": "Direito Trabalhista | Direito Previdenciário | Acidente de Trabalho",
  "caseSummary": "resumo objetivo em 1-2 frases",
  "score": número 0-100 (nome+e-mail+área+resumo completos = 100)
}
Retorne APENAS o JSON, sem markdown.`;

  const conv = history
    .filter(m => m.role !== "system")
    .map(m => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
    .concat(`Cliente: ${userMessage}`)
    .join("\n");

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: conv },
  ];

  try {
    // Extração é tarefa determinística — temperatura 0 evita JSON inventado
    const raw = provider === "openai"
      ? await callOpenAI(apiKey, model, messages, 0)
      : await callAnthropic(apiKey, model, messages, 0);

    const parsed = JSON.parse(raw.replace(/```json\n?|```/g, "").trim());

    return {
      name: parsed.name || undefined,
      phone: parsed.phone || undefined,
      email: parsed.email || undefined,
      cpf,
      legalArea: parsed.legalArea || undefined,
      caseSummary: parsed.caseSummary || undefined,
      score: typeof parsed.score === "number" ? parsed.score : 0,
    };
  } catch {
    return { cpf, score: 0 };
  }
}

// ─── Interpretação de publicações judiciais ───────────────────────────────────

export interface InterpretedMovement {
  tipoMovimentacao: string;
  resumo: string;
  mensagemCliente: string;
  diasPrazo?: number;
}

export async function interpretLegalMovement(
  rawText: string,
  apiKey: string,
  provider: "openai" | "anthropic" = "openai",
  model?: string
): Promise<InterpretedMovement> {
  const resolvedModel = model ?? (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

  const system = `Você é um assistente jurídico especializado em publicações do Diário da Justiça.
Analise o texto de uma publicação judicial e retorne um JSON com exatamente estes campos:
- tipoMovimentacao: tipo resumido (ex: "Sentença", "Despacho", "Intimação", "Pauta de Julgamento", "Decisão Interlocutória")
- resumo: resumo em linguagem clara para o advogado, máximo 2 frases, explicitando o que foi decidido/solicitado
- mensagemCliente: mensagem amigável em português simples para enviar ao cliente via WhatsApp, sem jargão jurídico, máximo 2 frases
- diasPrazo: número inteiro de dias para manifestação/resposta se identificado no texto (omita o campo se não houver prazo)
Retorne APENAS o JSON válido, sem markdown ou explicações.`;

  const userMsg = `Publicação judicial:\n${rawText.slice(0, 2000)}`;
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];

  let raw = "";
  try {
    if (provider === "openai") {
      raw = await callOpenAI(apiKey, resolvedModel, messages);
    } else {
      raw = await callAnthropic(apiKey, resolvedModel, messages);
    }
    const json = JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
    return json as InterpretedMovement;
  } catch {
    return {
      tipoMovimentacao: "Publicação Judicial",
      resumo: rawText.slice(0, 300),
      mensagemCliente: "Há uma nova movimentação no seu processo. Em breve entraremos em contato.",
    };
  }
}

/** Resumo exclusivamente a partir do texto do cartão (comentários + atualizações registradas). */
export async function summarizeCaseCardForWhatsApp(
  entriesPlainText: string,
  clientFirstName: string,
  apiKey: string,
  provider: "openai" | "anthropic" = "openai",
  model?: string
): Promise<string> {
  const resolvedModel = model ?? (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");
  const system = `Você manda mensagens curtas por WhatsApp para um cliente leigo.
Use APENAS as informações do bloco "Cartão do escritório" abaixo. Não invente fatos, datas ou resultados que não apareçam literalmente nesse texto.
Se o texto for vazio ou só administrativo, diga que o escritório retornará com novidades.
Tom: cordial, português brasileiro, sem jargão jurídico pesado. Máximo 4 frases curtas. Sem prefixo "Prezado" longo.`;
  const userMsg = `Nome para tratar: ${clientFirstName}\n\n--- Cartão do escritório ---\n${entriesPlainText.slice(0, 8000)}`;
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];
  if (provider === "openai") {
    return (await callOpenAI(apiKey, resolvedModel, messages)).trim();
  }
  return (await callAnthropic(apiKey, resolvedModel, messages)).trim();
}

// ─── Transcrição de Áudio (Whisper) ──────────────────────────────────────────

/**
 * Baixa um áudio de qualquer URL e transcreve via OpenAI Whisper.
 * Retorna o texto transcrito ou null se falhar.
 */
export async function transcribeAudio(audioUrl: string | undefined, apiKey: string, base64Media?: string): Promise<string | null> {
  console.log(`[transcribeAudio] Inciando transcrição...`);
  try {
    let audioBuffer: ArrayBuffer;
    
    if (base64Media) {
      console.log(`[transcribeAudio] Usando áudio em base64 recebido no webhook.`);
      const binaryString = atob(base64Media);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBuffer = bytes.buffer;
    } else if (audioUrl) {
      console.log(`[transcribeAudio] Fazendo download do áudio de: ${audioUrl.slice(0, 100)}...`);
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        console.error(`[transcribeAudio] Falha ao baixar áudio: ${audioResponse.status} ${audioResponse.statusText}`);
        return null;
      }
      audioBuffer = await audioResponse.arrayBuffer();
    } else {
      console.error(`[transcribeAudio] Nenhum audioUrl ou base64Media fornecido.`);
      return null;
    }

    console.log(`[transcribeAudio] Áudio pronto, tamanho: ${audioBuffer.byteLength} bytes`);
    
    // Fallback if Blob constructor in Node drops the filename in FormData
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    const formData = new FormData();
    // Try to construct a File object if available (Node 20+), otherwise fallback to Blob
    if (typeof File !== 'undefined') {
       formData.append("file", new File([audioBlob], "audio.ogg", { type: "audio/ogg" }));
    } else {
       formData.append("file", audioBlob, "audio.ogg");
    }
    
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    console.log("[transcribeAudio] Enviando para OpenAI Whisper...");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[transcribeAudio] Erro na OpenAI: ${res.status} ${res.statusText}`, errorText);
      return null;
    }
    const data = await res.json();
    console.log("[transcribeAudio] Transcrição concluída com sucesso.");
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch (error: any) {
    console.error(`[transcribeAudio] Exceção capturada: ${error.message}`);
    return null;
  }
}

// ─── Análise de imagem / documento com IA ────────────────────────────────────

export async function analyzeMediaWithAI(
  mediaUrl: string,
  mediaType: "image" | "document",
  apiKey: string,
): Promise<string | null> {
  const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

  try {
    const dlRes = await fetch(mediaUrl);
    if (!dlRes.ok) return null;

    const contentLength = dlRes.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_MEDIA_BYTES) return null;

    const buffer = await dlRes.arrayBuffer();
    if (buffer.byteLength > MAX_MEDIA_BYTES) return null;

    const contentType = dlRes.headers.get("content-type") ?? "";
    const isImage = mediaType === "image" || contentType.startsWith("image/");

    const systemPrompt =
      "Você é um assistente jurídico. Analise o conteúdo enviado pelo cliente e descreva de forma clara e objetiva em português brasileiro. Se for um documento jurídico, identifique o tipo, partes envolvidas e pontos principais. Seja conciso — máximo 5 frases.";

    if (isImage) {
      // Imagens: base64 direto no vision
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: [
              { type: "text", text: "Analise esta imagem:" },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ]},
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    }

    // Documentos (PDF, DOCX, etc.): upload via Files API e depois analisa com Responses API
    const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, "documento.pdf");
    form.append("purpose", "user_data");

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!uploadRes.ok) return null;
    const uploaded = await uploadRes.json();
    const fileId = uploaded.id as string;

    // Usa a Responses API (suporta file input)
    const analyzeRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileId },
              { type: "input_text", text: systemPrompt + "\n\nAnalise o documento acima:" },
            ],
          },
        ],
      }),
    });

    // Limpa o arquivo após análise (fire-and-forget)
    fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});

    if (!analyzeRes.ok) return null;
    const analyzed = await analyzeRes.json();
    const text = analyzed.output?.find((o: any) => o.type === "message")
      ?.content?.find((c: any) => c.type === "output_text")?.text;
    return text?.trim() ?? null;

  } catch {
    return null;
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, model: string, messages: AIMessage[], temperature = 0.7): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 500, temperature }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey: string, model: string, messages: AIMessage[], temperature?: number): Promise<string> {
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const chatMessages = messages.filter(m => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemMsg,
      messages: chatMessages,
      ...(temperature !== undefined && { temperature }),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}
