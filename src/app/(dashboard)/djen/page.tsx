import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { DjenConsultPage } from "@/components/djen/djen-consult-page";

export default async function DjenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const processos = await prisma.process.findMany({
    where: { organizationId: orgId },
    select: { id: true, number: true, title: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Consulta DJEN" />
      <div className="flex-1 overflow-y-auto p-6">
        <DjenConsultPage processos={processos} />
      </div>
    </div>
  );
}
