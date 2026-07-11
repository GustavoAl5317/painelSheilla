import "server-only";
import { resolveCredential } from "@/lib/credentials";

function normalizePhone(raw: string): string {
  // LID (LinkedID — modo privacidade do WhatsApp) não é número de telefone:
  // é um identificador opaco. A Evolution API roteia o envio quando recebe
  // xxxxxx@lid, então preservamos o sufixo e NÃO prependemos DDI.
  if (raw.includes("@lid")) {
    const digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
    return `${digits}@lid`;
  }
  // Remove tudo que não for dígito e sufixos do WhatsApp (@c.us, @g.us)
  const digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
  // Garante DDI 55 (Brasil)
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

// ─── Evolution API ────────────────────────────────────────────────────────────

async function sendViaEvolution(
  baseUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  message: string
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number: normalizePhone(phone), text: message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution API send failed (${res.status}): ${body}`);
  }
}

// ─── Mídia criptografada (áudio/imagem/documento) ──────────────────────────────
// O webhook da Evolution API traz apenas a URL criptografada do CDN do WhatsApp
// (termina em ".enc") — não dá para baixar e usar direto. É preciso pedir pro
// próprio Evolution descriptografar usando a mediaKey que ele já tem em cache.

export async function fetchEvolutionMediaBase64(
  organizationId: string,
  messageKey: { id: string; remoteJid?: string; fromMe?: boolean }
): Promise<string | null> {
  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(organizationId, "EVOLUTION_API_URL"),
    resolveCredential(organizationId, "EVOLUTION_API_KEY"),
    resolveCredential(organizationId, "EVOLUTION_INSTANCE"),
  ]);
  if (!evoUrl || !evoKey || !evoInstance) return null;

  try {
    const res = await fetch(`${evoUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${evoInstance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        message: {
          key: {
            id: messageKey.id,
            remoteJid: messageKey.remoteJid,
            fromMe: messageKey.fromMe ?? false,
          },
        },
        convertToMp4: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[fetchEvolutionMediaBase64] falhou: ${res.status}`, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const base64 = data?.base64 ?? data?.data?.base64 ?? data?.media?.base64 ?? null;
    if (typeof base64 !== "string" || !base64) {
      console.error(`[fetchEvolutionMediaBase64] resposta sem campo base64 reconhecível:`, JSON.stringify(data).slice(0, 300));
      return null;
    }
    return base64;
  } catch (err: any) {
    console.error(`[fetchEvolutionMediaBase64] exceção:`, err.message);
    return null;
  }
}

// ─── Roteador principal ───────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  organizationId: string,
  phoneNumber: string,
  message: string,
  chatLid?: string | null
): Promise<void> {
  // Para contatos LID (privacidade do WhatsApp), a Evolution API costuma exigir o
  // identificador xxxxxx@lid no campo "number" — phoneNumber real não roteia.
  // Usa chatLid se houver, com fallback para o número real se o LID falhar
  // (a Evolution às vezes ainda não tem o mapeamento LID→número sincronizado).
  const routingTarget = chatLid && chatLid.includes("@lid") ? chatLid : phoneNumber;

  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(organizationId, "EVOLUTION_API_URL"),
    resolveCredential(organizationId, "EVOLUTION_API_KEY"),
    resolveCredential(organizationId, "EVOLUTION_INSTANCE"),
  ]);

  if (evoUrl && evoKey && evoInstance) {
    try {
      await sendViaEvolution(evoUrl, evoKey, evoInstance, routingTarget, message);
    } catch (e) {
      if (routingTarget !== phoneNumber && phoneNumber) {
        await sendViaEvolution(evoUrl, evoKey, evoInstance, phoneNumber, message);
        return;
      }
      throw e;
    }
    return;
  }

  throw new Error("Evolution API não configurada para esta organização.");
}
