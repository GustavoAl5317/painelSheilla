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
