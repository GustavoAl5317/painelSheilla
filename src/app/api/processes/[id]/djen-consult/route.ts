import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchComunicacoesOAB, mapItemToPub } from "@/lib/djen-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: processId } = await params;

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId: orgId },
    select: { id: true, number: true },
  });
  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });

  const body = await req.json();
  const oabNumero = typeof body.oabNumero === "string" ? body.oabNumero.trim() : "";
  const oabUf = typeof body.oabUf === "string" ? body.oabUf.trim().toUpperCase() : "";
  const dataInicio = typeof body.dataInicio === "string" ? body.dataInicio.trim() : "";
  const dataFim = typeof body.dataFim === "string" ? body.dataFim.trim() : "";

  if (!oabNumero || !oabUf) return NextResponse.json({ error: "Número e UF da OAB são obrigatórios." }, { status: 400 });
  if (!dataInicio || !dataFim) return NextResponse.json({ error: "Período (dataInicio e dataFim) é obrigatório." }, { status: 400 });

  let items;
  try {
    items = await fetchComunicacoesOAB(oabNumero, oabUf, dataInicio, dataFim);
  } catch (err) {
    return NextResponse.json({ error: `Erro ao consultar DJEN: ${(err as Error).message}` }, { status: 502 });
  }

  // Busca todos os clientes da org com CPF para cruzamento
  const allClients = await prisma.client.findMany({
    where: { organizationId: orgId, cpf: { not: null } },
    select: { id: true, name: true, cpf: true },
  });

  const publications = items.map(item => {
    const pub = mapItemToPub(item);

    // Tenta cruzar CPFs da publicação com clientes cadastrados
    const matchedClients = pub.cpfs.length > 0
      ? allClients.filter(c => {
          const d = c.cpf?.replace(/\D/g, "") ?? "";
          return pub.cpfs.includes(d);
        })
      : [];

    return {
      comunicaId: item.id,
      processo: pub.processo,
      dataPublicacao: pub.dataPublicacao,
      siglaTribunal: pub.siglaTribunal,
      nomeClasse: pub.nomeClasse,
      nomeOrgao: pub.nomeOrgao,
      tipoComunicacao: pub.tipoComunicacao,
      resumo: pub.rawText.slice(0, 600),
      cpfsEncontrados: pub.cpfs,
      clientesVinculaveis: matchedClients.map(c => ({ id: c.id, name: c.name, cpf: c.cpf })),
    };
  });

  return NextResponse.json({ ok: true, count: publications.length, publications });
}
