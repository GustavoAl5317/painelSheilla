import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, KeyRound, Settings2, Bot } from "lucide-react";
import { CredentialsManager } from "@/components/configuracoes/credentials-manager";
import { MassBlockManager } from "@/components/configuracoes/mass-block-manager";
import { OrgSettingsForm } from "@/components/configuracoes/org-settings-form";

const planLabels: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  PREMIUM: "Premium",
  ENTERPRISE: "Enterprise",
};

const planColors: Record<string, string> = {
  STARTER: "text-gray-700 bg-gray-100",
  PRO: "text-blue-700 bg-blue-100",
  PREMIUM: "text-purple-700 bg-purple-100",
  ENTERPRISE: "text-amber-700 bg-amber-100",
};

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const [org, aiConfig] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.aIConfig.findUnique({ where: { organizationId: orgId } }),
  ]);

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Configurações" />

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {/* Subheader */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(149,48,78,0.1)" }}>
              <Settings2 className="h-4 w-4" style={{ color: "#95304e" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{org.name}</p>
              <p className="text-xs text-gray-400">Configurações do escritório</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Coluna esquerda — campos editáveis */}
            <div className="space-y-6">
              <OrgSettingsForm
                initial={{
                  name: org.name,
                  email: org.email,
                  phone: org.phone,
                  primaryColor: org.primaryColor,
                  businessHoursStart: org.businessHoursStart,
                  businessHoursEnd: org.businessHoursEnd,
                  defaultGreeting: org.defaultGreeting,
                }}
              />
            </div>

            {/* Coluna direita */}
            <div className="space-y-6">
              {/* Plano atual */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                      <CreditCard className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Plano atual</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className={cn("text-lg font-bold px-3 py-1 rounded-lg", planColors[org.plan] ?? "text-gray-700 bg-gray-100")}>
                        {planLabels[org.plan]}
                      </span>
                      <p className="text-sm text-gray-500">Plano ativo</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/planos">Ver planos</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* IA */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                      <Bot className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Configuração de IA</CardTitle>
                      <CardDescription className="text-xs">
                        {aiConfig?.useGlobalKey ? "Usando IA incluída no plano" : "Usando API key própria"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiConfig ? (
                    <>
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">IA automática</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {aiConfig.isActive ? "Respondendo leads automaticamente" : "Desativada"}
                          </p>
                        </div>
                        <Badge variant={aiConfig.isActive ? "success" : "secondary"} className="shrink-0">
                          {aiConfig.isActive ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-gray-600">Prompt do sistema</p>
                        <textarea
                          defaultValue={aiConfig.systemPrompt ?? ""}
                          rows={5}
                          readOnly
                          className="flex w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm resize-none"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Nenhuma configuração de IA encontrada.</p>
                  )}
                </CardContent>
              </Card>

              {/* Bloqueio em massa */}
              <MassBlockManager />
            </div>

            {/* Credenciais — largura total */}
            <div className="xl:col-span-2">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
                      <KeyRound className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Credenciais & variáveis</CardTitle>
                      <CardDescription className="text-xs">
                        Configure integrações — valores criptografados no banco.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CredentialsManager orgPlan={org.plan} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
