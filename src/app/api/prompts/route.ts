import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const templates = await prisma.promptTemplate.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: "desc" }, { isSystem: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const { name, description, content, isDefault } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "name e content são obrigatórios" }, { status: 400 });
  }

  // Se está marcando como padrão, remove o padrão anterior
  if (isDefault) {
    await prisma.promptTemplate.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.promptTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() ?? null,
      content: content.trim(),
      isDefault: isDefault ?? false,
      isSystem: false,
      organizationId,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
