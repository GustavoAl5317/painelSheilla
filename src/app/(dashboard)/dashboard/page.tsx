import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, MessageSquare, TrendingUp, ArrowUpRight, ArrowDownRight,
  Briefcase, Scale, CheckSquare, Bell, UserPlus, Bot, FileText, Activity,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PRIMARY = "#95304e";

type NotifType =
  | "DEADLINE_APPROACHING" | "DEADLINE_OVERDUE" | "NEW_LEAD"
  | "LEAD_STALLED" | "NEW_MESSAGE" | "TASK_DUE" | "PROCESS_UPDATE" | "CLIENT_NO_RESPONSE";

const NOTIF_CONFIG: Record<NotifType, { icon: React.ElementType; iconClass: string; bg: string }> = {
  NEW_LEAD:            { icon: UserPlus,     iconClass: "text-blue-500",   bg: "bg-blue-50" },
  NEW_MESSAGE:         { icon: MessageSquare,iconClass: "text-green-500",  bg: "bg-green-50" },
  PROCESS_UPDATE:      { icon: FileText,     iconClass: "text-purple-500", bg: "bg-purple-50" },
  TASK_DUE:            { icon: CheckSquare,  iconClass: "text-violet-500", bg: "bg-violet-50" },
  DEADLINE_APPROACHING:{ icon: Bell,         iconClass: "text-amber-500",  bg: "bg-amber-50" },
  DEADLINE_OVERDUE:    { icon: Bell,         iconClass: "text-red-500",    bg: "bg-red-50" },
  LEAD_STALLED:        { icon: Users,        iconClass: "text-orange-500", bg: "bg-orange-50" },
  CLIENT_NO_RESPONSE:  { icon: Bot,          iconClass: "text-gray-400",   bg: "bg-gray-50" },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;
  const userName = session.user.name ?? "Doutora";

  const data = await getDashboardData(orgId);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const statCards = [
    {
      label: "Clientes Ativos",
      value: data.totalClients,
      sub: `${data.convertedThisMonth} novos este mês`,
      icon: Briefcase,
      color: "text-rose-700",
      bg: "bg-rose-50",
      href: "/clientes",
    },
    {
      label: "Em Triagem",
      value: data.totalLeads,
      sub: `${data.newLeads} novos aguardando`,
      icon: Users,
      color: "text-blue-700",
      bg: "bg-blue-50",
      href: "/leads",
    },
    {
      label: "Processos Ativos",
      value: data.activeProcesses,
      sub: `de ${data.totalProcesses} no total`,
      icon: Scale,
      color: "text-purple-700",
      bg: "bg-purple-50",
      href: "/processos",
    },
    {
      label: "Taxa de Conversão",
      value: `${data.conversionRate}%`,
      sub: data.conversionTrend >= 0
        ? `+${data.conversionTrend}% vs mês passado`
        : `${data.conversionTrend}% vs mês passado`,
      icon: TrendingUp,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      trendUp: data.conversionTrend >= 0,
      href: "/leads",
    },
  ];

  const alertCards = [
    {
      label: "Tarefas Pendentes",
      value: data.tasksPending,
      icon: CheckSquare,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-200",
      href: "/tarefas",
      urgent: data.tasksDueToday > 0,
    },
    {
      label: "Mensagens Não Lidas",
      value: data.unreadMessages,
      icon: MessageSquare,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      href: "/conversas",
      urgent: data.unreadMessages > 0,
    },
    {
      label: "Aguard. Resposta",
      value: data.waitingResponse,
      icon: Bell,
      color: "text-sky-600",
      bg: "bg-sky-50",
      border: "border-sky-200",
      href: "/conversas",
      urgent: false,
    },
    {
      label: "Atendimentos Hoje",
      value: data.contactsAttendedToday,
      sub: "Zera diariamente",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
      href: "/conversas",
      urgent: false,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Dashboard" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Saudação */}
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-xl font-bold text-gray-900">
            {greeting}, {userName.split(" ")[0]}! 👋
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.label} href={card.href}>
                  <Card className="border border-gray-200 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer h-full">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", card.bg)}>
                          <Icon className={cn("h-4.5 w-4.5", card.color)} />
                        </div>
                        {"trendUp" in card && (
                          <span className={cn(
                            "flex items-center gap-0.5 text-[11px] font-semibold",
                            card.trendUp ? "text-emerald-600" : "text-red-500"
                          )}>
                            {card.trendUp
                              ? <ArrowUpRight className="h-3 w-3" />
                              : <ArrowDownRight className="h-3 w-3" />}
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                      <p className="text-xs font-semibold text-gray-700 mt-0.5">{card.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Alertas operacionais */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Acompanhamento Diário</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {alertCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link key={card.label} href={card.href}>
                    <div className={cn(
                      "rounded-xl border p-3.5 flex flex-col gap-2 hover:shadow-sm transition-all cursor-pointer h-full",
                      card.urgent ? card.border : "border-gray-200",
                      card.urgent ? card.bg : "bg-white"
                    )}>
                      <div className="flex items-center justify-between">
                        <Icon className={cn("h-4 w-4", card.urgent ? card.color : "text-gray-400")} />
                        {card.urgent && card.value > 0 && (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <p className={cn("text-xl font-bold", card.urgent && card.value > 0 ? card.color : "text-gray-900")}>
                        {card.value}
                      </p>
                      <div>
                        <p className="text-[10px] font-medium text-gray-500 leading-tight">{card.label}</p>
                        {"sub" in card && (
                          <p className="text-[9px] text-gray-400 mt-0.5">{card.sub}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Grid principal */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Pipeline de leads */}
            <Card className="xl:col-span-1">
              <CardHeader className="pb-2 px-5 pt-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">Triagem</CardTitle>
                  <Link href="/leads" className="text-[11px] font-medium" style={{ color: PRIMARY }}>
                    Ver Triagem
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.leadsByStage.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">Nenhum estágio cadastrado.</p>
                ) : (
                  <div className="space-y-3.5">
                    {data.leadsByStage.map((stage) => {
                      const total = data.leadsByStage.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                      return (
                        <div key={stage.slug}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-gray-700 font-medium truncate flex-1">{stage.stage}</span>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              <span className="text-[10px] text-gray-400">{pct}%</span>
                              <span className="text-sm font-bold text-gray-900">{stage.count}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Total ativo</span>
                      <span className="text-sm font-bold text-gray-900">{data.totalLeads}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movimentações recentes de processos */}
            <Card className="xl:col-span-1">
              <CardHeader className="pb-2 px-5 pt-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">Processos Recentes</CardTitle>
                  <Link href="/processos" className="text-[11px] font-medium" style={{ color: PRIMARY }}>
                    Ver todos
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.recentProcesses.length === 0 ? (
                  <div className="py-6 text-center">
                    <Scale className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nenhum processo ativo</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.recentProcesses.map((p) => (
                      <Link key={p.id} href={`/processos/${p.id}`}>
                        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5 hover:bg-gray-100 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <p className="text-xs font-semibold text-gray-800 truncate flex-1">
                              {p.client?.name ?? "Sem cliente"}
                            </p>
                            {p.legalArea && (
                              <span className="text-[10px] text-gray-400 shrink-0">{p.legalArea}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-mono">
                            {p.number && p.number !== "(a definir)" ? p.number : p.title ?? "Sem número"}
                          </p>
                          {p.lastMovement && (
                            <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{p.lastMovement}</p>
                          )}
                          {p.lastMovementAt && (
                            <p className="text-[10px] text-gray-300 mt-0.5">{formatRelative(new Date(p.lastMovementAt))}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Linha inferior: leads recentes + atividade recente */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Leads recentes */}
            <Card>
              <CardHeader className="pb-2 px-5 pt-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">Triagem Recente</CardTitle>
                  <Link href="/leads" className="text-[11px] font-medium" style={{ color: PRIMARY }}>
                    Ver triagem
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.recentLeads.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">Nenhum lead ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentLeads.map((lead) => (
                      <div key={lead.id} className="flex items-center gap-3 py-1.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                          {lead.name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{lead.name}</p>
                          <p className="text-[11px] text-gray-400">{lead.legalArea ?? lead.phone ?? "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {lead.stage && (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                              style={{ backgroundColor: lead.stage.color }}
                            >
                              {lead.stage.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-300">{formatRelative(lead.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Feed de atividade recente */}
            <Card>
              <CardHeader className="pb-2 px-5 pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-gray-700">Atividade Recente</CardTitle>
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <Activity className="h-3.5 w-3.5 text-gray-300" />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.recentNotifications.length === 0 ? (
                  <div className="py-6 text-center">
                    <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nenhuma atividade ainda</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {data.recentNotifications.map((notif, i) => {
                      const cfg = NOTIF_CONFIG[notif.type as NotifType] ?? { icon: Bell, iconClass: "text-gray-400", bg: "bg-gray-50" };
                      const Icon = cfg.icon;
                      const isLast = i === data.recentNotifications.length - 1;
                      return (
                        <div key={notif.id} className="flex gap-3 group">
                          {/* Linha de tempo */}
                          <div className="flex flex-col items-center">
                            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-1", cfg.bg)}>
                              <Icon className={cn("h-3.5 w-3.5", cfg.iconClass)} />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1 mb-1" />}
                          </div>
                          {/* Conteúdo */}
                          <div className={cn("flex-1 min-w-0 pb-3", isLast ? "" : "")}>
                            <p className={cn("text-xs font-semibold leading-snug truncate", notif.read ? "text-gray-600" : "text-gray-900")}>
                              {notif.title}
                            </p>
                            <p className="text-[11px] text-gray-400 line-clamp-1 leading-snug mt-0.5">
                              {notif.message}
                            </p>
                            <p className="text-[10px] text-gray-300 mt-0.5">
                              {formatRelative(notif.createdAt)}
                            </p>
                          </div>
                          {!notif.read && (
                            <div className="shrink-0 mt-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 block" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
