import { notFound } from "next/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Scale, Calendar, CheckSquare, ChevronLeft, User, FileText } from "lucide-react";
import { ProcessDetailTabs } from "@/components/processos/process-detail-tabs";
import { ProcessCrmCards } from "@/components/processos/process-crm-cards";
import { getInitials, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { EditProcessButton } from "@/components/processos/edit-process-button";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; dot: string }> = {
  ACTIVE:    { label: "Ativo",      variant: "success",    dot: "bg-emerald-500" },
  SUSPENDED: { label: "Suspenso",   variant: "warning",    dot: "bg-amber-500"   },
  ARCHIVED:  { label: "Arquivado",  variant: "secondary",  dot: "bg-gray-400"    },
  CONCLUDED: { label: "Concluído",  variant: "default",    dot: "bg-blue-400"    },
};

const priorityLabel: Record<string, { label: string; color: string }> = {
  URGENT: { label: "Urgente", color: "text-red-500"    },
  HIGH:   { label: "Alta",    color: "text-orange-500" },
  MEDIUM: { label: "Média",   color: "text-blue-500"   },
  LOW:    { label: "Baixa",   color: "text-gray-400"   },
};

export default async function ProcessoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const proc = await prisma.process.findFirst({
    where: { id, organizationId: orgId },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true } },
      tasks: { orderBy: [{ priority: "desc" }, { dueDate: "asc" }] },
    },
  });

  if (!proc) notFound();

  const status = statusConfig[proc.status];
  const tasks = proc.tasks;

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Detalhe do Processo" />
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-6">
        <Link
          href="/processos"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Processos
        </Link>

        {/* ── Cabeçalho do processo ── */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", status.dot)} />
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {proc.legalArea && <Badge variant="secondary">{proc.legalArea}</Badge>}
                </div>
                <div className="flex items-center justify-between gap-4 mt-2">
                  <h2 className="text-xl font-bold text-gray-900">{proc.title ?? "Sem título"}</h2>
                  <EditProcessButton process={proc} />
                </div>
                <p className="text-sm font-mono text-gray-400 mt-1">
                  {proc.number && proc.number !== "(a definir)" ? proc.number : "Número não vinculado"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              {proc.court && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Scale className="h-4 w-4 text-gray-400 shrink-0" />
                  {proc.court}
                </div>
              )}
              {proc.nextHearing && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Calendar className="h-4 w-4 shrink-0" />
                  Audiência: {formatDate(proc.nextHearing)}
                </div>
              )}
              {proc.assignedTo && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400 shrink-0" />
                  {proc.assignedTo.name}
                </div>
              )}
            </div>

            {proc.observations && (
              <div className="mt-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700">{proc.observations}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Cliente vinculado ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base">Cliente</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {proc.client ? (
              <Link href={`/clientes/${proc.client.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors cursor-pointer">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm bg-blue-50 text-blue-700">
                      {getInitials(proc.client.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-gray-900">{proc.client.name}</p>
                    {proc.client.phone && <p className="text-xs text-gray-400 mt-0.5">{proc.client.phone}</p>}
                  </div>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-gray-400 italic p-3">
                Nenhum cliente vinculado. Use a aba <strong>Consulta DJEN</strong> para encontrar e vincular um cliente pelo CPF.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Cards CRM vinculados ── */}
        <ProcessCrmCards processId={proc.id} />

        {/* ── Abas: Card do processo / Consulta DJEN ── */}
        <ProcessDetailTabs
          processId={proc.id}
          processNumber={proc.number ?? null}
          clientId={proc.clientId ?? null}
          lastDjenSearchAt={proc.lastDjenSearchAt?.toISOString() ?? null}
        />

        {/* ── Tarefas ── */}
        {tasks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-base">Tarefas ({tasks.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {tasks.map((task) => {
                const prio = priorityLabel[task.priority] ?? { label: task.priority, color: "text-gray-500" };
                return (
                  <div key={task.id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className={cn(
                        "text-sm font-medium text-gray-800",
                        task.status === "DONE" && "line-through text-gray-400"
                      )}>
                        {task.title}
                      </p>
                      {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn("text-xs font-semibold", prio.color)}>{prio.label}</span>
                      {task.dueDate && <p className="text-xs text-gray-400">{formatDate(task.dueDate)}</p>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
