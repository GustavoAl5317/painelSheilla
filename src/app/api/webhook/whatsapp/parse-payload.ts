/**
 * Normaliza o body do webhook (Z-API, Evolution, formatos similares).
 * Retorna null quando o evento não deve ser processado como mensagem de entrada.
 */

type ParsedInbound = {
  phone: string;
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

  const rawPhone =
    str(body.phone) ??
    str(body.from) ??
    str(body.sender) ??
    (typeof body.key === "object" && body.key !== null
      ? str((body.key as { remoteJid?: string }).remoteJid)
      : null);

  if (!rawPhone) {
    return { skip: true, reason: "no_phone" };
  }

  // Ignora mensagens de grupos WhatsApp — IA não deve atuar em grupos
  // rawPhone com @g.us: Evolution API
  // body.isGroup / body.chatId com @g.us: Z-API
  const chatId = str((body as any).chatId) ?? str((body as any).groupId) ?? str((body as any).remoteJid) ?? "";
  if (
    rawPhone.includes("@g.us") ||
    rawPhone.includes("-group") ||
    rawPhone.includes("-") || // Grupos costumam ter hífen no ID (ex: 1234-5678)
    chatId.includes("@g.us") ||
    chatId.includes("-group") ||
    chatId.includes("-") ||
    body.isGroup === true ||
    body.isGroupMsg === true
  ) {
    return { skip: true, reason: "group_message" };
  }

  // Normaliza para somente dígitos
  const phone = rawPhone.replace(/@.*$/, "").replace(/\D/g, "");

  // IDs de grupo podem ter muitos dígitos (ex: 18 dígitos), enquanto telefones têm no máximo 13-14
  if (phone.length > 15) {
    return { skip: true, reason: "group_id_length" };
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
