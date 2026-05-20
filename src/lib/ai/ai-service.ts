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

export const UNCLEAR_CONTEXT_FALLBACK_REPLY =
  "Olá! Recebi sua mensagem Nossa equipe já foi notificada e a equipe da Dra Sheila Araújo responderá em breve.";

/** Respostas típicas quando o modelo “não entende” e pede dados em vez de encaminhar. */
function replySoundsLikeContextConfusion(assistantReply: string): boolean {
  const t = assistantReply.toLowerCase();
  return (
    /não consegui identificar|nao consegui identificar|não consigo identificar|nao consigo identificar/.test(t) ||
    /não consegui entender|nao consegui entender/.test(t) ||
    /novo caso ou.*atendimento anterior|atendimento anterior.*novo caso/i.test(assistantReply) ||
    (/atendimento anterior/.test(t) && /nome completo/.test(t)) ||
    (/poderia me informar/.test(t) && (/nome completo/.test(t) || /seu nome/i.test(t))) ||
    /em contato referente a um novo caso/i.test(t)
  );
}

export function shouldUseUnclearContextFallbackReply(
  clientContext: string | undefined,
  assistantReply: string
): boolean {
  if (clientContext) return false;
  return replySoundsLikeContextConfusion(assistantReply);
}

export async function runAIChat(
  config: AIServiceConfig,
  history: AIMessage[],
  userMessage: string,
  options?: { clientContext?: string; hasMedia?: boolean; operatorIntervened?: boolean; contactName?: string }
): Promise<AIResponse> {
  const { clientContext, hasMedia = false, operatorIntervened = false, contactName } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, hasMedia, operatorIntervened, contactName) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Roda resposta ao cliente e extração de dados em paralelo
  const [responseContent, qualifiedData] = await Promise.all([
    config.provider === "openai"
      ? callOpenAI(config.apiKey, config.model, messages)
      : callAnthropic(config.apiKey, config.model, messages),
    extractQualifiedDataWithAI(config.apiKey, config.provider, config.model, history, userMessage),
  ]);

  const shouldTransfer =
    config.transferKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase())) ||
    responseContent.includes("[TRANSFERIR_PARA_HUMANO]");

  const triageComplete = responseContent.includes("[TRIAGEM COMPLETA]");

  let cleanContent = responseContent
    .replace("[TRANSFERIR_PARA_HUMANO]", "")
    .replace("[TRIAGEM COMPLETA]", "")
    .trim();

  let finalShouldTransfer = shouldTransfer;
  if (shouldUseUnclearContextFallbackReply(clientContext, cleanContent)) {
    cleanContent = UNCLEAR_CONTEXT_FALLBACK_REPLY;
    finalShouldTransfer = true;
  }

  return {
    content: cleanContent,
    shouldTransferToHuman: finalShouldTransfer,
    triageComplete,
    qualifiedData,
  };
}

