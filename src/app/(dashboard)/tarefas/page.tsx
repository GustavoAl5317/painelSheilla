import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, User, AlertCircle, Loader2, ListChecks } from "lucide-react";
import { formatDate, isDeadlineOverdue } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { NovaTarefaButton } from "@/components/tarefas/nova-tarefa-button";
import type { Prisma } from "@prisma/client";

const taskInclude = {
  assignedTo: { select: { id: true, name: true } as const },
  lead: { select: { id: true, name: true } as const },
  process: { select: { id: true, number: true, title: true } as const },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const priorityConfig = {
  URGENT: { label: "Urgente", variant: "destructive" as const, dot: "bg-red-500", order: 0 },
  HIGH: { label: "Alta", variant: "warning" as const, dot: "bg-amber-500", order: 1 },
  MEDIUM: { label: "Média", variant: "default" as const, dot: "bg-blue-500", order: 2 },
  LOW: { label: "Baixa", variant: "secondary" as const, dot: "bg-gray-400", order: 3 },
};

export default async function TarefasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;
  const userId = (session.user as { id: string }).id;

  const tasks = await prisma.task.findMany({
    where: { organizationId: orgId, status: { in: ["TODO", "IN_PROGRESS"] } },
    include: taskInclude,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });

  const todo = tasks.filter((t) => t.status === "TODO");
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const urgent = tasks.filter((t) => t.priority === "URGENT" || (t.dueDate && isDeadlineOverdue(t.dueDate)));

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Tarefas" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Subheader */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50">
                  <CheckSquare className="h-4.5 w-4.5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{tasks.length} tarefa{tasks.length !== 1 ? "s" : ""} pendente{tasks.length !== 1 ? "s" : ""}</p>
                  <p className="text-xs text-gray-400">Tarefas em aberto</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-3">
                {inProgress.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-blue-50">
                    <Loader2 className="h-3 w-3 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700">{inProgress.length} em andamento</span>
                  </div>
                )}
                {urgent.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-red-50">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-semibold text-gray-700">{urgent.length} urgente{urgent.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            </div>
            <NovaTarefaButton organizationId={orgId} createdById={userId} />
          </div>
        </div>

        <div className="p-6">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 mb-4">
                <CheckSquare className="h-7 w-7 text-green-300" />
              </div>
              <p className="text-base font-medium text-gray-500">Nenhuma tarefa pendente</p>
              <p className="text-sm text-gray-400 mt-1">Você está em dia com tudo!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {inProgress.length > 0 && (
                <div className="xl:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-blue-500">Em andamento</h2>
                    <span className="text-xs text-gray-400">({inProgress.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {inProgress.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              )}

              {todo.length > 0 && (
                <div className="xl:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="h-3.5 w-3.5 text-gray-400" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">A fazer</h2>
                    <span className="text-xs text-gray-400">({todo.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {todo.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TaskWithRelations }) {
  const priority = priorityConfig[task.priority] ?? { label: task.priority, variant: "secondary" as const, dot: "bg-gray-400", order: 4 };
  const overdue = task.dueDate && isDeadlineOverdue(task.dueDate);
  const isInProgress = task.status === "IN_PROGRESS";

  return (
    <Card className={cn(
      "hover:shadow-md transition-all duration-200 bg-white",
      overdue && "border-red-200",
      isInProgress && "border-blue-200"
    )}>
      <CardContent className="p-4">
        {/* Header: prioridade + status */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <div className={cn("h-2 w-2 rounded-full shrink-0", priority.dot)} />
            <Badge variant={priority.variant} className="text-[10px] h-5">{priority.label}</Badge>
          </div>
          {overdue && (
            <div className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
              <AlertCircle className="h-3 w-3" /> Atrasada
            </div>
          )}
        </div>

        {/* Título + descrição */}
        <div className="flex items-start gap-2.5 mb-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer shrink-0"
            readOnly
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{task.title}</p>
            {task.description && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
            )}
          </div>
        </div>

        {/* Vínculos */}
        {(task.lead || task.process) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {task.lead && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                Lead: {task.lead.name}
              </span>
            )}
            {task.process && (
              <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-mono">
                {task.process.number}
              </span>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
          <div className="flex items-center gap-2">
            {task.assignedTo && (
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <User className="h-3 w-3" />
                <span>{task.assignedTo.name}</span>
              </div>
            )}
          </div>
          {task.dueDate && (
            <div className={cn("flex items-center gap-1 text-[10px] font-medium", overdue ? "text-red-500" : "text-gray-400")}>
              <Clock className="h-3 w-3" />
              <span>{formatDate(task.dueDate)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
