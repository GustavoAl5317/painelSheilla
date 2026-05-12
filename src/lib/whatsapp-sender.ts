import "server-only";
import { resolveCredential } from "@/lib/credentials";

function normalizePhone(raw: string): string {
  // LID (LinkedID — modo privacidade do WhatsApp) não é número de telefone:
  // é um identificador opaco. Z-API roteia o envio quando recebe xxxxxx@lid,
  // então preservamos o sufixo e NÃO prependemos DDI.
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

// ─── Z-API ────────────────────────────────────────────────────────────────────

async function sendViaZAPI(
  instance: string,
  token: string,
  phone: string,
  message: string,
  clientToken?: string | null
): Promise<void> {
  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  console.log("[Z-API] POST", url, "phone:", normalizePhone(phone));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: normalizePhone(phone), message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Z-API] erro", res.status, body);
    throw new Error(`Z-API send failed (${res.status}): ${body}`);
  }
  console.log("[Z-API] enviado ok");
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
  // Para contatos LID (privacidade do WhatsApp), o Z-API exige o identificador
  // xxxxxx@lid no campo "phone" — phoneNumber real não roteia. Usa chatLid se houver.
  const routingTarget = chatLid && chatLid.includes("@lid") ? chatLid : phoneNumber;

  // Tenta Z-API primeiro
  const [zapiInstance, zapiToken] = await Promise.all([
    resolveCredential(organizationId, "ZAPI_INSTANCE"),
    resolveCredential(organizationId, "ZAPI_TOKEN"),
  ]);

  if (zapiInstance && zapiToken) {
    const zapiClientToken = await resolveCredential(organizationId, "ZAPI_CLIENT_TOKEN");
    await sendViaZAPI(zapiInstance, zapiToken, routingTarget, message, zapiClientToken);
    return;
  }

  // Fallback: Evolution API
  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(organizationId, "EVOLUTION_API_URL"),
    resolveCredential(organizationId, "EVOLUTION_API_KEY"),
    resolveCredential(organizationId, "EVOLUTION_INSTANCE"),
  ]);

  if (evoUrl && evoKey && evoInstance) {
    await sendViaEvolution(evoUrl, evoKey, evoInstance, routingTarget, message);
    return;
  }

  throw new Error("Nenhum provider WhatsApp configurado para esta organização (ZAPI ou Evolution API).");
}
