import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Scale, ChevronRight, LinkIcon, CheckCircle2, UserPlus } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { NovoClienteButton } from "@/components/clientes/novo-cliente-button";
import { cn } from "@/lib/utils";

export default async function ClientesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    include: {
      processes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, title: true, status: true, legalArea: true },
      },
    },
  });

  const statusDot: Record<string, string> = {
    ACTIVE: "bg-emerald-500",
    SUSPENDED: "bg-amber-500",
    ARCHIVED: "bg-gray-400",
    CONCLUDED: "bg-blue-400",
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Clientes" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Subheader */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <UserPlus className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{clients.length} cliente{clients.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-gray-400">Base de clientes do escritório</p>
            </div>
          </div>
          <NovoClienteButton organizationId={orgId} />
        </div>

        <div className="p-6">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
                <UserPlus className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-base font-medium text-gray-500">Nenhum cliente cadastrado</p>
              <p className="text-sm text-gray-400 mt-1">Adicione o primeiro cliente do escritório</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {clients.map((client) => (
                <Card key={client.id} className="group hover:border-blue-200 hover:shadow-md transition-all duration-200 bg-white">
                  <CardContent className="p-0">
                    {/* Header do card */}
                    <Link href={`/clientes/${client.id}`} className="flex items-center gap-3 p-4 pb-3 border-b border-gray-50">
                      <Avatar className="h-11 w-11 shrink-0 ring-2 ring-gray-100 group-hover:ring-blue-100 transition-all">
                        <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors text-sm">
                            {client.name}
                          </p>
                          <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0 group-hover:text-blue-400 transition-colors" />
                        </div>
                        {client.cpf && (
                          <p className="text-[11px] text-gray-400 font-mono mt-0.5">CPF: {client.cpf}</p>
                        )}
                        {client.tramitacaoSyncStatus === "Sincronizado" && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600 font-semibold">Sync TI</span>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Contatos */}
                    <div className="px-4 py-3 space-y-1.5">
                      {client.phone ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                          <span>{client.phone}</span>
                        </div>
                      ) : null}
                      {client.email ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
                          <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      ) : null}
                      {!client.phone && !client.email && (
                        <p className="text-xs text-gray-300 italic">Sem contato cadastrado</p>
                      )}
                    </div>

                    {/* Processos */}
                    <div className="border-t border-gray-50 px-4 py-3">
                      {client.processes.length > 0 ? (
                        <>
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Scale className="h-3.5 w-3.5 text-purple-400" />
                            <p className="text-xs font-semibold text-gray-500">
                              {client.processes.length} processo{client.processes.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            {client.processes.slice(0, 2).map((proc) => (
                              <Link key={proc.id} href={`/processos/${proc.id}`}>
                                <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors cursor-pointer">
                                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 mt-1.5", statusDot[proc.status] ?? "bg-gray-400")} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-gray-800 truncate">
                                      {proc.title ?? "Sem título"}
                                    </p>
                                    {proc.number && proc.number !== "(a definir)" ? (
                                      <p className="text-[10px] font-mono text-gray-400 truncate">{proc.number}</p>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <LinkIcon className="h-2.5 w-2.5 text-amber-400" />
                                        <span className="text-[10px] text-amber-500">Nº não vinculado</span>
                                      </div>
                                    )}
                                    {proc.legalArea && (
                                      <Badge variant="secondary" className="text-[9px] mt-0.5 py-0 h-4">
                                        {proc.legalArea}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}
                            {client.processes.length > 2 && (
                              <p className="text-[10px] text-gray-400 text-center pt-0.5">
                                +{client.processes.length - 2} processo{client.processes.length - 2 !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-300 flex items-center gap-1.5 italic">
                          <Scale className="h-3 w-3" /> Nenhum processo vinculado
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
