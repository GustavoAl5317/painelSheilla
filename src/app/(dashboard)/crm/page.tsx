import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { CrmBoard } from "@/components/crm/crm-board";

const DEFAULT_BOARDS = [
  { name: "Pendentes",       color: "#f59e0b", slug: "pendentes"        },
  { name: "Aguardando",      color: "#3b82f6", slug: "aguardando"       },
  { name: "Agendamentos",    color: "#8b5cf6", slug: "agendamentos"     },
  { name: "Atos Pendentes",  color: "#ef4444", slug: "atos_pendentes"   },
  { name: "Fechamento",      color: "#10b981", slug: "fechamento"       },
  { name: "Pessoal",         color: "#ec4899", slug: "pessoal"          },
  { name: "Parceiros",       color: "#06b6d4", slug: "parceiros"        },
  { name: "Associados",      color: "#84cc16", slug: "associados"       },
];

export default async function CrmPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  // Cria etapas padrão se a org ainda não tiver nenhuma
  const existing = await prisma.crmBoard.count({ where: { organizationId: orgId } });
  if (existing === 0) {
    await prisma.crmBoard.createMany({
      data: DEFAULT_BOARDS.map((b, i) => ({
        name: b.name,
        slug: `${b.slug}_${orgId.slice(-6)}`,
        color: b.color,
        order: i + 1,
        organizationId: orgId,
      })),
      skipDuplicates: true,
    });
  }

  const boards = await prisma.crmBoard.findMany({
    where: { organizationId: orgId },
    orderBy: { order: "asc" },
    include: {
      cards: {
        orderBy: { order: "asc" },
        include: {
          process: { select: { id: true, number: true, title: true } },
          client: { select: { id: true, name: true } },
          _count: { select: { activities: true } },
        },
      },
    },
  });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="CRM" />
      <div className="flex-1 overflow-hidden">
        <CrmBoard initialBoards={boards as any} organizationId={orgId} />
      </div>
    </div>
  );
}
