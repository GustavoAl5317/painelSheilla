import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchComunicacoesOAB, mapItemToPub } from "@/lib/djen-sync";
import { z } from "zod";

const bodySchema = z.object({
  oabNumero: z.string().min(1),
  oabUf: z.string().length(2),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function fmtCpf(cpf: string) {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const body = await req.json();

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { oabNumero, oabUf, dataInicio, dataFim } = parsed.data;

  let items;
  try {
    items = await fetchComunicacoesOAB(oabNumero, oabUf, dataInicio, dataFim);
  } catch (err) {
    return NextResponse.json({ error: `Erro ao consultar DJEN: ${(err as Error).message}` }, { status: 502 });
  }

  // Busca todos os clientes da org que têm CPF
  const clientsWithCpf = await prisma.client.findMany({
    where: { organizationId: orgId, cpf: { not: null } },
    select: { id: true, name: true, cpf: true },
  });

  const publications = items.map(item => {
    const pub = mapItemToPub(item);

    // Cruzar CPFs da publicação com clientes cadastrados
    const clientesVinculaveis = pub.cpfs.length > 0
      ? clientsWithCpf.filter(c => {
          const digits = c.cpf?.replace(/\D/g, "") ?? "";
          return digits.length === 11 && pub.cpfs.includes(digits);
        }).map(c => ({ id: c.id, name: c.name, cpf: c.cpf ? fmtCpf(c.cpf.replace(/\D/g, "")) : null }))
      : [];

    return {
      comunicaId: item.id,
      processo: pub.processo,
      dataPublicacao: pub.dataPublicacao,
      siglaTribunal: pub.siglaTribunal,
      nomeClasse: pub.nomeClasse,
      nomeOrgao: pub.nomeOrgao,
      tipoComunicacao: pub.tipoComunicacao,
      resumo: pub.rawText.slice(0, 800),
      rawText: pub.rawText,
      cpfsEncontrados: pub.cpfs.map(fmtCpf),
      clientesVinculaveis,
    };
  });

  return NextResponse.json({ ok: true, count: publications.length, publications });
}
