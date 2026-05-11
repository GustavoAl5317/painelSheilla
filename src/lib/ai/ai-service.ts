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

/** Lead frio (primeiro contato) vs conversa que já vem de um diálogo (WhatsApp com histórico / retorno). */
export type LeadChatMode = "cold" | "established";

export interface LeadProgress {
  name?: string;
  email?: string;
  legalArea?: string;
  caseSummary?: string;
}

export async function runAIChat(
  config: AIServiceConfig,
  history: AIMessage[],
  userMessage: string,
  options?: { clientContext?: string; leadMode?: LeadChatMode; hasMedia?: boolean; operatorIntervened?: boolean; leadProgress?: LeadProgress }
): Promise<AIResponse> {
  const { clientContext, leadMode = "cold", hasMedia = false, operatorIntervened = false, leadProgress } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, leadMode, hasMedia, operatorIntervened, leadProgress) },
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

function buildSystemPrompt(base: string, clientContext: string | undefined, leadMode: LeadChatMode, hasMedia = false, operatorIntervened = false, leadProgress?: LeadProgress): string {
  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nSe o cliente perguntar sobre seu processo ou movimentações, use as informações acima para responder de forma clara e sem jargão jurídico. Nunca invente informações além do que está listado acima.`
    : `\n\n--- CONTEXTO ---\nVocê NÃO tem informações cadastradas sobre esta pessoa. Se ela fizer referência a conversas, casos ou acordos anteriores que você não conhece, seja transparente: diga que você é o atendimento virtual e não tem acesso ao histórico anterior, e que a equipe do escritório poderá ajudá-la com isso.`;

  const mediaInstruction = hasMedia
    ? "\n- IMPORTANTE: O cliente enviou uma imagem ou documento. O conteúdo já foi extraído e está na mensagem abaixo entre colchetes. Use essas informações para responder diretamente — não diga que não consegue ver arquivos."
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

ENCAMINHAMENTO OBRIGATÓRIO À ADVOGADA — ABSOLUTO:
- Qualquer pedido de AGENDAMENTO (consulta, reunião, ligação, visita, horário) → NÃO marque, NÃO confirme, NÃO sugira data/horário. Responda: "Vou encaminhar seu pedido para a Dra. Sheila, que retornará pelo WhatsApp para tratar disso." e inclua [TRANSFERIR_PARA_HUMANO] no final.
- Qualquer assunto de PAGAMENTO (formas de pagar, comprovantes, pix, boleto, parcelamento, atraso, recibo) → NÃO trate, NÃO informe dados bancários, NÃO confirme recebimento. Responda: "Pagamentos são tratados diretamente com a Dra. Sheila. Vou encaminhar para ela retornar por aqui." e inclua [TRANSFERIR_PARA_HUMANO] no final.
- Qualquer NEGOCIAÇÃO DE VALORES (honorários, preço da causa, descontos, valor de acordo, percentual, proposta) → NÃO negocie, NÃO cite valores, NÃO faça contraproposta. Responda: "Valores e honorários são tratados pessoalmente pela Dra. Sheila. Vou encaminhar para ela retornar por aqui." e inclua [TRANSFERIR_PARA_HUMANO] no final.`;

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS (cliente cadastrado):
- Este é um cliente existente do escritório. Trate-o com prioridade e pelo nome.
- Na PRIMEIRA resposta da conversa, use saudação curta e direta pelo nome (ex.: "Olá, [primeiro nome]! Como posso ajudar você hoje?"). NÃO se apresente nem mencione áreas do escritório — o cliente já conhece o escritório. NUNCA se identifique como "assistente virtual", "IA" ou "robô".
- Responda APENAS com base nos dados listados acima. Se a informação não estiver lá, não invente.
- NUNCA forneça parecer jurídico, prometa resultados ou invente informações além do que está registrado.
- NUNCA marque consultas, reuniões, ligações ou confirme horários — diga que a equipe entrará em contato pelo WhatsApp.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais (RG, CPF, CTPS, comprovantes).
- NUNCA pergunte se o cliente já tem advogado.
- NUNCA pergunte se o caso é urgente, qual o nível de urgência ou se há pressa — nem isoladamente, nem junto com outra pergunta.
- Se o cliente precisar de atendimento urgente ou quiser falar com a equipe jurídica, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : leadMode === "established"
      ? `\nINSTRUÇÕES OBRIGATÓRIAS (conversa em andamento):
- Analise o histórico e identifique quais etapas do FLUXO ainda NÃO foram concluídas (nome, e-mail, área, situação).
- Retome exatamente pela próxima etapa pendente. NÃO repita etapas já concluídas.
- Se ainda não coletou nome, e-mail, área ou situação, colete agora — mesmo que a conversa seja antiga.
- Se a pessoa estiver divagando sobre assuntos pessoais sem relação com o caso, reconheça em UMA frase e redirecione imediatamente para a próxima etapa pendente da triagem.
- NUNCA fique apenas validando ou ecoando o que a pessoa disse sem avançar na triagem.
- Ao concluir todas as etapas, encerre com a mensagem de registro e inclua [TRIAGEM COMPLETA] no final.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais (RG, CPF, CTPS, comprovantes).
- NUNCA pergunte se o cliente já tem advogado.
- NUNCA pergunte se o caso é urgente, qual o nível de urgência ou se há pressa — nem isoladamente, nem junto com outra pergunta (ex.: ao perguntar cidade/estado, NÃO acrescente "há alguma urgência?").
- Se o lead solicitar falar com humano ou advogado, inclua exatamente [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, empático e profissional.`
      : `\nINSTRUÇÕES OBRIGATÓRIAS (primeiro contato — triagem inicial):
- PRIMEIRA RESPOSTA da conversa (quando você ainda não enviou nenhuma mensagem no histórico): apresente o ESCRITÓRIO OBRIGATORIAMENTE, em UMA única mensagem curta. Modelo:
  "Olá! Aqui é do escritório da Dra. Sheila Araújo, que atua em Direito Previdenciário e Trabalhista. Para começarmos, qual é o seu nome completo?"
  Adapte levemente conforme a saudação do cliente (bom dia/boa tarde/boa noite), mas SEMPRE inclua: (a) identificação como sendo do escritório da Dra. Sheila Araújo, (b) menção das áreas (Previdenciário e Trabalhista) e (c) a primeira pergunta do FLUXO (nome).
- PROIBIDO se identificar como "assistente virtual", "IA", "robô", "atendimento automático" ou termos equivalentes na apresentação. Fale em nome do escritório, sem se rotular.
- NUNCA responda apenas "Boa tarde! Como posso ajudar você hoje?" ou variações genéricas no primeiro contato — sem apresentação do escritório, está proibido.
- Siga o FLUXO definido acima, uma etapa por vez. Nunca pule etapas nem junte perguntas.
- Se a pessoa estiver divagando sobre assuntos pessoais sem relação com o caso, reconheça brevemente e redirecione com firmeza e cordialidade para a próxima etapa da triagem.
- NUNCA fique apenas validando ou ecoando o que a pessoa disse sem avançar na coleta de dados.
- Ao concluir a triagem (nome + e-mail + área + situação coletados), encerre com a mensagem de registro e inclua [TRIAGEM COMPLETA] no final.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais (RG, CPF, CTPS, comprovantes).
- NUNCA pergunte se o cliente já tem advogado.
- NUNCA pergunte se o caso é urgente, qual o nível de urgência ou se há pressa — nem isoladamente, nem junto com outra pergunta (ex.: ao perguntar cidade/estado, NÃO acrescente "há alguma urgência?"). A triagem da urgência é responsabilidade da equipe humana.
- NUNCA forneça orientação jurídica, parecer ou opinião sobre viabilidade do caso.
- NUNCA marque consultas, reuniões, ligações ou confirme horários.
- Se o lead solicitar falar com humano ou advogado, inclua exatamente [TRANSFERIR_PARA_HUMANO] no final.
- Responda sempre em português brasileiro, de forma empática e profissional.`;

  const operatorNote = operatorIntervened
    ? "\n\nNOTA IMPORTANTE: Um atendente humano do escritório já respondeu esta conversa anteriormente. Não repita nem retome o que o humano tratou. Continue normalmente a partir da última mensagem do cliente."
    : "";

  const collected: string[] = [];
  if (leadProgress?.name)       collected.push(`- NOME: ${leadProgress.name} (JÁ COLETADO — NÃO pergunte de novo)`);
  if (leadProgress?.email)      collected.push(`- E-MAIL: ${leadProgress.email} (JÁ COLETADO — NÃO pergunte de novo)`);
  if (leadProgress?.legalArea)  collected.push(`- ÁREA: ${leadProgress.legalArea} (JÁ IDENTIFICADA — NÃO pergunte de novo qual a área/assunto)`);
  if (leadProgress?.caseSummary) collected.push(`- SITUAÇÃO: já descrita — NÃO peça para repetir.`);

  const progressNote = collected.length
    ? `\n\n--- DADOS JÁ COLETADOS NESTA CONVERSA ---\n${collected.join("\n")}\n\nREGRA: Pule TODAS as etapas do FLUXO cujos dados aparecem acima. Avance direto para a próxima etapa pendente. Se TODAS estiverem coletadas, encerre com a mensagem de registro e [TRIAGEM COMPLETA]. Também considere uma etapa concluída se a informação aparece de forma clara no histórico (ex.: o cliente menciona BPC/LOAS, INSS, aposentadoria → área Previdenciária já identificada).`
    : `\n\nREGRA ADICIONAL: Antes de perguntar nome, e-mail, área ou situação, releia o histórico desta conversa. Se o cliente já forneceu a informação em qualquer mensagem anterior (mesmo de passagem, ex.: "seria BPC/LOAS", "é sobre rescisão"), considere a etapa concluída e siga para a próxima.`;

  return `${base}${clientSection}${antiHallucination}${instructions}${mediaInstruction}${operatorNote}${progressNote}`;
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
      const base64 = Buffer.from(buffer).toString("base64");
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
