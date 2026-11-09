import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncDJEN } from "@/lib/djen-sync";

export async function POST(req: NextRequest) {
  // A rota não exigia sessão: qualquer um que alcançasse o host disparava uma
  // sincronização em qualquer organização, e agora também o backfill.
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const sessionOrgId = (session.user as { organizationId: string }).organizationId;

  try {
    const { organizationId, days, notifyClients } = await req.json();
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId obrigatório" }, { status: 400 });
    }
    if (organizationId !== sessionOrgId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    // days permite recuperar publicações perdidas (o cron diário nunca rodou até
    // 09/11/2026). notifyClients: false grava no cartão sem avisar o cliente —
    // sempre use assim no backfill, senão vários clientes recebem de uma vez
    // mensagens sobre movimentações de semanas atrás.
    const result = await syncDJEN(organizationId, {
      days: typeof days === "number" ? days : undefined,
      notifyClients: notifyClients !== false,
    });
    return NextResponse.json({ ok: true, days: days ?? 1, notifyClients: notifyClients !== false, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
