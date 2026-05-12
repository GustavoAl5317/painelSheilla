/**
 * Normaliza o body do webhook (Z-API, Evolution, formatos similares).
 * Retorna null quando o evento não deve ser processado como mensagem de entrada.
 */

type ParsedInbound = {
  phone: string;
  chatLid: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT";
  externalMessageId: string | null;
  fromMe?: boolean;
  audioUrl?: string;
  imageUrl?: string;
  documentUrl?: string;
  documentName?: string;
};

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return null;
}

export function parseWhatsAppWebhookBody(body: Record<string, unknown>): ParsedInbound | { skip: true; reason: string } {
  // Eventos puros de status (entrega, leitura) — nunca contêm conteúdo de mensagem.
  // SentCallback NÃO está aqui porque, em alguns providers (Z-API), ele traz o texto
  // digitado pelo operador no app — o filtro "no_content" abaixo descarta o caso
  // em que é apenas confirmação de envio.
  if (
    body.type === "DeliveredCallback" ||
    body.type === "ReadCallback" ||
    body.type === "MessageStatusCallback"
  ) {
    return { skip: true, reason: "status_event" };
  }

  // fromMe pode aparecer em vários formatos dependendo do provider:
  //   Z-API:     body.fromMe / body.isFromMe
  //   Evolution: body.key.fromMe ou body.data.key.fromMe
  //   Outros:    body.direction = "out" / "OUTBOUND"
  const key = (body.key ?? (body as any).data?.key) as { fromMe?: unknown } | undefined;
  const fromMe =
    body.fromMe === true || body.fromMe === "true" ||
    body.isFromMe === true || body.isFromMe === "true" ||
    key?.fromMe === true || key?.fromMe === "true" ||
    body.direction === "out" ||
    body.direction === "OUTBOUND" ||
    body.type === "SentCallback" ||
    body.type === "sent";

  // Identifica o parceiro de chat (o OUTRO lado da conversa) — sempre o cliente,
  // independente de quem enviou a mensagem.
  //   Z-API:     body.phone é sempre o parceiro (cliente).
  //   Evolution: body.key.remoteJid (ou body.data.key.remoteJid) é o parceiro.
  //   Quando fromMe=true: NUNCA usar body.from / body.sender, que apontam para o
  //   próprio operador — isso criaria uma conversa fantasma com o número dela.
  const dataKey = (body as any).data?.key as { remoteJid?: unknown } | undefined;
  const remoteJid =
    (typeof body.key === "object" && body.key !== null
      ? str((body.key as { remoteJid?: string }).remoteJid)
      : null) ??
    str(dataKey?.remoteJid);

  // chatLid (Z-API) é o identificador estável do chat quando o contato usa
  // privacidade (LID). Guardamos separado do número real para que a UI mostre
  // o telefone (quando disponível) e o sender saiba rotear via @lid.
  // O Z-API pode enviar o LID em body.chatLid OU diretamente em body.phone com sufixo @lid.
  const bodyPhoneRaw = str(body.phone);
  const bodyPhoneIsLid = bodyPhoneRaw?.includes("@lid") ?? false;
  const chatLidRaw = str((body as any).chatLid);
  const remoteJidLid = remoteJid?.includes("@lid") ? remoteJid : null;
  const chatLidFull =
    (chatLidRaw?.includes("@lid") ? chatLidRaw : null) ??
    (bodyPhoneIsLid ? bodyPhoneRaw : null) ??
    remoteJidLid ??
    null;

  // body.phone (Z-API) e remoteJid (Evolution) costumam trazer o número real
  // mesmo em contatos LID. Quando body.phone é o próprio LID, não usa como phoneCandidate.
  const phoneCandidate =
    fromMe
      ? (!bodyPhoneIsLid ? bodyPhoneRaw : null) ?? (remoteJid && !remoteJid.includes("@lid") ? remoteJid : null) ?? str((body as any).to) ?? str((body as any).recipient) ?? str((body as any).chatId)
      : (!bodyPhoneIsLid ? bodyPhoneRaw : null) ?? (remoteJid && !remoteJid.includes("@lid") ? remoteJid : null) ?? str(body.from) ?? str(body.sender);

  const rawPhone = phoneCandidate ?? chatLidFull;

  if (!rawPhone) {
    return { skip: true, reason: "no_phone" };
  }

  // Ignora mensagens de grupos WhatsApp — IA não deve atuar em grupos.
  // IMPORTANTE: @lid (LinkedID) NÃO é grupo — é o formato de privacidade do
  // WhatsApp para chats individuais. Filtrá-lo bloqueia mensagens legítimas
  // do operador (ex.: comando "#" para pausar IA) em contatos com LID ativo.
  // rawPhone com @g.us: Evolution API
  // body.isGroup / body.chatId com @g.us: Z-API
  const chatId = str((body as any).chatId) ?? str((body as any).groupId) ?? str((body as any).remoteJid) ?? "";
  if (
    rawPhone.includes("@g.us") ||
    rawPhone.includes("-group") ||
    chatId.includes("@g.us") ||
    chatId.includes("-group") ||
    body.isGroup === true ||
    body.isGroupMsg === true
  ) {
    return { skip: true, reason: "group_message" };
  }

  // Se sobrou só LID (sem número real disponível), phone fica vazio e a
  // identificação da conversa se dá por chatLid.
  const rawIsLid = rawPhone.includes("@lid");
  const digits = rawPhone.replace(/@.*$/, "").replace(/\D/g, "");

  // IDs de grupo têm muitos dígitos; telefones BR têm no máximo 13 (55+DDD+número).
  // Números com 14+ dígitos sem @lid são provavelmente IDs de grupo/LID sem sufixo.
  if (digits.length > 15) {
    return { skip: true, reason: "group_id_length" };
  }
  if (!rawIsLid && digits.length > 13) {
    return { skip: true, reason: "not_a_valid_phone" };
  }

  // Números BR sem código de país recebem prefixo 55.
  // Normaliza para sempre 13 dígitos (55 + DDD 2 + 9 + número 8) — formato canônico BR.
  // Z-API às vezes envia fromMe com 12 dígitos (sem o 9 extra); adicionamos o 9.
  let normalizedDigits = digits;
  if (!rawIsLid) {
    if (digits.length === 10 || digits.length === 11) {
      normalizedDigits = `55${digits}`;
    }
    // 55 + DDD(2) + 8 dígitos = 12 → insere o 9 após o DDD para ficar 13
    if (normalizedDigits.startsWith("55") && normalizedDigits.length === 12) {
      normalizedDigits = `${normalizedDigits.slice(0, 4)}9${normalizedDigits.slice(4)}`;
    }
  }
  const phone = rawIsLid ? "" : normalizedDigits;
  const chatLid = chatLidFull
    ? `${chatLidFull.replace(/@.*$/, "").replace(/\D/g, "")}@lid`
    : null;

  if (!phone && !chatLid) {
    return { skip: true, reason: "no_phone" };
  }

  const text = body.text;
  const textMessage =
    typeof text === "object" && text !== null && "message" in text
      ? str((text as { message?: unknown }).message)
      : null;

  let content =
    textMessage ??
    str(body.body) ??
    (typeof body.message === "object" && body.message !== null && "conversation" in body.message
      ? str((body.message as { conversation?: unknown }).conversation)
      : null) ??
    "";

  const image = body.image as { caption?: string; imageUrl?: string } | undefined;
  let imageUrl: string | undefined;
  if (image?.imageUrl) {
    imageUrl = image.imageUrl;
    // caption pode ser string vazia — usa placeholder para garantir que não seja ignorado
    if (!content.trim()) content = str(image.caption) || "[Imagem recebida]";
  }

  const video = body.video as { caption?: string; videoUrl?: string } | undefined;
  if (video?.videoUrl && !content.trim()) {
    content = str(video.caption) || "[Vídeo recebido]";
  }

  const doc = body.document as { fileName?: string; documentUrl?: string } | undefined;
  let documentUrl: string | undefined;
  let documentName: string | undefined;
  if (doc?.documentUrl) {
    documentUrl = doc.documentUrl;
    documentName = str(doc.fileName) ?? "arquivo";
    if (!content.trim()) content = `[Documento: ${documentName}]`;
  }

  // Áudio — Z-API: body.audio.audioUrl | body.audio.pttUrl | body.pttUrl
  // Evolution API: body.message.audioMessage.url | body.message.pttMessage.url
  let audioUrl: string | undefined;
  if (!content) {
    const audio = body.audio as { audioUrl?: string; pttUrl?: string } | undefined;
    const pttUrl = str((body as any).pttUrl);
    const evAudio = (body.message as any)?.audioMessage?.url ?? (body.message as any)?.pttMessage?.url;
    audioUrl = str(audio?.audioUrl) ?? str(audio?.pttUrl) ?? pttUrl ?? str(evAudio) ?? undefined;
    content = audioUrl ? "[Áudio recebido]" : "";
  }

  if (!content?.trim()) {
    return { skip: true, reason: "no_content" };
  }

  const isAudio = !!(audioUrl || body.type === "audio" || body.type === "ptt");
  const isImage = !isAudio && (body.type === "image" || !!imageUrl);
  const isDocument = !isAudio && !isImage && (body.type === "document" || !!documentUrl);
  const externalMessageId = str(body.messageId) ?? (typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : null);

  return {
    phone,
    chatLid,
    content: content.trim(),
    messageType: isAudio ? "AUDIO" : isDocument ? "DOCUMENT" : isImage ? "IMAGE" : "TEXT",
    externalMessageId,
    fromMe,
    audioUrl,
    imageUrl,
    documentUrl,
    documentName,
  };
}
