/// <reference types="next" />
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCpf, normalizeCpfDigits, generateRandomCpf } from "@/lib/utils";
import { ensureClientCaseCard, appendCaseCardEntry } from "@/lib/case-card";
import { resolveCredential } from "@/lib/credentials";
import { summarizeCaseCardForWhatsApp } from "@/lib/ai/ai-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;
  const body = await req.json();
  const { name, phone, email, cpf, notes, processNumber, processTitle, processArea, processCourt } = body;

  let cpfDigits = typeof cpf === "string" ? normalizeCpfDigits(cpf) : "";
  if (cpfDigits && !isValidCpf(cpfDigits)) {
    return NextResponse.json(
      { error: "Se informado, o CPF deve ser válido (11 dígitos)." },
      { status: 400 }
    );
  }

  // Se não informou CPF, gera um único para satisfazer integrações (Tramitação Inteligente, etc)
  if (!cpfDigits) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateRandomCpf();
      const exists = await prisma.client.findFirst({ where: { organizationId, cpf: candidate } });
      if (!exists) {
        cpfDigits = candidate;
        break;
      }
      attempts++;
    }
  }

  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  // Verifica se já existe cliente com este CPF (importado da TI ou cadastrado antes)
  const existingByCpf = cpfDigits
    ? await prisma.client.findFirst({ where: { organizationId, cpf: cpfDigits } })
    : null;

  let client;
  if (existingByCpf) {
    // CPF já existe — atualiza dados que o lead trouxe e reutiliza o cliente
    client = await prisma.client.update({
      where: { id: existingByCpf.id },
      data: {
        name: name ?? existingByCpf.name,
        phone: phone || existingByCpf.phone || lead.phone || undefined,
        email: email || existingByCpf.email || lead.email || undefined,
        notes: notes || existingByCpf.notes || undefined,
      },
    });
  } else {
    client = await prisma.client.create({
      data: {
        name: name ?? lead.name,
        phone: phone ?? lead.phone ?? undefined,
        email: email ?? lead.email ?? undefined,
        cpf: cpfDigits,
        notes: notes ?? undefined,
        organizationId,
      },
    });
  }

  await prisma.lead.update({
    where: { id },
    data: {
      clientId: client.id,
      convertedToClientAt: new Date(),
      status: "CONVERTED",
    },
  });

  // ── Cria cartão no CRM interno (primeira coluna) se ainda não existir para este cliente ──
  const existingCrmCard = await prisma.crmCard.findFirst({
    where: { organizationId, clientId: client.id }
  });

  if (!existingCrmCard) {
    const firstBoard = await prisma.crmBoard.findFirst({
      where: { organizationId },
      orderBy: { order: "asc" }
    });

    if (firstBoard) {
      await prisma.crmCard.create({
        data: {
          organizationId,
          boardId: firstBoard.id,
          clientId: client.id,
          title: client.name.toUpperCase(),
          description: [
            `**Telefone:** ${client.phone ?? "N/A"}`,
            `**CPF:** ${client.cpf ?? "N/A"}`,
            `**E-mail:** ${client.email ?? "N/A"}`,
            notes ? `\n**Notas da Conversão:**\n${notes}` : "",
          ].filter(Boolean).join("\n"),
        },
      });
    }
  }

  const card = await ensureClientCaseCard(organizationId, client.id);

  const procNumberClean = typeof processNumber === "string" ? processNumber.trim() : "";
  const procTitleClean = typeof processTitle === "string" ? processTitle.trim() : "";
  const procAreaClean = typeof processArea === "string" ? processArea.trim() : "";
  const procCourtClean = typeof processCourt === "string" ? processCourt.trim() : "";

  // ── Tenta vincular processos existentes sem cliente (vindo da TI/DJEN) ──
  // 1. Se o usuário informou número de processo, busca pelo número
  // 2. Busca todos sem clientId e verifica se CPF aparece nas deadlines vinculadas
  const orphanProcesses = await prisma.$queryRaw<
    Array<{ id: string; number: string | null; title: string | null; legalArea: string | null; court: string | null }>
  >`SELECT id, number, title, "legalArea", court FROM "Process" WHERE "organizationId" = ${organizationId} AND "clientId" IS NULL`;

  const orphanDeadlines = orphanProcesses.length > 0
    ? await prisma.deadline.findMany({
        where: { organizationId, processId: { in: orphanProcesses.map((p: { id: string }) => p.id) } },
        select: { processId: true, description: true },
      })
    : [] as Array<{ processId: string | null; description: string | null }>;

  const cpfPattern = new RegExp(
    cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1\\.?$2\\.?$3-?$4")
  );

  const autoLinked: string[] = [];
  for (const orphan of orphanProcesses) {
    const numberMatch =
      procNumberClean &&
      orphan.number &&
      orphan.number.replace(/[^\d]/g, "").slice(0, 20) ===
        procNumberClean.replace(/[^\d]/g, "").slice(0, 20);

    const deadlinesForProcess = orphanDeadlines.filter((d: { processId: string | null }) => d.processId === orphan.id);
    const cpfInDeadlines = deadlinesForProcess.some(
      (d: { description: string | null }) => d.description && cpfPattern.test(d.description)
    );

    if (numberMatch || cpfInDeadlines) {
      await prisma.process.update({
        where: { id: orphan.id },
        data: { clientId: client.id },
      });
      autoLinked.push(orphan.id);
    }
  }

  let process;
  if (autoLinked.length > 0) {
    // Usa o primeiro processo vinculado automaticamente como processo principal do card
    process = await prisma.process.findUnique({ where: { id: autoLinked[0] } });
    if (process && (procTitleClean || procAreaClean || procCourtClean)) {
      process = await prisma.process.update({
        where: { id: process.id },
        data: {
          title: procTitleClean || process.title || undefined,
          legalArea: procAreaClean || process.legalArea || undefined,
          court: procCourtClean || process.court || undefined,
        },
      });
    }
  } else {
    // Nenhum processo orphão encontrado — cria um novo
    process = await prisma.process.create({
      data: {
        organization: { connect: { id: organizationId } },
        client: { connect: { id: client.id } },
        number: procNumberClean || "(a definir)",
        title: procTitleClean || undefined,
        legalArea: procAreaClean || undefined,
        court: procCourtClean || undefined,
        observations: "Cadastrado automaticamente na conversão do lead.",
      },
    });
  }

  await prisma.clientCaseCard.update({
    where: { id: card.id },
    data: { processId: process!.id },
  });

  const entryContent =
    autoLinked.length > 0
      ? `${autoLinked.length} processo(s) da Tramitação Inteligente/DJEN vinculado(s) automaticamente pelo CPF.`
      : procNumberClean
      ? `Processo ${process!.number}${process!.title ? ` — ${process!.title}` : ""} vinculado ao cartão. DJEN/PJe alimentarão este cartão automaticamente.`
      : "Cartão criado. Número do processo ainda não informado — edite o processo para adicionar e ativar o monitoramento DJEN/PJe.";

  await appendCaseCardEntry(organizationId, client.id, {
    source: "SYSTEM",
    content: entryContent,
    shareWithClient: false,
    processId: process!.id,
  });

  // Gera resumo do atendimento com IA e adiciona ao card do cliente/processo
  generateConversionSummary({
    organizationId,
    clientId: client.id,
    clientName: client.name,
    leadId: id,
    lead,
    processId: process!.id,
  }).catch((e) => console.error("[convert] summary failed:", (e as Error).message));

  return NextResponse.json({ ok: true, client });
}

