import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resetOrgClientsAndProcesses } from "@/lib/reset-org-clients-processes";

const CONFIRM = "LIMPAR_CLIENTES_E_PROCESSOS";

/** POST — apaga todos os clientes e processos da organização (somente OWNER/ADMIN). Body: { confirm } */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem executar esta ação." }, { status: 403 });
  }

  const orgId = (session.user as { organizationId: string }).organizationId;
  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM) {
    return NextResponse.json(
      {
        error: "Confirmação inválida.",
        hint: `Envie { "confirm": "${CONFIRM}" } no corpo da requisição.`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await resetOrgClientsAndProcesses(orgId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[reset-clients-processes]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao limpar dados." },
      { status: 500 }
    );
  }
}
