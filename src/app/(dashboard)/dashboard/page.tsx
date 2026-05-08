import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, MessageSquare, TrendingUp, ArrowUpRight, ArrowDownRight,
  Briefcase, Scale, CheckSquare, Bell, UserPlus, Bot, FileText, Activity,
  Sparkles,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { format } from "date-fns";
import { Greeting } from "@/components/dashboard/greeting";
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

      <div className="flex-1 overflow-y-auto" style={{ background: "linear-gradient(160deg, #faf5f7 0%, #f8fafc 60%, #f3f4f6 100%)" }}>

        {/* Banner de saudação */}
        <div
          className="relative overflow-hidden px-6 pt-7 pb-6 mb-1"
          style={{ background: "linear-gradient(135deg, #95304e 0%, #6b1f37 55%, #3d0f20 100%)" }}
        >
          {/* Círculos decorativos de fundo */}
          <div className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-28 w-28 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />

          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-rose-200/80" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-200/70">
                  {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                <Greeting name={userName.split(" ")[0]} />
              </h2>
              <p className="text-sm text-rose-200/70 mt-1">Aqui está o resumo do seu escritório hoje.</p>
            </div>
            {/* Mini-stat rápido no banner */}
            <div className="flex items-center gap-3">
              {[
                { label: "Clientes", value: data.totalClients },
                { label: "Em Triagem", value: data.totalLeads },
                { label: "Processos", value: data.activeProcesses },
              ].map((s) => (
                <div key={s.label} className="text-center px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.10)" }}>
                  <p className="text-lg font-extrabold text-white leading-none">{s.value}</p>
                  <p className="text-[10px] text-rose-200/70 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.label} href={card.href}>
                  <Card className="border-0 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full overflow-hidden group" style={{ background: "white" }}>
                    <CardContent className="p-5">
                      {/* Linha colorida no topo */}
                      <div className={cn("absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity", card.bg.replace("bg-", "bg-"))} />
                      <div className="flex items-center justify-between mb-4">
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm", card.bg)}>
                          <Icon className={cn("h-5 w-5", card.color)} />
                        </div>
                        {"trendUp" in card && (
                          <span className={cn(
                            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
                            card.trendUp
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-500"
                          )}>
                            {card.trendUp
                              ? <ArrowUpRight className="h-3 w-3" />
                              : <ArrowDownRight className="h-3 w-3" />}
                            {card.trendUp ? `+${data.conversionTrend}%` : `${data.conversionTrend}%`}
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">{card.value}</p>
                      <p className="text-xs font-bold text-gray-600 mt-2">{card.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Alertas operacionais */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-gray-200/60" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2">Acompanhamento Diário</p>
              <div className="h-px flex-1 bg-gray-200/60" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {alertCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link key={card.label} href={card.href}>
                    <div className={cn(
                      "relative rounded-2xl border p-4 flex flex-col gap-2.5 hover:shadow-md transition-all duration-200 cursor-pointer h-full overflow-hidden group",
                      card.urgent && card.value > 0 ? `${card.border} ${card.bg}` : "border-gray-100 bg-white"
                    )}>
                      {card.urgent && card.value > 0 && (
                        <div className="absolute top-0 right-0 h-12 w-12 rounded-bl-[2rem] opacity-20" style={{ background: "currentColor" }} />
                      )}
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-xl",
                          card.urgent && card.value > 0 ? `${card.bg} border ${card.border}` : "bg-gray-100"
                        )}>
                          <Icon className={cn("h-4 w-4", card.urgent && card.value > 0 ? card.color : "text-gray-400")} />
                        </div>
                        {card.urgent && card.value > 0 && (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <p className={cn("text-2xl font-black", card.urgent && card.value > 0 ? card.color : "text-gray-800")}>
                        {card.value}
                      </p>
                      <div>
                        <p className="text-[11px] font-semibold text-gray-600 leading-tight">{card.label}</p>
                        {"sub" in card && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
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
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 px-5 pt-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
                      <Users className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-gray-800">Funil de Triagem</CardTitle>
                  </div>
                  <Link
                    href="/leads"
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-rose-50"
                    style={{ color: PRIMARY }}
                  >
                    Ver todos →
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                {data.leadsByStage.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">Nenhum estágio cadastrado.</p>
                ) : (
                  <div className="space-y-4">
                    {data.leadsByStage.map((stage) => {
                      const total = data.leadsByStage.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                      return (
                        <div key={stage.slug}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-700 font-semibold truncate flex-1">{stage.stage}</span>
                            <div className="flex items-center gap-2.5 ml-3 shrink-0">
                              <span className="text-[11px] font-medium text-gray-400">{pct}%</span>
                              <span className="text-sm font-black text-gray-900 w-6 text-right">{stage.count}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">Total em triagem</span>
                      <span className="text-base font-black text-gray-900">{data.totalLeads}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Processos recentes */}
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 px-5 pt-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50">
                      <Scale className="h-3.5 w-3.5 text-purple-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-gray-800">Processos Recentes</CardTitle>
                  </div>
                  <Link
                    href="/processos"
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-rose-50"
                    style={{ color: PRIMARY }}
                  >
                    Ver todos →
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                {data.recentProcesses.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 mx-auto mb-3">
                      <Scale className="h-7 w-7 text-gray-200" />
                    </div>
                    <p className="text-sm text-gray-400">Nenhum processo ativo</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.recentProcesses.map((p) => (
                      <Link key={p.id} href={`/processos/${p.id}`}>
                        <div className="group rounded-xl border border-gray-100 bg-gray-50/40 px-3.5 py-3 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-150">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <p className="text-xs font-bold text-gray-800 truncate flex-1">
                              {p.client?.name ?? "Sem cliente"}
                            </p>
                            {p.legalArea && (
                              <span className="text-[10px] font-semibold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded-md shrink-0">{p.legalArea}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-mono">
                            {p.number && p.number !== "(a definir)" ? p.number : p.title ?? "Sem número"}
                          </p>
                          {p.lastMovement && (
                            <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-1 leading-snug">{p.lastMovement}</p>
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
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 px-5 pt-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50">
                      <UserPlus className="h-3.5 w-3.5 text-rose-500" />
                    </div>
                    <CardTitle className="text-sm font-bold text-gray-800">Triagem Recente</CardTitle>
                  </div>
                  <Link
                    href="/leads"
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-rose-50"
                    style={{ color: PRIMARY }}
                  >
                    Ver triagem →
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                {data.recentLeads.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">Nenhum lead ainda.</p>
                ) : (
                  <div className="space-y-1">
                    {data.recentLeads.map((lead) => (
                      <div key={lead.id} className="flex items-center gap-3 py-2 px-1 rounded-xl hover:bg-gray-50 transition-colors">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[11px] font-black text-white shadow-sm"
                          style={{ background: "linear-gradient(135deg, #95304e, #6b1f37)" }}
                        >
                          {lead.name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{lead.name}</p>
                          <p className="text-[11px] text-gray-400">{lead.legalArea ?? lead.phone ?? "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {lead.stage && (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold text-white shadow-sm"
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
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 px-5 pt-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                      <Activity className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <CardTitle className="text-sm font-bold text-gray-800">Atividade Recente</CardTitle>
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <span className="text-[10px] text-gray-300 font-medium">Ao vivo</span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                {data.recentNotifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 mx-auto mb-3">
                      <Bell className="h-7 w-7 text-gray-200" />
                    </div>
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
                          <div className="flex flex-col items-center">
                            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-xl mt-1 shadow-sm", cfg.bg)}>
                              <Icon className={cn("h-3.5 w-3.5", cfg.iconClass)} />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1 mb-1" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-3">
                            <p className={cn("text-xs font-bold leading-snug truncate", notif.read ? "text-gray-500" : "text-gray-900")}>
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
                            <div className="shrink-0 mt-2.5">
                              <span className="h-2 w-2 rounded-full bg-blue-500 block shadow-sm" style={{ boxShadow: "0 0 6px rgba(59,130,246,0.5)" }} />
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