function buildSystemPrompt(base: string, clientContext: string | undefined, hasMedia = false, operatorIntervened = false, contactName?: string): string {
  const handoffNoContextRule = `
REGRA OBRIGATÓRIA — SEM CONTEXTO / CONTINUAÇÃO FORA DO HISTÓRICO:
- O WhatsApp pode ter mensagens antigas que NÃO aparecem neste histórico. Se a mensagem do cliente parece retorno (documentos, assinatura, "bom dia Dra", agradecimentos de etapa concluída etc.) e você não consegue alinhar com segurança ao fluxo ou aos dados acima, NÃO peça "nome completo", NÃO pergunte se é "novo caso ou atendimento anterior" e NÃO diga que "não consegui identificar".
- Nessa situação responda APENAS com a frase exata: "${UNCLEAR_CONTEXT_FALLBACK_REPLY}" e inclua [TRANSFERIR_PARA_HUMANO] no final, sem mais nenhuma palavra.`;

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

- NUNCA pule esse menu na primeira interação. NUNCA pergunte CPF ou número de processo — você já tem o cadastro dele.
- Só avance para resposta sobre processo APÓS o cliente escolher a opção 3.
- Se o cliente cumprimentar de novo no meio da conversa ("Olá", "Oi") e o assunto anterior já terminou, repita o menu.
- Se o cliente pedir explicitamente "quais são as opções" ou "o que você faz", repita o menu.`
    : "";

  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nREGRA OBRIGATÓRIA PARA CLIENTES CADASTRADOS:
- Este cliente JÁ ESTÁ CADASTRADO. NUNCA peça CPF nem número de processo.
- Use o PRIMEIRO NOME do cliente (do campo "Nome" acima) na saudação do menu.
- SOMENTE quando o cliente escolher a opção 3 do menu (andamento do processo), responda usando os dados da seção "Histórico de movimentações e atualizações do processo" acima.
- NUNCA invente, deduza ou parafraseie movimentações que não estejam EXPLICITAMENTE listadas no histórico acima. Cite a movimentação como está registrada.
- Se o histórico estiver vazio ("Nenhuma movimentação registrada"), responda: "Não tenho movimentações registradas no sistema ainda. A equipe do escritório poderá verificar isso para você." e inclua [TRANSFERIR_PARA_HUMANO] no final.
- NUNCA responda com mensagens genéricas como "as informações estão sendo verificadas" quando houver histórico disponível acima.
- Se o cliente escolher opção 1, 2 ou 4, siga as regras do menu acima (a opção 3 é apenas para andamento de processo).
- Responda em linguagem simples, sem jargão jurídico. Máximo 3 frases.`
    : `\n\n--- CONTEXTO ---\nVocê NÃO tem cadastro completo desta pessoa neste painel. Faça a triagem na ordem: nome → e-mail → menu de áreas (UMA pergunta por vez).\n- NÃO mostre o menu de 4 opções antes de coletar nome e e-mail.\n- Se ela fizer referência a conversas ou etapas que não aparecem no histórico acima, não tente adivinhar.\n- Se a pessoa escolher a opção 3 do menu (andamento de processo) depois da triagem, peça o CPF para localizar o processo.${handoffNoContextRule}`;

  const mediaInstruction = hasMedia
    ? "\n- IMPORTANTE: O cliente enviou uma imagem ou documento. O conteúdo já foi extraído e está na mensagem abaixo entre colchetes. Use essas informações para responder diretamente — não diga que não consegue ver arquivos.\n- REGRA CRÍTICA: Se o documento for um COMPROVANTE DE PAGAMENTO ou TRANSFERÊNCIA BANCÁRIA, você deve responder APENAS com a frase exata: \"Olá! Recebi sua mensagem Nossa equipe já foi notificada e a doutora responderá em breve.\" e incluir [TRANSFERIR_PARA_HUMANO] no final, sem mais nenhuma palavra ou pergunta."
    : "";

  const antiHallucination = `
REGRA DE RITMO — ABSOLUTA:
- Envie APENAS UMA mensagem curta por vez. Faça UMA pergunta, aguarde a resposta, depois avance.
- NUNCA faça duas perguntas na mesma mensagem.
- NUNCA antecipe respostas do cliente nem pule etapas.
- Máximo 3 frases por mensagem.

REGRAS ANTI-ALUCINAÇÃO — ABSOLUTAS:
- NUNCA invente, suponha ou deduza informações que o cliente não disse explicitamente nesta conversa.
- NUNCA confirme, repita ou valide dados (nome, processo, benefício, datas, valores, decisões) que não estejam no histórico desta conversa ou nos dados do cliente acima.
- Se não sabe algo, diga exatamente: "Não tenho essa informação. A equipe do escritório poderá verificar isso para você."
- NUNCA complete frases do cliente com suposições. Pergunte se precisar confirmar.
- NUNCA mencione leis, artigos, jurisprudências ou prazos específicos — isso é parecer jurídico.
- NUNCA pergunte se há urgência, se o caso é urgente, se precisa com urgência, nem use "urgência", "urgente" ou "rápido" em perguntas ao cliente.
- NUNCA pergunte sobre prazos processuais, vencimento ou "quanto tempo falta" só para saber se o caso é urgente ou prioritário.
- Se o próprio cliente pedir humano ou equipe jurídica, inclua [TRANSFERIR_PARA_HUMANO] no final, sem comentar sobre urgência.

REGRA PARA OFERTAS DE SERVIÇO E PARCERIAS:
- Se a mensagem for de alguém oferecendo serviços, propondo parcerias, vendendo algo ou buscando emprego, responda APENAS com a exata frase: "Este número é exclusivo para atendimentos de clientes, favor encaminhar a proposta ao e-mail sheilaaraujoadv@sheilaaraujoadv.com que será respondido oportunamente." e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.

REGRA PARA OPÇÃO OUTROS ASSUNTOS:
- Se o cliente escolher a opção "3 - Outros assuntos" ou informar que o assunto não é Trabalhista nem Previdenciário, responda APENAS com a exata frase: "Envie uma mensagem, por ESCRITO ou ÁUDIO, explicando o MOTIVO DO SEU CONTATO e logo retornaremos seu chamado" e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.`;

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS (cliente cadastrado):
- Este é um cliente existente do escritório. Trate-o com cordialidade pelo PRIMEIRO NOME do campo "Nome" acima.
- Na PRIMEIRA mensagem (ou retomada após "Olá"/"Oi"), apresente o menu obrigatório de 4 opções definido em "SAUDAÇÃO INICIAL OBRIGATÓRIA". NUNCA pule essa saudação para responder direto sobre processo.
- Só responda sobre andamento de processo APÓS o cliente escolher a opção 3.
- Responda APENAS com base nos dados listados acima. Se a informação não estiver lá, não invente.
- NUNCA forneça parecer jurídico, prometa resultados ou invente informações além do que está registrado.
- NUNCA marque consultas, reuniões, ligações ou confirme horários — diga que a equipe entrará em contato pelo WhatsApp.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais, CPF ou senhas por conta própria. Porém, se o cliente enviar esses dados voluntariamente, apenas agradeça e guarde a informação sem dizer que não pode coletar.
- NUNCA pergunte se o cliente já tem advogado.
- Se o cliente quiser falar com a equipe jurídica ou pedir atendimento humano, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : `\nINSTRUCOES OBRIGATORIAS (NAO cadastrado — triagem):
- Analise o historico e identifique quais etapas ja foram concluidas: nome completo, e-mail, area, situacao.
- SEMPRE termine sua mensagem com a proxima etapa pendente. NUNCA use "Como posso ajudar?", "Em que posso ajudar?", "Como posso te ajudar?", "Como posso ajuda-lo?" ou qualquer variacao generica em NENHUMA parte da mensagem.
- ETAPA 1 — NOME: ${firstNameForGreeting ? `O nome do contato do WhatsApp e "${firstNameForGreeting}". Considere esta etapa CONCLUIDA e va diretamente para a ETAPA 2.` : "Se nao ha nome no historico, termine sua mensagem perguntando APENAS o nome completo. Nada mais."}
- ETAPA 2 — EMAIL: Se ja tem nome mas nao tem e-mail, termine sua mensagem pedindo APENAS o e-mail. Exemplo de abertura: "Ola${firstNameForGreeting ? `, ${firstNameForGreeting}` : ""}! Para registrar o atendimento, pode me informar seu e-mail?"
- ETAPA 3 — MENU: Se ja tem nome E e-mail, apresente EXATAMENTE:\n"Para que eu possa direcionar voce ao profissional adequado, sobre qual dos assuntos voce busca orientacao?\n\n1. Previdenciario (aposentadoria, auxilio-doenca, BPC, etc.)\n2. Trabalhista (rescisao, horas extras, assedio, vinculo empregaticio, acidente de trabalho, etc.)\n3. Sou cliente do escritorio e gostaria de saber o andamento do meu processo\n4. Outros assuntos"
- ETAPA 4 — SITUACAO: Apos a escolha, peca a situacao conforme o modulo. Se opcao 3, peca CPF.
- Qualquer que seja a mensagem do cliente (cumprimento, pergunta, divagacao), SEMPRE termine com a proxima etapa pendente.
- Ao concluir (nome + e-mail + area + situacao), encerre com mensagem de registro e inclua [TRIAGEM COMPLETA].
- NUNCA forneca orientacao juridica ou garanta resultados.
- Se solicitar humano, inclua [TRANSFERIR_PARA_HUMANO] no final.`;

  const operatorNote = operatorIntervened
    ? "\n\nNOTA IMPORTANTE: Um atendente humano do escritório já respondeu esta conversa anteriormente. Não repita nem retome o que o humano tratou. Continue normalmente a partir da última mensagem do cliente."
    : "";

  return `${base}${clientSection}${menuGreetingRule}${antiHallucination}${instructions}${mediaInstruction}${operatorNote}`;
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
- Só preencha "caseSummary" se há informações suficientes para um resumo real.

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
    const raw = provider === "openai"
      ? await callOpenAI(apiKey, model, messages)
      : await callAnthropic(apiKey, model, messages);

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
export async function transcribeAudio(audioUrl: string, apiKey: string): Promise<string | null> {
  try {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) return null;

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch {
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

async function callOpenAI(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const chatMessages = messages.filter(m => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 500, system: systemMsg, messages: chatMessages }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}
