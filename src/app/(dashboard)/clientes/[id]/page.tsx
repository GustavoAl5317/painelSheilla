import { notFound } from "next/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Phone, Mail, MapPin, FileText, Scale,
  ChevronLeft, Clock, AlertCircle, LinkIcon,
} from "lucide-react";
import { getInitials, formatDate } from "@/lib/utils";
import { DeleteClientButton } from "@/components/clientes/delete-client-button";
import { TramitacaoSyncButton } from "@/components/clientes/tramitacao-sync-button";
import { TrelloSyncButton } from "@/components/clientes/trello-sync-button";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: "Ativo", dot: "bg-emerald-500" },
  SUSPENDED: { label: "Suspenso", dot: "bg-amber-500" },
  ARCHIVED: { label: "Arquivado", dot: "bg-gray-400" },
  CONCLUDED: { label: "Concluído", dot: "bg-blue-400" },
};

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, organizationId: orgId },
    include: {
      processes: {
        where: {
          AND: [
            { number: { not: null } },
            { number: { not: "" } },
            { number: { not: "(a definir)" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) notFound();

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Ficha do Cliente" />
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl space-y-6">
        <Link
          href="/clientes"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Clientes
        </Link>

        {/* Dados pessoais */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="text-lg bg-blue-50 text-blue-700">
                    {getInitials(client.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
                  {client.cpf && <p className="text-sm text-gray-400 font-mono">CPF: {client.cpf}</p>}
                  {client.rg && <p className="text-sm text-gray-400 font-mono">RG: {client.rg}</p>}
                  <p className="text-xs text-gray-400 mt-1">Cliente desde {formatDate(client.createdAt)}</p>
                </div>
              </div>
              <DeleteClientButton clientId={client.id} clientName={client.name} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-100">
              {client.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                  {client.phone}
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600 truncate">
                  <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                  {client.email}
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                  {client.address}
                </div>
              )}
            </div>

            {client.notes && (
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700">{client.notes}</p>
                </div>
              </div>
            )}

            {/* Tramitação Inteligente */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                Tramitação Inteligente
              </p>
              <TramitacaoSyncButton
                clientId={client.id}
                organizationId={orgId}
                syncStatus={client.tramitacaoSyncStatus}
                tramitacaoCustomerId={client.tramitacaoCustomerId}
              />

              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                  Trello CRM
                </p>
                <TrelloSyncButton
                  clientId={client.id}
                  organizationId={orgId}
                  trelloCardUrl={client.trelloCardUrl}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processos vinculados */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-base">Processos ({client.processes.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {client.processes.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum processo cadastrado</p>
            ) : (
              client.processes.map((proc) => {
                const status = statusConfig[proc.status];
                return (
                  <Link key={proc.id} href={`/processos/${proc.id}`}>
                    <div
                      className={cn(
                        "flex items-start gap-3 p-3.5 rounded-xl border hover:border-blue-200 transition-colors cursor-pointer",
                        "border-gray-100 bg-gray-50/50"
                      )}
                    >
                      <div className={cn("h-2 w-2 rounded-full shrink-0 mt-2", status.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{proc.title ?? "Sem título"}</p>
                        {proc.number && proc.number !== "(a definir)" ? (
                          <p className="text-[11px] font-mono text-gray-400">{proc.number}</p>
                        ) : (
                          <div className="flex items-center gap-1">
                            <LinkIcon className="h-3 w-3 text-amber-400" />
                            <span className="text-[11px] text-amber-500">Número não vinculado</span>
                          </div>
                        )}
                        {proc.legalArea && (
                          <Badge variant="secondary" className="text-[10px] mt-1.5">
                            {proc.legalArea}
                          </Badge>
                        )}
                      </div>

                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
