import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/layout/topbar";
import { PromptsPage } from "@/components/prompts/prompts-page";
import { SHEILA_PROMPT, SHEILA_PROMPT_NAME } from "@/lib/ai/default-prompt";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const orgId = (session.user as { organizationId: string }).organizationId;

  // Garante que o prompt principal existe e está atualizado
  const existing = await prisma.promptTemplate.findFirst({
    where: { organizationId: orgId, name: SHEILA_PROMPT_NAME },
  });

  if (!existing) {
    // Remove isDefault de todos os outros antes de criar o novo como padrão
    await prisma.promptTemplate.updateMany({
      where: { organizationId: orgId, isDefault: true },
      data: { isDefault: false },
    });
    await prisma.promptTemplate.create({
      data: {
        name: SHEILA_PROMPT_NAME,
        description: "Prompt completo de triagem para leads via WhatsApp. Atua nas áreas Trabalhista, Acidente de Trabalho e Previdenciário/INSS.",
        content: SHEILA_PROMPT,
        isSystem: false,
        isDefault: true,
        organizationId: orgId,
      },
    });
  } else if (existing.content !== SHEILA_PROMPT) {
    // Atualiza o conteúdo se o prompt do código mudou
    await prisma.promptTemplate.update({
      where: { id: existing.id },
      data: { content: SHEILA_PROMPT },
    });
  }

  const templates = await prisma.promptTemplate.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Modelos de Prompt" />
      <div className="flex-1 overflow-y-auto p-6">
        <PromptsPage initialTemplates={templates as any} />
      </div>
    </div>
  );
}
