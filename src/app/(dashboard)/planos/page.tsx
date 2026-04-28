import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const planLabels: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  PREMIUM: "Premium",
  ENTERPRISE: "Enterprise",
};

const planColors: Record<string, string> = {
  STARTER: "border-gray-200",
  PRO: "border-blue-400",
  PREMIUM: "border-purple-400",
  ENTERPRISE: "border-amber-400",
};

export default async function PlanosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  const [plans, org] = await Promise.all([
    prisma.planLimit.findMany({ orderBy: { priceMonthly: "asc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);
  const currentPlan = org.plan;

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Planos & Limites" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Escolha seu plano</h2>
          <p className="text-gray-500 mt-2">
            Plano atual: <span className="font-semibold text-blue-600">{planLabels[currentPlan]}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.plan;
            const isPopular = plan.plan === "PRO";

            return (
              <Card
                key={plan.id}
                className={cn("relative hover:shadow-md transition-shadow", planColors[plan.plan], isPopular && "shadow-blue-100 shadow-lg")}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white px-3">Mais popular</Badge>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-3">
                    <Badge variant="success">Atual</Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">{planLabels[plan.plan]}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900">R${plan.priceMonthly}</span>
                    <span className="text-gray-400 text-sm">/mês</span>
                  </div>
                  <p className="text-xs text-gray-400">ou R${plan.priceYearly}/ano (2 meses grátis)</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: `${plan.maxUsers} usuário(s)`, ok: true },
                    {
                      label: `${plan.maxLeadsPerMonth === 999999 ? "Ilimitados" : plan.maxLeadsPerMonth} leads/mês`,
                      ok: true,
                    },
                    {
                      label: `${plan.maxAIMessages === 999999 ? "Ilimitadas" : plan.maxAIMessages} msgs IA`,
                      ok: true,
                    },
                    { label: "Alertas automáticos", ok: plan.allowAlerts },
                    { label: "Relatórios", ok: plan.allowReports },
                    { label: "Integrações externas", ok: plan.allowIntegrations },
                    { label: "API Key própria", ok: plan.allowCustomAIKey },
                  ].map((feature) => (
                    <div key={feature.label} className="flex items-center gap-2.5">
                      {feature.ok ? <Check className="h-4 w-4 text-green-500 shrink-0" /> : <X className="h-4 w-4 text-gray-200 shrink-0" />}
                      <span className={cn("text-sm", feature.ok ? "text-gray-700" : "text-gray-300")}>{feature.label}</span>
                    </div>
                  ))}
                  <div className="pt-4">
                    <Button className="w-full" variant={isCurrent ? "outline" : "default"} disabled={isCurrent}>
                      {isCurrent ? "Plano atual" : "Assinar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
