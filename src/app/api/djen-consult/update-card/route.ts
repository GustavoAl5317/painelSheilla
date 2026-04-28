import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { interpretLegalMovement } from "@/lib/ai/ai-service";
import { appendCaseCardEntry } from "@/lib/case-card";
import { z } from "zod";

const bodySchema = z.object({
  clientId: z.string().min(1),
  processId: z.string().min(1),
  rawText: z.string().min(1),
  processo: z.string(),
  dataPublicacao: z.string(),
  siglaTribunal: z.string().nullable().optional(),
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

  const { clientId, processId, rawText, processo, dataPublicacao, siglaTribunal } = parsed.data;

  const [proc, client] = await Promise.all([
    prisma.process.findFirst({ where: { id: processId, organizationId: orgId } }),
    prisma.client.findFirst({ where: { id: clientId, organizationId: orgId } }),
  ]);

  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const [openaiKey, anthropicKey] = await Promise.all([
    resolveCredential(orgId, "OPENAI_API_KEY"),
    resolveCredential(orgId, "ANTHROPIC_API_KEY"),
  ]);
  const aiProvider = anthropicKey ? "anthropic" : openaiKey ? "openai" : null;
  const aiKey = anthropicKey ?? openaiKey ?? null;

  let interpretation: { tipoMovimentacao: string; resumo: string; mensagemCliente: string; diasPrazo?: number } = {
    tipoMovimentacao: "Publicação Judicial",
    resumo: rawText.slice(0, 300),
    mensagemCliente: `Nova movimentação no processo ${processo}.`,
  };

  if (aiKey && aiProvider) {
    try {
      interpretation = await interpretLegalMovement(rawText, aiKey, aiProvider);
    } catch { /* ignora falha de IA */ }
  }

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

  await prisma.process.update({
    where: { id: processId },
    data: {
      lastMovement: `[${interpretation.tipoMovimentacao}] ${interpretation.resumo}`,
      lastMovementAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    resumo: interpretation.resumo,
    tipoMovimentacao: interpretation.tipoMovimentacao,
  });
}
