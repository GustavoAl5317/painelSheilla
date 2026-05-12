import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPhoneBlocked } from "@/lib/blocked-phones";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;

  const [conversations, aiConfig] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        organizationId,
        NOT: [
          { phoneNumber: { contains: "@g.us" } },
          { phoneNumber: { contains: "-group" } },
          { phoneNumber: { contains: "group" } },
          { phoneNumber: { contains: "@broadcast" } },
          { phoneNumber: { contains: "-" } },
        ],
      },
      include: {
        lead: true,
        client: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.aIConfig.findUnique({
      where: { organizationId }
    })
  ]);

  const blockedList = (aiConfig as any)?.blockedNumbers || [];
  const data = conversations
    .filter(c => c.phoneNumber.length <= 15 || c.phoneNumber.startsWith("lid:") || (c as any).chatLid)
    .map(c => {
    const blocked = isPhoneBlocked(blockedList, c.phoneNumber);
    const blockItem = Array.isArray(blockedList)
      ? (blockedList as any[]).find((item: any) => {
          const p = String(item.phone || "").replace(/\D/g, "");
          const target = c.phoneNumber.replace(/\D/g, "");
          return p && target && (p === target || p.endsWith(target) || target.endsWith(p));
        })
      : null;

    return {
      ...c,
      isBlocked: c.isBlocked || blocked,
      globalName: blockItem?.name || null
    };
  });

  return NextResponse.json({ data, organizationId });
}
