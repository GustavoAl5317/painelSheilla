import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const { blocked } = body ?? {};
  
  if (typeof blocked !== "boolean") {
    return NextResponse.json({ error: "Campo 'blocked' (boolean) é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.conversation.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, phoneNumber: true },
  });
  
  if (!existing) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  // Atualiza também a lista global de números bloqueados em AIConfig
  const aiConfig = await prisma.aIConfig.findUnique({
    where: { organizationId: orgId },
  });

  if (aiConfig) {
    let blockedNumbers = Array.isArray(aiConfig.blockedNumbers) 
      ? [...(aiConfig.blockedNumbers as any[])] 
      : [];
    
    let updated = false;
    
    if (blocked) {
      // Adiciona se não existir
      if (!blockedNumbers.some(item => String(item.phone || "").replace(/\D/g, "") === existing.phoneNumber)) {
        blockedNumbers.push({ phone: existing.phoneNumber, name: "Bloqueado via Chat" });
        updated = true;
      }
    } else {
      // Remove se existir
      const originalLength = blockedNumbers.length;
      blockedNumbers = blockedNumbers.filter(
        item => String(item.phone || "").replace(/\D/g, "") !== existing.phoneNumber
      );
      if (blockedNumbers.length !== originalLength) {
        updated = true;
      }
    }

    if (updated) {
      await prisma.aIConfig.update({
        where: { id: aiConfig.id },
        data: { blockedNumbers },
      });
    }
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: {
      isBlocked: blocked,
      ...(blocked && { aiEnabled: false }),
    },
    select: { id: true, isBlocked: true, aiEnabled: true },
  });

  return NextResponse.json({ 
    ok: true, 
    isBlocked: conversation.isBlocked,
    aiEnabled: conversation.aiEnabled 
  });
}
