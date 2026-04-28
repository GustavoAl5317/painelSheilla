import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Scale, FileText, Gavel, Plug, Info } from "lucide-react";
import { PJeSyncButton } from "@/components/integracoes/pje-sync-button";
import { SyncButton } from "@/components/integracoes/sync-button";

const availableIntegrations = [
  { type: "ZAPI",          name: "Z-API",        description: "Conecte o WhatsApp do escritório via Z-API para envio e recebimento de mensagens.", category: "WhatsApp",  requiresPlan: "STARTER", logo: "📱", color: "bg-green-50 text-green-600" },
  { type: "EVOLUTION_API", name: "Evolution API", description: "Alternativa open-source ao Z-API para integração WhatsApp.",                      category: "WhatsApp",  requiresPlan: "STARTER", logo: "🔗", color: "bg-green-50 text-green-600" },
  { type: "TRELLO",        name: "Trello",        description: "Sincronize clientes como cards no Trello com dados completos da triagem e histórico.", category: "Gestão", requiresPlan: "PRO",     logo: "📋", color: "bg-blue-50 text-blue-600" },
  { type: "BITRIX",        name: "Bitrix24",      description: "Envie leads e tarefas automaticamente para o seu Bitrix24.",                        category: "Gestão",   requiresPlan: "PRO",     logo: "🏢", color: "bg-blue-50 text-blue-600" },
  { type: "HUBSPOT",       name: "HubSpot",       description: "Integração com HubSpot CRM para escritórios que já usam a plataforma.",             category: "Gestão",   requiresPlan: "PREMIUM", logo: "🟠", color: "bg-orange-50 text-orange-600" },
  { type: "ZAPIER",        name: "Zapier",        description: "Conecte com mais de 5.000 apps via Zapier usando webhooks.",                        category: "Automação", requiresPlan: "PRO",    logo: "⚡", color: "bg-yellow-50 text-yellow-600" },
];

const planOrder: Record<string, number> = { STARTER: 0, PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };

export default async function IntegracoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  const orgPlanOrder = planOrder[org.plan];
  const isUnlocked = (p: string) => orgPlanOrder >= planOrder[p];
  const categories = ["WhatsApp", "Gestão", "Automação"];

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Integrações" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Subheader */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <Plug className="h-4.5 w-4.5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Módulos e Integrações</p>
              <p className="text-xs text-gray-400">O AdvZap funciona completo sem elas — são opcionais</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Banner info */}
          <div className="flex items-start gap-3 rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              As integrações são <strong>módulos opcionais</strong>. O AdvZap funciona 100% sem elas — tudo que você precisa está no CRM interno.
            </p>
          </div>

          {/* Gestão Processual — nativa */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Gestão Processual</h2>
              <Badge variant="success" className="text-[10px]">Incluído no plano</Badge>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Tramitação Inteligente */}
              <Card className="border-indigo-100 bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 mb-3">
                    <Gavel className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-bold text-gray-900 text-sm">Tramitação Inteligente</p>
                    <Badge variant="success" className="text-[10px]">Incluído</Badge>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">
                    Importa clientes da TI (nome, CPF, telefone, endereço, documentos). Ao converter um lead, vincula automaticamente pelo CPF.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">TI → Clientes</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Vincula por CPF</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">WhatsApp</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">
                    Configure em <strong>Configurações → Credenciais → Tramitação Inteligente</strong>.
                  </p>
                  <SyncButton label="Importar clientes" endpoint="/api/ti/sync" organizationId={orgId} resultFormat="created-updated-skipped" />
                </CardContent>
              </Card>

              {/* DJEN */}
              <Card className="border-orange-100 bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 mb-3">
                    <FileText className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-bold text-gray-900 text-sm">DJEN</p>
                    <Badge variant="success" className="text-[10px]">Incluído</Badge>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">
                    Monitora publicações no Diário da Justiça Eletrônico pelo número da OAB. Vincula ao cliente pelo CPF e notifica a equipe.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Por OAB</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Vincula por CPF</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Alerta</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">
                    Configure em <strong>Configurações → Credenciais → DJEN</strong>.
                  </p>
                  <SyncButton label="Sincronizar DJEN" endpoint="/api/djen/sync" organizationId={orgId} />
                </CardContent>
              </Card>

              {/* PJe */}
              <Card className="border-blue-100 bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 mb-3">
                    <Scale className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-bold text-gray-900 text-sm">PJe — ComunicaAPI</p>
                    <Badge variant="success" className="text-[10px]">Incluído</Badge>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">
                    Busca automaticamente intimações e citações no PJe via ComunicaAPI do CNJ. Credenciais configuradas pelo admin do servidor.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">CNJ / PJe</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Intimações</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Citações</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">
                    Credenciais via <code className="font-mono bg-gray-100 px-1 rounded">PJE_USERNAME</code> / <code className="font-mono bg-gray-100 px-1 rounded">PJE_PASSWORD</code> no <code className="font-mono bg-gray-100 px-1 rounded">.env</code>.
                  </p>
                  <PJeSyncButton organizationId={orgId} />
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Outras integrações por categoria */}
          {categories.map((category) => {
            const items = availableIntegrations.filter((i) => i.category === category);
            return (
              <section key={category}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">{category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map((integration) => {
                    const unlocked = isUnlocked(integration.requiresPlan);
                    return (
                      <Card
                        key={integration.type}
                        className={`bg-white hover:shadow-md transition-shadow ${!unlocked ? "opacity-60" : ""}`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0 ${integration.color.split(" ")[0]}`}>
                              {integration.logo}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-bold text-gray-900 text-sm">{integration.name}</p>
                                {!unlocked && (
                                  <Badge variant="secondary" className="gap-1 text-[10px]">
                                    <Lock className="h-2.5 w-2.5" /> {integration.requiresPlan}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 leading-relaxed mb-4">{integration.description}</p>
                              <Button size="sm" variant={unlocked ? "default" : "secondary"} disabled={!unlocked} className="w-full">
                                {!unlocked ? "Requer plano " + integration.requiresPlan : "Configurar"}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
