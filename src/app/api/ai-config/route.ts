import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  
  // Debug para descobrir a org correta
  try {
    const fs = require("fs");
    fs.writeFileSync("c:\\Users\\GustavoAlvesSantana\\OneDrive - INTERATELL\\Documentos\\AdvZap\\advzap\\scratch\\current_org.txt", organizationId);
  } catch(e) {}

  const config = await prisma.aIConfig.findFirst({ where: { organizationId } });
  console.log(`[AI Config GET] orgId: ${organizationId}, found: ${!!config}, blockedCount: ${Array.isArray((config as any)?.blockedNumbers) ? (config as any).blockedNumbers.length : "not_array"}`);
  return NextResponse.json({ data: config });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const body = await req.json();
  const { organizationId: _drop, ...data } = body;

  const config = await prisma.aIConfig.upsert({
    where: { organizationId },
    create: { organizationId, ...data } as any,
    update: data as any,
  });
  return NextResponse.json({ ok: true, data: config });
}
