import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveCredential } from "@/lib/credentials";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;

  const [evoUrl, evoKey, evoInstance] = await Promise.all([
    resolveCredential(orgId, "EVOLUTION_API_URL"),
    resolveCredential(orgId, "EVOLUTION_API_KEY"),
    resolveCredential(orgId, "EVOLUTION_INSTANCE"),
  ]);

  if (!evoUrl || !evoKey || !evoInstance) {
    return NextResponse.json({ error: "Evolution API não configurada." }, { status: 400 });
  }

  const base = evoUrl.replace(/\/$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}/instance/connectionState/${evoInstance}`, {
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
  const state = data?.instance?.state ?? data?.state ?? null;

  return NextResponse.json({ state, connected: state === "open" });
}
