import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCredentials, saveCredential, type CredentialKey } from "@/lib/credentials";
import { z } from "zod";

const upsertSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

// Lista quais credenciais estão configuradas (sem expor os valores)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;

  try {
    const configured = await listCredentials(orgId);
    return NextResponse.json({ data: configured });
  } catch {
    return NextResponse.json({ data: [] });
  }
}

// Salva ou atualiza uma credencial
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    await saveCredential(orgId, parsed.data.key as CredentialKey, parsed.data.value);
    return NextResponse.json({ message: "Credencial salva com sucesso" });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao salvar credencial" }, { status: 500 });
  }
}
