import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCpf, normalizeCpfDigits } from "@/lib/utils";
import { ensureClientCaseCard, appendCaseCardEntry } from "@/lib/case-card";

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

  const cpfDigits = typeof cpf === "string" ? normalizeCpfDigits(cpf) : "";
  if (!cpfDigits || !isValidCpf(cpfDigits)) {
    return NextResponse.json(
      { error: "CPF é obrigatório e deve ser válido (11 dígitos)." },
      { status: 400 }
    );
  }

  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  // Verifica se já existe cliente com este CPF (importado da TI ou cadastrado antes)
  const existingByCpf = await prisma.client.findFirst({
    where: { organizationId, cpf: cpfDigits },
  });

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
        where: { organizationId, processId: { in: orphanProcesses.map(p => p.id) } },
        select: { processId: true, description: true },
      })
    : [];

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

    const deadlinesForProcess = orphanDeadlines.filter(d => d.processId === orphan.id);
    const cpfInDeadlines = deadlinesForProcess.some(
      d => d.description && cpfPattern.test(d.description)
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

  return NextResponse.json({ ok: true, client });
}
