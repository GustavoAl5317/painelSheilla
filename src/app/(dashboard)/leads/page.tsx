import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default async function LeadsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const stages = await prisma.kanbanStage.findMany({
    where: { organizationId: orgId },
    orderBy: { order: "asc" },
    include: {
      leads: {
        where: { status: "ACTIVE" },
        include: {
          assignedTo: { select: { id: true, name: true, avatar: true } },
          _count: { select: { conversations: true, tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Triagem" />
      <div className="flex-1 overflow-hidden">
        <KanbanBoard initialStages={stages as any} organizationId={orgId} />
      </div>
    </div>
  );
}