async function generateConversionSummary({
  organizationId,
  clientId,
  clientName,
  leadId,
  lead,
  processId,
}: {
  organizationId: string;
  clientId: string;
  clientName: string;
  leadId: string;
  lead: { legalArea?: string | null; caseSummary?: string | null; aiSummary?: string | null };
  processId: string;
}) {
  const aiConfig = await prisma.aIConfig.findUnique({ where: { organizationId } });
  if (!aiConfig?.isActive) return;

  const provider: "openai" | "anthropic" = aiConfig.provider === "ANTHROPIC" ? "anthropic" : "openai";
  const credKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const orgKey = await resolveCredential(organizationId, credKey);
  const apiKey = orgKey ?? aiConfig.apiKey ?? "";
  if (!apiKey) return;

  // Busca histórico de mensagens da conversa do lead
  const conversation = await prisma.conversation.findFirst({
    where: { organizationId, leadId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 60 } },
  });

  const lines: string[] = [];

  if (lead.legalArea) lines.push(`Área jurídica: ${lead.legalArea}`);
  if (lead.caseSummary) lines.push(`Resumo do caso (IA): ${lead.caseSummary}`);
  if (lead.aiSummary)   lines.push(`Observações: ${lead.aiSummary}`);

  if (conversation?.messages.length) {
    lines.push("\nHistórico do atendimento via WhatsApp:");
    for (const m of conversation.messages) {
      const role = m.direction === "INBOUND" ? "Cliente" : m.isAI ? "IA" : "Atendente";
      lines.push(`[${role}] ${m.content}`);
    }
  }

  if (lines.length === 0) return;

  const rawText = lines.join("\n");
  const firstName = clientName.split(" ")[0];

  const summary = await summarizeCaseCardForWhatsApp(rawText, firstName, apiKey, provider, aiConfig.model ?? undefined);
  if (!summary?.trim()) return;

  const content = [
    "**Resumo do atendimento (gerado pela IA no momento da conversão)**",
    "",
    summary,
    "",
    lead.legalArea ? `Área: ${lead.legalArea}` : "",
    lead.caseSummary ? `Caso: ${lead.caseSummary}` : "",
  ].filter(Boolean).join("\n");

  await appendCaseCardEntry(organizationId, clientId, {
    source: "SYSTEM",
    content,
    shareWithClient: true,
    processId,
  });
}
