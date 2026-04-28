import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCpf, normalizeCpfDigits } from "@/lib/utils";
import { ensureClientCaseCard } from "@/lib/case-card";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const clients = await prisma.client.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { processes: true, tasks: true } } },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const body = await req.json();
  const { name, phone, email, cpf, rg, address, notes } = body;
  if (!name) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const cpfDigits = typeof cpf === "string" ? normalizeCpfDigits(cpf) : "";
  if (!cpfDigits || !isValidCpf(cpfDigits)) {
    return NextResponse.json(
      { error: "CPF é obrigatório e deve ser válido (11 dígitos)." },
      { status: 400 }
    );
  }

  const withCpf = await prisma.client.findMany({
    where: { organizationId, cpf: { not: null } },
    select: { id: true, cpf: true },
  });
  if (withCpf.some(c => c.cpf?.replace(/\D/g, "") === cpfDigits)) {
    return NextResponse.json(
      { error: "Já existe um cliente com este CPF neste escritório." },
      { status: 409 }
    );
  }

  const client = await prisma.client.create({
    data: { organizationId, name, phone, email, cpf: cpfDigits, rg, address, notes },
  });

  const process = await prisma.process.create({
    data: {
      organization: { connect: { id: organizationId } },
      client: { connect: { id: client.id } },
      number: "(a definir)",
      observations: "Cadastrado automaticamente no cadastro do cliente.",
    },
  });

  const card = await ensureClientCaseCard(organizationId, client.id);
  await prisma.clientCaseCard.update({
    where: { id: card.id },
    data: { processId: process.id },
  });
  await prisma.caseCardEntry.create({
    data: {
      cardId: card.id,
      source: "SYSTEM",
      content: "Cartão criado. Número do processo ainda não informado — edite o processo para adicionar e ativar o monitoramento DJEN/PJe.",
      shareWithClient: false,
    },
  });

  return NextResponse.json(client, { status: 201 });
}
