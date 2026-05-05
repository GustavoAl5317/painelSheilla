import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Scale, Calendar, LinkIcon, FolderOpen, Gavel, Bell, MessageSquare, Cpu } from "lucide-react";
import { formatDate, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { NovoProcessoButton } from "@/components/processos/novo-processo-button";
import { EditProcessButton } from "@/components/processos/edit-process-button";

const entryConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  DJEN: { icon: Bell, color: "text-purple-500", label: "DJEN" },
  PJE: { icon: Gavel, color: "text-blue-500", label: "PJE" },
  COMMENT: { icon: MessageSquare, color: "text-gray-400", label: "Anotação" },
  SYSTEM: { icon: Cpu, color: "text-gray-300", label: "Sistema" },
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; dot: string; bg: string }> = {
  ACTIVE: { label: "Ativo", variant: "success", dot: "bg-emerald-500", bg: "bg-emerald-50" },
  SUSPENDED: { label: "Suspenso", variant: "warning", dot: "bg-amber-500", bg: "bg-amber-50" },
  ARCHIVED: { label: "Arquivado", variant: "secondary", dot: "bg-gray-400", bg: "bg-gray-50" },
  CONCLUDED: { label: "Concluído", variant: "default", dot: "bg-blue-400", bg: "bg-blue-50" },
};

export default async function ProcessosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const [processes, clientList] = await Promise.all([
    prisma.process.findMany({
      where: { organizationId: orgId },
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
        caseCards: {
          where: { processId: { not: null } },
          take: 1,
          include: {
            entries: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: { id: true, source: true, content: true, createdAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const byStatus = {
    ACTIVE: processes.filter((p) => p.status === "ACTIVE").length,
    SUSPENDED: processes.filter((p) => p.status === "SUSPENDED").length,
    CONCLUDED: processes.filter((p) => p.status === "CONCLUDED").length,
    ARCHIVED: processes.filter((p) => p.status === "ARCHIVED").length,
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Processos" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Subheader */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
                  <Scale className="h-4.5 w-4.5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{processes.length} processo{processes.length !== 1 ? "s" : ""}</p>
                  <p className="text-xs text-gray-400">Processos jurídicos</p>
                </div>
              </div>
              {/* Mini stats de status */}
              <div className="hidden md:flex items-center gap-3">
                {Object.entries(byStatus).filter(([, v]) => v > 0).map(([key, count]) => {
                  const cfg = statusConfig[key];
                  return (
                    <div key={key} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5", cfg.bg)}>
                      <div className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                      <span className="text-xs font-semibold text-gray-700">{count} {cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <NovoProcessoButton organizationId={orgId} clients={clientList} />
          </div>
        </div>

        <div className="p-6">
          {processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
                <FolderOpen className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-base font-medium text-gray-500">Nenhum processo cadastrado</p>
              <p className="text-sm text-gray-400 mt-1">Adicione o primeiro processo jurídico</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {processes.map((proc) => {
                const status = statusConfig[proc.status];
                const hasMovement = Boolean(proc.lastMovement);

                const recentEntries = proc.caseCards[0]?.entries ?? [];

                return (
                  <Card
                    key={proc.id}
                    className="group hover:border-blue-200 hover:shadow-md transition-all duration-200 flex flex-col bg-white relative overflow-hidden"
                  >
                    {/* Linha colorida no topo */}
                    <div className={cn("h-0.5 w-full", status.dot.replace("bg-", "bg-"))} />

                    <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <EditProcessButton process={proc} />
                    </div>

                    <Link href={`/processos/${proc.id}`} className="flex-1 flex flex-col">
                      <CardContent className="p-4 flex flex-col flex-1">
                        {/* Cliente */}
                        <div className="flex items-center gap-2.5 mb-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-[11px] font-bold bg-blue-50 text-blue-700">
                              {proc.client ? getInitials(proc.client.name) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">{proc.client?.name ?? "Sem cliente"}</p>
                            {proc.client?.phone && <p className="text-[10px] text-gray-400 truncate">{proc.client.phone}</p>}
                          </div>
                        </div>

                        {/* Título + status */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="text-sm font-bold text-gray-900 leading-tight line-clamp-2 flex-1">
                              {proc.title ?? "Sem título"}
                            </h3>
                          </div>

                          {proc.number && proc.number !== "(a definir)" ? (
                            <p className="text-[11px] font-mono text-gray-400 mb-2.5">{proc.number}</p>
                          ) : (
                            <div className="flex items-center gap-1 mb-2.5">
                              <LinkIcon className="h-3 w-3 text-amber-400" />
                              <span className="text-[10px] text-amber-600 font-medium">Número não vinculado</span>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5 mb-3">
                            <Badge variant={status.variant} className="text-[10px] h-5">
                              {status.label}
                            </Badge>
                            {proc.legalArea && (
                              <Badge variant="secondary" className="text-[10px] h-5">{proc.legalArea}</Badge>
                            )}
                          </div>

                          {proc.court && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1.5">
                              <Scale className="h-3 w-3 shrink-0" />
                              <span className="truncate">{proc.court}</span>
                            </div>
                          )}

                          {recentEntries.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {recentEntries.map((entry) => {
                                const cfg = entryConfig[entry.source] ?? entryConfig.SYSTEM;
                                const Icon = cfg.icon;
                                return (
                                  <div key={entry.id} className="flex items-start gap-1.5">
                                    <Icon className={cn("h-3 w-3 shrink-0 mt-0.5", cfg.color)} />
                                    <p className="text-[10px] text-gray-500 leading-tight line-clamp-1 flex-1">{entry.content}</p>
                                    <span className="text-[9px] text-gray-300 shrink-0 tabular-nums">{formatDate(entry.createdAt)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : hasMovement && (
                            <p className="text-[11px] text-gray-400 italic line-clamp-2">{proc.lastMovement}</p>
                          )}
                        </div>

                        {/* Audiência */}
                        {proc.nextHearing && (
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-blue-600">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium">Audiência · {formatDate(proc.nextHearing)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
