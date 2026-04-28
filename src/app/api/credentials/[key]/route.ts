import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteCredential, type CredentialKey } from "@/lib/credentials";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { key } = await params;

  try {
    await deleteCredential(orgId, key as CredentialKey);
    return NextResponse.json({ message: "Credencial removida" });
  } catch {
    return NextResponse.json({ error: "Erro ao remover credencial" }, { status: 500 });
  }
}
