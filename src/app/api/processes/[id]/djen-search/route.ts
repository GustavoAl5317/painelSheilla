import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchComunicacoesOAB, mapItemToPub } from "@/lib/djen-sync";
import { resolveCredential } from "@/lib/credentials";
import { interpretLegalMovement } from "@/lib/ai/ai-service";
import { appendCaseCardEntry } from "@/lib/case-card";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: processId } = await params;

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId: orgId },
    select: { id: true, number: true, clientId: true, lastDjenSearchAt: true },
  });
  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });

  if (!proc.number || proc.number === "(a definir)") {
    return NextResponse.json({ error: "Número do processo não definido. Edite o processo antes de pesquisar." }, { status: 400 });
  }

  const oabRaw = await resolveCredential(orgId, "DJEN_OAB");
  if (!oabRaw) {
    return NextResponse.json({ error: "Número OAB não configurado (DJEN_OAB) nas integrações." }, { status: 400 });
  }

  const oabs = oabRaw.split(",").map(s => s.trim()).filter(Boolean);

  const [openaiKey, anthropicKey] = await Promise.all([
    resolveCredential(orgId, "OPENAI_API_KEY"),
    resolveCredential(orgId, "ANTHROPIC_API_KEY"),
  ]);
  const aiProvider = anthropicKey ? "anthropic" : openaiKey ? "openai" : null;
  const aiKey = anthropicKey ?? openaiKey ?? null;

  // Busca nos últimos 365 dias para cobrir histórico do processo
  const d0 = new Date();
  d0.setFullYear(d0.getFullYear() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dataInicio = fmt(d0);
  const dataFim = fmt(new Date());

  const processNumberSlice = proc.number.replace(/[^\d]/g, "").slice(0, 20);

  // Coleta todas as publicações de todas as OABs e filtra pelo número do processo
  const newEntries: { content: string; comunicaId: number }[] = [];
  let totalFound = 0;

  for (const oab of oabs) {
    const numero = oab.replace(/[^0-9]/g, "");
    const uf = oab.replace(/[^a-zA-Z]/g, "").toUpperCase();

    let items;
    try {
      items = await fetchComunicacoesOAB(numero, uf, dataInicio, dataFim);
    } catch {
      continue;
    }

    for (const item of items) {
      const pub = mapItemToPub(item);
      const pubSlice = pub.processo.replace(/[^\d]/g, "").slice(0, 20);
      if (pubSlice !== processNumberSlice) continue;

      totalFound++;

      // Deduplicação: verifica se essa publicação já foi registrada no card
      const deadlineTitle = `DJEN — ${pub.processo} [ref. ${item.id}]`;
      const existing = await prisma.deadline.findFirst({
        where: { organizationId: orgId, title: deadlineTitle },
      });
      if (existing) continue;

      let interpretation: {
        tipoMovimentacao: string;
        resumo: string;
        mensagemCliente: string;
        diasPrazo?: number;
      } = {
        tipoMovimentacao: "Publicação Judicial",
        resumo: pub.rawText.slice(0, 300),
        mensagemCliente: `Nova movimentação no processo ${pub.processo}.`,
      };

      if (aiKey && aiProvider) {
        try {
          interpretation = await interpretLegalMovement(pub.rawText, aiKey, aiProvider);
        } catch { /* ignora falha de IA */ }
      }

      const dueDate = new Date();
      if (interpretation.diasPrazo) dueDate.setDate(dueDate.getDate() + interpretation.diasPrazo);

      await prisma.deadline.create({
        data: {
          organizationId: orgId,
          title: deadlineTitle,
          description: [
            `**Tipo:** ${interpretation.tipoMovimentacao}`,
            pub.siglaTribunal ? `**Tribunal:** ${pub.siglaTribunal}` : "",
            `**Resumo:** ${interpretation.resumo}`,
          ].filter(Boolean).join("\n"),
          dueDate,
          processId,
        },
      });

      await prisma.process.update({
        where: { id: processId },
        data: {
          lastMovement: `[${interpretation.tipoMovimentacao}] ${interpretation.resumo}`,
          lastMovementAt: new Date(),
        },
      });

      const cardText = [
        `**${interpretation.tipoMovimentacao}** (${pub.dataPublicacao})`,
        pub.siglaTribunal ? `Tribunal: ${pub.siglaTribunal}` : "",
        interpretation.resumo,
      ].filter(Boolean).join("\n");

      if (proc.clientId) {
        await appendCaseCardEntry(orgId, proc.clientId, {
          source: "DJEN",
          content: cardText,
          processId,
        });
      }

      newEntries.push({ content: cardText, comunicaId: item.id });
    }
  }

  // Atualiza timestamp da última busca manual
  await prisma.process.update({
    where: { id: processId },
    data: { lastDjenSearchAt: new Date() },
  });

  if (totalFound === 0) {
    return NextResponse.json({ ok: true, newCount: 0, message: "Nenhuma publicação encontrada para este número de processo no DJEN." });
  }

  if (newEntries.length === 0) {
    return NextResponse.json({ ok: true, newCount: 0, message: `${totalFound} publicação(ões) encontrada(s), mas não há atualizações novas — tudo já foi registrado anteriormente.` });
  }

  return NextResponse.json({ ok: true, newCount: newEntries.length, message: `${newEntries.length} nova(s) publicação(ões) registrada(s) no card.` });
}
