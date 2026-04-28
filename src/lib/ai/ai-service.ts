export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  shouldTransferToHuman: boolean;
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

export async function runAIChat(
  config: AIServiceConfig,
  history: AIMessage[],
  userMessage: string,
  options?: { clientContext?: string; leadMode?: LeadChatMode }
): Promise<AIResponse> {
  const { clientContext, leadMode = "cold" } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, leadMode) },
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

  const cleanContent = responseContent.replace("[TRANSFERIR_PARA_HUMANO]", "").trim();

  return {
    content: cleanContent,
    shouldTransferToHuman: shouldTransfer,
    qualifiedData,
  };
}

function buildSystemPrompt(base: string, clientContext: string | undefined, leadMode: LeadChatMode): string {
  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nSe o cliente perguntar sobre seu processo ou movimentações, use as informações acima para responder de forma clara e sem jargão jurídico. Nunca invente informações além do que está listado acima.`
    : "";

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS:
- Este é um cliente existente do escritório. Trate-o com prioridade e pelo nome.
- Você pode informar sobre processos e movimentações usando os dados acima.
- Nunca forneça parecer jurídico ou prometa resultados.
- Se o cliente precisar de atendimento urgente ou quiser falar com o advogado, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : leadMode === "established"
      ? `\nINSTRUÇÕES OBRIGATÓRIAS (conversa em andamento — não é primeiro contato no WhatsApp):
- Esta pessoa **já está em contato** com o escritório; pode haver histórico de mensagens acima. **Não** inicie um cadastro forçado pedindo "nome, telefone e e-mail" como se fosse a primeira conversa.
- Responda educadamente ao que ela perguntou (cobranças, valores, retorno, etc.) sem pedir ficha de lead do zero, a não ser que ela mesma ofereça dados que faltem.
- Não dê promessa de resultado nem parecer jurídico definitivo. Se precisar de dado concreto do processo (valores, datas, o que o advogado combinou) que você não vê no histórico, diga que a equipe / o advogado retornará com a informação e use [TRANSFERIR_PARA_HUMANO] se for urgente ou pessoal.
- Se o tom for cumprimento ("bom dia, Dra.") ou pergunta sobre andamento, acolha e oriente; não recomece qualificação de lead.
- Responda em português brasileiro, empático e profissional, máximo 3 frases.`
      : `\nINSTRUÇÕES OBRIGATÓRIAS:
- Nunca forneça orientação jurídica específica ou parecer sobre o mérito do caso.
- Colete as seguintes informações nesta ordem: nome completo, telefone, e-mail, área jurídica do problema e um breve resumo do caso.
- Quando tiver nome + telefone + área jurídica, informe que um advogado entrará em contato em breve.
- Se o lead solicitar falar com um humano ou advogado urgente, inclua exatamente [TRANSFERIR_PARA_HUMANO] no final da sua resposta.
- Responda sempre em português brasileiro, de forma empática e profissional.
- Seja conciso — máximo 3 frases por resposta.`;

  return `${base}${clientSection}${instructions}`;
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

  // CPF e e-mail são mais confiáveis via regex — mantém para não desperdiçar tokens
  const cpfMatch = allUserText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/\D/g, "") : undefined;
  const emailMatch = allUserText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

  const systemPrompt = `Você é um extrator de dados de conversas jurídicas. Analise o histórico e retorne APENAS um JSON válido com estes campos (omita os que não encontrar):
{
  "name": "nome completo do cliente (apenas se mencionado explicitamente)",
  "phone": "telefone alternativo informado pelo cliente (não o número do WhatsApp dele)",
  "legalArea": "uma das opções: Direito Trabalhista | Direito de Família | Direito Civil | Direito Criminal | Direito Previdenciário | Direito Tributário | Direito Empresarial | Direito Imobiliário | Direito do Consumidor",
  "caseSummary": "resumo objetivo do problema jurídico em 1-2 frases",
  "score": número de 0 a 100 representando o quanto o lead está qualificado (nome+área+resumo = 100)
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
      email: emailMatch?.[0],
      cpf,
      legalArea: parsed.legalArea || undefined,
      caseSummary: parsed.caseSummary || undefined,
      score: typeof parsed.score === "number" ? parsed.score : 0,
    };
  } catch {
    // Fallback sem IA: pelo menos garante CPF e email
    return { cpf, email: emailMatch?.[0], score: 0 };
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
