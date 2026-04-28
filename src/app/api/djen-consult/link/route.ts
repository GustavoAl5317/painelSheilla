import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { interpretLegalMovement } from "@/lib/ai/ai-service";
import { appendCaseCardEntry } from "@/lib/case-card";
import { z } from "zod";

const bodySchema = z.object({
  processId: z.string().min(1),
  clientId: z.string().min(1),
  // Dados da publicação para gerar resumo da IA e gravar no card
  rawText: z.string().min(1),
  processo: z.string(),
  dataPublicacao: z.string(),
  siglaTribunal: z.string().nullable().optional(),
  comunicaId: z.number(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const body = await req.json();

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { processId, clientId, rawText, processo, dataPublicacao, siglaTribunal, comunicaId } = parsed.data;

  // Verifica que o processo e o cliente pertencem à org
  const [proc, client] = await Promise.all([
    prisma.process.findFirst({ where: { id: processId, organizationId: orgId } }),
    prisma.client.findFirst({ where: { id: clientId, organizationId: orgId } }),
  ]);

  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Resolve credenciais de IA
  const [openaiKey, anthropicKey] = await Promise.all([
    resolveCredential(orgId, "OPENAI_API_KEY"),
    resolveCredential(orgId, "ANTHROPIC_API_KEY"),
  ]);
  const aiProvider = anthropicKey ? "anthropic" : openaiKey ? "openai" : null;
  const aiKey = anthropicKey ?? openaiKey ?? null;

  // Interpreta a publicação com IA
  let interpretation: {
    tipoMovimentacao: string;
    resumo: string;
    mensagemCliente: string;
    diasPrazo?: number;
  } = {
    tipoMovimentacao: "Publicação Judicial",
    resumo: rawText.slice(0, 300),
    mensagemCliente: `Nova movimentação no processo ${processo}.`,
  };

  if (aiKey && aiProvider) {
    try {
      interpretation = await interpretLegalMovement(rawText, aiKey, aiProvider);
    } catch { /* ignora falha de IA */ }
  }

  // Vincula cliente ao processo
  await prisma.process.update({
    where: { id: processId },
    data: {
      clientId,
      lastMovement: `[${interpretation.tipoMovimentacao}] ${interpretation.resumo}`,
      lastMovementAt: new Date(),
    },
  });

  // Grava entrada no card do processo com resumo da IA
  const cardText = [
    `**${interpretation.tipoMovimentacao}** (${dataPublicacao})`,
    siglaTribunal ? `Tribunal: ${siglaTribunal}` : "",
    interpretation.resumo,
  ].filter(Boolean).join("\n");

  await appendCaseCardEntry(orgId, clientId, {
    source: "DJEN",
    content: cardText,
    processId,
  });

  // Deduplicação: cria deadline para não reprocessar essa publicação
  const deadlineTitle = `DJEN — ${processo} [ref. ${comunicaId}]`;
  const existing = await prisma.deadline.findFirst({ where: { organizationId: orgId, title: deadlineTitle } });
  if (!existing) {
    const dueDate = new Date();
    if (interpretation.diasPrazo) dueDate.setDate(dueDate.getDate() + interpretation.diasPrazo);

    await prisma.deadline.create({
      data: {
        organizationId: orgId,
        title: deadlineTitle,
        description: [
          `**Tipo:** ${interpretation.tipoMovimentacao}`,
          siglaTribunal ? `**Tribunal:** ${siglaTribunal}` : "",
          `**Resumo:** ${interpretation.resumo}`,
        ].filter(Boolean).join("\n"),
        dueDate,
        processId,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    resumo: interpretation.resumo,
    tipoMovimentacao: interpretation.tipoMovimentacao,
  });
}
