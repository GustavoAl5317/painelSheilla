import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Scale, FileText, Clock, AlertCircle, CheckCircle2, Circle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AcompanharPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: {
      organization: { select: { name: true, logo: true, primaryColor: true } },
      processes: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
        include: {
          deadlines: {
            where: { status: { not: "COMPLETED" } },
            orderBy: { dueDate: "asc" },
            take: 5,
          },
          caseCards: {
            include: {
              entries: {
                where: { shareWithClient: true },
                orderBy: { createdAt: "desc" },
                take: 10,
              },
            },
          },
        },
      },
    },
  });

  if (!client) return notFound();

  const org = client.organization;
  const primaryColor = org.primaryColor ?? "#1a56db";
  const firstName = client.name.split(" ")[0];

  const statusLabels: Record<string, string> = {
    ACTIVE: "Em andamento",
    SUSPENDED: "Suspenso",
    CONCLUDED: "Concluído",
    ARCHIVED: "Arquivado",
  };

  const deadlineStatusIcon = (status: string, dueDate: Date) => {
    const daysLeft = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (status === "COMPLETED") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
    if (daysLeft < 0) return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (daysLeft <= 7) return <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    return <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  };

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const entrySourceLabel: Record<string, string> = {
    COMMENT: "Observação",
    DJEN: "Diário Oficial",
    PJE: "PJE",
    SYSTEM: "Sistema",
    TRAMITACAO_INTELIGENTE: "Nova publicação",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ backgroundColor: primaryColor }} className="text-white py-6 px-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {org.logo ? (
            <img src={org.logo} alt={org.name} className="h-10 w-10 rounded-full object-cover bg-white" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="text-sm opacity-80">{org.name}</p>
            <h1 className="text-xl font-semibold">Acompanhamento processual</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Saudação */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-gray-500 text-sm">Olá, {firstName}! Aqui está o status dos seus processos.</p>
        </div>

        {client.processes.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum processo cadastrado ainda.</p>
            <p className="text-sm mt-1">Em caso de dúvidas, entre em contato com o escritório.</p>
          </div>
        )}

        {client.processes.map(proc => {
          const entries = proc.caseCards?.[0]?.entries ?? [];
          const prazos = proc.deadlines ?? [];

          return (
            <div key={proc.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Cabeçalho do processo */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {statusLabels[proc.status] ?? proc.status}
                      </span>
                      {proc.legalArea && (
                        <span className="text-xs text-gray-500">{proc.legalArea}</span>
                      )}
                    </div>
                    {proc.number && (
                      <p className="text-sm font-mono text-gray-700 mt-1">{proc.number}</p>
                    )}
                    {proc.title && (
                      <p className="font-semibold text-gray-900 mt-0.5">{proc.title}</p>
                    )}
                    {proc.court && (
                      <p className="text-sm text-gray-500 mt-0.5">{proc.court}</p>
                    )}
                  </div>
                </div>

                {proc.lastMovement && (
                  <div className="mt-3 text-sm text-gray-600">
                    <span className="font-medium">Última movimentação: </span>
                    {proc.lastMovementAt ? formatDate(proc.lastMovementAt) : ""} — {proc.lastMovement.length > 120 ? `${proc.lastMovement.slice(0, 120)}…` : proc.lastMovement}
                  </div>
                )}
              </div>

              {/* Prazos */}
              {prazos.length > 0 && (
                <div className="p-5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Prazos</p>
                  <div className="space-y-2">
                    {prazos.map(d => (
                      <div key={d.id} className="flex items-start gap-2">
                        {deadlineStatusIcon(d.status, d.dueDate)}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 leading-tight">{d.title}</p>
                          <p className="text-xs text-gray-500">{formatDate(d.dueDate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Atualizações compartilhadas */}
              {entries.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Atualizações</p>
                  <div className="space-y-4">
                    {entries.map(e => (
                      <div key={e.id} className="flex gap-3">
                        <div className="mt-0.5">
                          <Circle className="w-2 h-2 fill-blue-400 text-blue-400 mt-1.5 flex-shrink-0" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-500">
                              {entrySourceLabel[e.source] ?? e.source}
                            </span>
                            <span className="text-xs text-gray-400">{formatDate(e.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{e.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-400 pb-4">
          Esta página é atualizada automaticamente conforme o andamento dos processos.<br />
          Em caso de dúvidas, entre em contato diretamente com o escritório.
        </p>
      </div>
    </div>
  );
}
