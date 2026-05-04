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
  options?: { clientContext?: string; leadMode?: LeadChatMode; hasMedia?: boolean }
): Promise<AIResponse> {
  const { clientContext, leadMode = "cold", hasMedia = false } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, leadMode, hasMedia) },
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

function buildSystemPrompt(base: string, clientContext: string | undefined, leadMode: LeadChatMode, hasMedia = false): string {
  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nSe o cliente perguntar sobre seu processo ou movimentações, use as informações acima para responder de forma clara e sem jargão jurídico. Nunca invente informações além do que está listado acima.`
    : "";

  const mediaInstruction = hasMedia
    ? "\n- IMPORTANTE: O cliente enviou uma imagem ou documento. O conteúdo já foi extraído e está na mensagem abaixo entre colchetes. Use essas informações para responder diretamente — não diga que não consegue ver arquivos."
    : "";

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS:
- Este é um cliente existente do escritório. Trate-o com prioridade e pelo nome.
- Você pode informar sobre processos e movimentações usando os dados acima.
- Nunca forneça parecer jurídico, prometa resultados ou invente informações além do que está registrado.
- Nunca marque consultas, reuniões, ligações ou confirme horários — diga que a equipe entrará em contato pelo WhatsApp.
- Se o cliente precisar de atendimento urgente ou quiser falar com a equipe jurídica, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : leadMode === "established"
      ? `\nINSTRUÇÕES OBRIGATÓRIAS (conversa em andamento — não é primeiro contato no WhatsApp):
- Esta pessoa **já está em contato** com o escritório; pode haver histórico de mensagens acima. **Não** inicie um cadastro forçado como se fosse a primeira conversa.
- Responda educadamente ao que ela perguntou sem reiniciar a triagem do zero, a não ser que faltem dados essenciais.
- Nunca prometa resultado, parecer jurídico definitivo, horário, data ou valores. Se precisar de dado concreto que não está no histórico, diga que a equipe retornará pelo WhatsApp e use [TRANSFERIR_PARA_HUMANO] se for urgente.
- Se o caso não for Trabalhista, Acidente de Trabalho ou Previdenciário/INSS, informe educadamente que o escritório não atua nessa área.
- Responda em português brasileiro, empático e profissional, máximo 3 frases.`
      : `\nINSTRUÇÕES OBRIGATÓRIAS (primeiro contato — lead frio):
- Nunca forneça orientação jurídica específica ou parecer sobre o mérito do caso.
- Se o assunto NÃO for Trabalhista, Acidente de Trabalho ou Previdenciário/INSS, informe que o escritório não atua nessa área e oriente a procurar profissional especializado. Não prossiga com triagem.
- Colete as seguintes informações nesta ordem: nome completo, motivo do contato, área do problema e um breve resumo.
- Se o cliente ainda não informou o nome, pergunte o nome antes de qualquer outra coisa. Nunca assuma ou invente o nome.
- Nunca marque consultas, reuniões, ligações ou confirme horários. Diga que a equipe jurídica retornará pelo WhatsApp.
- Nunca informe valores ou honorários.
- Quando tiver nome + área compatível + resumo, informe que a equipe jurídica irá analisar e retornar pelo WhatsApp.
- Se o lead solicitar falar com humano ou advogado, inclua exatamente [TRANSFERIR_PARA_HUMANO] no final da sua resposta.
- Responda sempre em português brasileiro, de forma empática e profissional.
- Seja conciso — máximo 3 frases por resposta.`;

  return `${base}${clientSection}${instructions}${mediaInstruction}`;
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

  const systemPrompt = `Você é um extrator de dados de conversas jurídicas. Analise o histórico e retorne APENAS um JSON válido.

REGRAS CRÍTICAS:
- Só preencha "name" se o cliente disse o próprio nome de forma explícita e direta (ex: "me chamo Ana", "sou o Carlos", "meu nome é..."). NUNCA infira, suponha ou invente um nome.
- Se o nome não foi dito claramente, omita o campo "name" completamente.
- Só preencha "legalArea" se o tipo do problema jurídico ficou claro na conversa.
- Só preencha "caseSummary" se há informações suficientes para um resumo real.

Campos possíveis (omita os que não tiver certeza):
{
  "name": "nome exato como o cliente disse",
  "phone": "telefone alternativo informado pelo cliente",
  "legalArea": "Direito Trabalhista | Direito de Família | Direito Civil | Direito Criminal | Direito Previdenciário | Direito Tributário | Direito Empresarial | Direito Imobiliário | Direito do Consumidor",
  "caseSummary": "resumo objetivo em 1-2 frases",
  "score": número 0-100 (nome+área+resumo completos = 100)
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

// ─── Análise de imagem / documento com IA ────────────────────────────────────

export async function analyzeMediaWithAI(
  mediaUrl: string,
  mediaType: "image" | "document",
  apiKey: string,
): Promise<string | null> {
  try {
    const dlRes = await fetch(mediaUrl);
    if (!dlRes.ok) return null;

    const buffer = await dlRes.arrayBuffer();
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
