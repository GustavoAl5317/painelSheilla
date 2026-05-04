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
      <div className="flex-1 overflow-y-auto p-6 w-full space-y-6 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-6">
          <Link
            href="/clientes"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200 w-fit"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para Clientes
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Principal (Dados e Processos) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Card de Perfil */}
              <Card className="overflow-hidden border-none shadow-md">
                <div className="h-24 bg-gradient-to-r from-blue-600 to-blue-400"></div>
                <CardContent className="p-6 relative pt-0">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-5 -mt-10">
                      <Avatar className="h-24 w-24 border-4 border-white shadow-sm">
                        <AvatarFallback className="text-3xl bg-slate-100 text-blue-700 font-bold">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="pt-12">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{client.name}</h2>
                        <p className="text-sm text-slate-500 font-medium">Cliente desde {formatDate(client.createdAt)}</p>
                      </div>
                    </div>
                    <div className="pt-4">
                      <DeleteClientButton clientId={client.id} clientName={client.name} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-8">
                    {client.cpf && (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CPF</span>
                        <span className="text-slate-700 font-mono mt-0.5">{client.cpf}</span>
                      </div>
                    )}
                    {client.rg && (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">RG</span>
                        <span className="text-slate-700 font-mono mt-0.5">{client.rg}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Telefone</span>
                        <div className="flex items-center gap-2 text-slate-700 mt-0.5">
                          <Phone className="h-4 w-4 text-blue-500" />
                          {client.phone}
                        </div>
                      </div>
                    )}
                    {client.email && (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">E-mail</span>
                        <div className="flex items-center gap-2 text-slate-700 mt-0.5">
                          <Mail className="h-4 w-4 text-blue-500" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex flex-col md:col-span-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Endereço</span>
                        <div className="flex items-start gap-2 text-slate-700 mt-0.5">
                          <MapPin className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                          <span>{client.address}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Anotações */}
              {client.notes && (
                <Card className="border-none shadow-md overflow-hidden">
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-5 w-5 text-amber-600" />
                      <h3 className="font-semibold text-amber-900">Anotações do Cliente</h3>
                    </div>
                    <p className="text-amber-800 text-sm leading-relaxed whitespace-pre-wrap">{client.notes}</p>
                  </div>
                </Card>
              )}

              {/* Processos */}
              <Card className="border-none shadow-md">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Scale className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-slate-800">Processos Vinculados</CardTitle>
                      <p className="text-sm text-slate-500">{client.processes.length} processo(s) encontrado(s)</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {client.processes.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <AlertCircle className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">Nenhum processo cadastrado</p>
                      <p className="text-sm text-slate-400 mt-1">Os processos vinculados a este cliente aparecerão aqui.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {client.processes.map((proc) => {
                        const status = statusConfig[proc.status];
                        return (
                          <Link key={proc.id} href={`/processos/${proc.id}`} className="block hover:bg-slate-50 transition-colors">
                            <div className="p-5 flex items-start gap-4">
                              <div className={cn("h-3 w-3 rounded-full shrink-0 mt-1.5 shadow-sm", status.dot)} />
                              <div className="flex-1 min-w-0">
                                <p className="text-base font-semibold text-slate-900 truncate">{proc.title ?? "Sem título"}</p>
                                <div className="flex items-center gap-3 mt-1.5">
                                  {proc.number && proc.number !== "(a definir)" ? (
                                    <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      {proc.number}
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                      <LinkIcon className="h-3 w-3 text-amber-500" />
                                      <span className="text-xs font-medium text-amber-700">Número pendente</span>
                                    </div>
                                  )}
                                  {proc.legalArea && (
                                    <Badge variant="outline" className="text-xs text-slate-600 border-slate-200">
                                      {proc.legalArea}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 shrink-0 mt-2" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Coluna Lateral (Integrações) */}
            <div className="space-y-6">
              <Card className="border-none shadow-md">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 rounded-md">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    Integrações
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  
                  {/* Tramitação */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Tramitação Inteligente</h4>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <TramitacaoSyncButton
                        clientId={client.id}
                        organizationId={orgId}
                        syncStatus={client.tramitacaoSyncStatus}
                        tramitacaoCustomerId={client.tramitacaoCustomerId}
                      />
                    </div>
                  </div>

                  {/* Trello */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trello CRM</h4>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <TrelloSyncButton
                        clientId={client.id}
                        organizationId={orgId}
                        trelloCardUrl={client.trelloCardUrl}
                      />
                    </div>
                  </div>

                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
