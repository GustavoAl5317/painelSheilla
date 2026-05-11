import "server-only";
import { resolveCredential } from "@/lib/credentials";

function normalizePhone(raw: string): string {
  // Remove tudo que não for dígito e sufixos do WhatsApp (@c.us, @g.us)
  const digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
  // Garante DDI 55 (Brasil)
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

// ─── Z-API: resolução de LID ──────────────────────────────────────────────────

/**
 * Resolve um LID (Linked Identifier do WhatsApp Multi-Device) para o telefone real
 * do contato. Necessário quando a Z-API envia phone="...@lid" em mensagens fromMe.
 *
 * Retorna apenas dígitos do telefone, ou null se não conseguir resolver.
 */
export async function resolveLidToPhone(
  organizationId: string,
  lid: string
): Promise<string | null> {
  const [instance, token, clientToken] = await Promise.all([
    resolveCredential(organizationId, "ZAPI_INSTANCE"),
    resolveCredential(organizationId, "ZAPI_TOKEN"),
    resolveCredential(organizationId, "ZAPI_CLIENT_TOKEN"),
  ]);
  if (!instance || !token) {
    console.warn("[Z-API] resolveLidToPhone: credenciais ausentes");
    return null;
  }

  const lidDigits = lid.replace(/@.*$/, "").replace(/\D/g, "");
  if (!lidDigits) return null;

  const url = `https://api.z-api.io/instances/${instance}/token/${token}/phone-exists-lid/${lidDigits}`;
  const headers: Record<string, string> = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const res = await fetch(url, { headers });
    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`[Z-API] phone-exists-lid falhou (${res.status}):`, bodyText.slice(0, 200));
      return null;
    }
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch { return null; }
    const phone: unknown = parsed?.phone ?? parsed?.inputPhone ?? parsed?.result;
    if (typeof phone !== "string") {
      console.warn("[Z-API] phone-exists-lid sem phone na resposta:", bodyText.slice(0, 200));
      return null;
    }
    return phone.replace(/\D/g, "") || null;
  } catch (err) {
    console.error("[Z-API] phone-exists-lid erro de rede:", (err as Error).message);
    return null;
  }
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
  message: string
): Promise<void> {
  // Tenta Z-API primeiro
  const [zapiInstance, zapiToken] = await Promise.all([
    resolveCredential(organizationId, "ZAPI_INSTANCE"),
    resolveCredential(organizationId, "ZAPI_TOKEN"),
  ]);

  if (zapiInstance && zapiToken) {
    const zapiClientToken = await resolveCredential(organizationId, "ZAPI_CLIENT_TOKEN");
    await sendViaZAPI(zapiInstance, zapiToken, phoneNumber, message, zapiClientToken);
    return;
  }

  // Fallback: Evolution API
  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(organizationId, "EVOLUTION_API_URL"),
    resolveCredential(organizationId, "EVOLUTION_API_KEY"),
    resolveCredential(organizationId, "EVOLUTION_INSTANCE"),
  ]);

  if (evoUrl && evoKey && evoInstance) {
    await sendViaEvolution(evoUrl, evoKey, evoInstance, phoneNumber, message);
    return;
  }

  throw new Error("Nenhum provider WhatsApp configurado para esta organização (ZAPI ou Evolution API).");
}
