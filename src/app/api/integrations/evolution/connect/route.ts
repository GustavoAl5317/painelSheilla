import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveCredential } from "@/lib/credentials";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const number = req.nextUrl.searchParams.get("number")?.replace(/\D/g, "") || undefined;

  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(orgId, "EVOLUTION_API_URL"),
    resolveCredential(orgId, "EVOLUTION_API_KEY"),
    resolveCredential(orgId, "EVOLUTION_INSTANCE"),
  ]);

  if (!evoUrl || !evoKey || !evoInstance) {
    return NextResponse.json({ error: "Evolution API não configurada. Preencha EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE em Configurações → Credenciais." }, { status: 400 });
  }

  const base = evoUrl.replace(/\/$/, "");
  const path = number ? `/instance/connect/${evoInstance}?number=${number}` : `/instance/connect/${evoInstance}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { apikey: evoKey },
      cache: "no-store",
    });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao conectar à Evolution API: ${(e as Error).message}` }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json({ error: `Evolution API retornou ${res.status}: ${body}` }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));

  let qrcode: string | null = data?.base64 ?? data?.qrcode?.base64 ?? null;
  if (qrcode && !qrcode.startsWith("data:")) {
    qrcode = `data:image/png;base64,${qrcode}`;
  }

  return NextResponse.json({
    qrcode,
    pairingCode: data?.pairingCode ?? null,
    connectionStatus: data?.instance?.state ?? data?.connectionStatus ?? null,
  });
}
