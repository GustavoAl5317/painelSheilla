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

  let responseContent = "";

  if (config.provider === "openai") {
    responseContent = await callOpenAI(config.apiKey, config.model, messages);
  } else if (config.provider === "anthropic") {
    responseContent = await callAnthropic(config.apiKey, config.model, messages);
  }

  const shouldTransfer =
    config.transferKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase())) ||
    responseContent.includes("[TRANSFERIR_PARA_HUMANO]");

  // Remove a tag interna da resposta antes de enviar ao lead
  const cleanContent = responseContent.replace("[TRANSFERIR_PARA_HUMANO]", "").trim();

  const qualifiedData = extractQualifiedData(history, userMessage);

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

// ─── Extração estruturada de dados do histórico ───────────────────────────────

function extractQualifiedData(
  history: AIMessage[],
  userMessage: string
): AIResponse["qualifiedData"] {
  // Apenas mensagens do usuário (lead)
  const userTexts = history.filter(m => m.role === "user").map(m => m.content);
  userTexts.push(userMessage);
  const allUserText = userTexts.join(" ");
  const allText = [...history.map(m => m.content), userMessage].join(" ");

  // Nome — padrões comuns em pt-BR
  const namePatterns = [
    /meu nome[^\w]{0,5}(?:é|e)\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})*)/i,
    /me chamo\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})*)/i,
    /pode(?:m)?\s+me chamar de\s+([A-ZÀ-Úa-zà-ú]{2,})/i,
    /sou\s+(?:o|a)\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})*)/i,
    /chamo[^\w]{0,5}([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})*)/i,
  ];
  let name: string | undefined;
  for (const pattern of namePatterns) {
    const m = allUserText.match(pattern);
    if (m) { name = titleCase(m[1]); break; }
  }

  // E-mail
  const emailMatch = allUserText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

  // CPF
  const cpfMatch = allUserText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/\D/g, "") : undefined;

  // Telefone (exclui o número de origem da conversa)
  const phoneMatch = allUserText.match(/(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/);

  // Área jurídica
  const LEGAL_AREAS: Record<string, string> = {
    trabalhista: "Direito Trabalhista",
    família: "Direito de Família",
    familiar: "Direito de Família",
    civil: "Direito Civil",
    criminal: "Direito Criminal",
    penal: "Direito Criminal",
    previdenciário: "Direito Previdenciário",
    previdencia: "Direito Previdenciário",
    inss: "Direito Previdenciário",
    tributário: "Direito Tributário",
    fiscal: "Direito Tributário",
    empresarial: "Direito Empresarial",
    imobiliário: "Direito Imobiliário",
    consumidor: "Direito do Consumidor",
    divórcio: "Direito de Família",
    divorcio: "Direito de Família",
    herança: "Direito de Família",
    heranca: "Direito de Família",
    demissão: "Direito Trabalhista",
    demissao: "Direito Trabalhista",
    aposentadoria: "Direito Previdenciário",
  };
  const lowerAll = allText.toLowerCase();
  let legalArea: string | undefined;
  for (const [keyword, area] of Object.entries(LEGAL_AREAS)) {
    if (lowerAll.includes(keyword)) { legalArea = area; break; }
  }

  // Resumo — mensagem mais longa do usuário (proxy para a descrição do problema)
  const caseSummary = [...userTexts]
    .sort((a, b) => b.length - a.length)[0]
    ?.slice(0, 500);

  // Score de qualificação (0–100)
  let score = 0;
  if (name)                            score += 25;
  if (phoneMatch)                      score += 20;
  if (emailMatch)                      score += 15;
  if (legalArea)                       score += 25;
  if (caseSummary && caseSummary.length > 30) score += 15;

  return {
    name,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    cpf,
    legalArea,
    caseSummary,
    score,
  };
}

function titleCase(str: string) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
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
