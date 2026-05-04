import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { AgendaShell } from "@/components/agenda/agenda-shell";

export default async function AgendaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Agenda" />
      <div className="flex-1 overflow-hidden">
        <AgendaShell initialClients={clients} />
      </div>
    </div>
  );
}
