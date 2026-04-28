import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncTIClients } from "@/lib/ti-sync";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;

  const result = await syncTIClients(orgId);

  return NextResponse.json({
    ok: true,
    synced: result.created + result.updated,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
  });
}
