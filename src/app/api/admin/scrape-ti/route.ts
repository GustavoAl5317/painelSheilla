import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tiWebLogin } from "@/lib/ti-web-auth";
import {
  tiScrapeAllClients,
  tiScrapeClientProcesses,
  tiScrapeClientNotes,
  formatProcessForCard,
  formatNotesForCard,
  type TIScrapedClient,
} from "@/lib/ti-scraper";
import { ensureClientCaseCard } from "@/lib/case-card";

export const maxDuration = 300;
export const runtime = "nodejs";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ScrapeResult {
  tiEmail: string;
  authMethod: string;
  totalTIClients: number;
  matched: number;
  cardsCreated: number;
  entriesCreated: number;
  processesImported: number;
  skipped: number;
  errors: string[];
  details: MatchDetail[];
}

interface MatchDetail {
  tiClientId: number;
  tiClientName: string;
  panelClientId: string;
  panelClientName: string;
  matchMethod: string;
  processesFound: number;
  notesFound: number;
  cardEntryCreated: boolean;
}

// ─── Matching de clientes ─────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(" ").filter(w => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter(w => w.length > 2));
  const intersect = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersect / union;
}

async function findPanelClient(
  organizationId: string,
  ti: TIScrapedClient
): Promise<{ client: { id: string; name: string } | null; method: string }> {
  // 1. tramitacaoCustomerId direto
  if (ti.id) {
    const c = await prisma.client.findFirst({
      where: { organizationId, tramitacaoCustomerId: ti.id },
      select: { id: true, name: true },
    });
    if (c) return { client: c, method: "tramitacaoCustomerId" };
  }

  // 2. UUID
  if (ti.uuid) {
    const c = await prisma.client.findFirst({
      where: { organizationId, tramitacaoCustomerUuid: ti.uuid },
      select: { id: true, name: true },
    });
    if (c) return { client: c, method: "uuid" };
  }

  // 3. CPF
  const cleanCpf = ti.cpf?.replace(/\D/g, "");
  if (cleanCpf && cleanCpf.length >= 11) {
    const c = await prisma.client.findFirst({
      where: { organizationId, cpf: { contains: cleanCpf } },
      select: { id: true, name: true },
    });
    if (c) return { client: c, method: "cpf" };
  }

  // 4. Email
  if (ti.email) {
    const c = await prisma.client.findFirst({
      where: { organizationId, email: ti.email },
      select: { id: true, name: true },
    });
    if (c) return { client: c, method: "email" };
  }

  // 5. Telefone
  const cleanPhone = ti.phone?.replace(/\D/g, "");
  if (cleanPhone && cleanPhone.length >= 8) {
    const suffix = cleanPhone.slice(-8);
    const c = await prisma.client.findFirst({
      where: { organizationId, phone: { endsWith: suffix } },
      select: { id: true, name: true },
    });
    if (c) return { client: c, method: "phone" };
  }

  // 6. Nome (similaridade > 0.7)
  const candidates = await prisma.client.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  let best = { client: null as { id: string; name: string } | null, score: 0 };
  for (const c of candidates) {
    const score = nameSimilarity(ti.name, c.name);
    if (score > best.score) best = { client: c, score };
  }
  if (best.score >= 0.7 && best.client) {
    return { client: best.client, method: `name(${Math.round(best.score * 100)}%)` };
  }

  return { client: null, method: "none" };
}

// ─── Construção do conteúdo do card ──────────────────────────────────────────

function buildCardContent(ti: TIScrapedClient): string {
  const now = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];
  lines.push(`=== Importação da Tramitação Inteligente ===`);
  lines.push(`Data: ${now}`);
  lines.push(`Cliente TI: ${ti.name} (ID ${ti.id})`);
  lines.push("");

  if (ti.processes.length === 0 && ti.notes.length === 0) {
    lines.push("Nenhum processo ou nota encontrado na TI para este cliente.");
    return lines.join("\n");
  }

  // Processos
  if (ti.processes.length > 0) {
    lines.push(`── PROCESSOS (${ti.processes.length}) ──`);
    for (const [i, p] of ti.processes.entries()) {
      if (i > 0) lines.push("");
      lines.push(`[${i + 1}] ${formatProcessForCard(p)}`);
    }
  }

  // Notas
  if (ti.notes.length > 0) {
    if (ti.processes.length > 0) lines.push("");
    lines.push(`── NOTAS DO CLIENTE ──`);
    lines.push(formatNotesForCard(ti.notes));
  }

  return lines.join("\n");
}

// ─── Importa processos para a tabela Process ──────────────────────────────────

async function upsertProcesses(
  organizationId: string,
  clientId: string,
  ti: TIScrapedClient
): Promise<number> {
  let count = 0;
  for (const p of ti.processes) {
    const number = (p.numeroMascara ?? p.numero).replace(/\s/g, "");
    const digits = number.replace(/\D/g, "");
    if (digits.length < 15) continue;

    const existing = await prisma.process.findFirst({
      where: {
        organizationId,
        clientId,
        OR: [
          { number },
          digits.length >= 20 ? { number: { contains: digits.slice(0, 20) } } : {},
        ].filter(c => Object.keys(c).length > 0),
      },
    });

    let lastMovementAt: Date | undefined;
    if (p.ultimaMovimentacao) {
      const d = new Date(p.ultimaMovimentacao);
      if (!Number.isNaN(d.getTime())) lastMovementAt = d;
    }

    const observations = JSON.stringify({
      fonte: "tramitacao_inteligente_scrape",
      importadoEm: new Date().toISOString(),
      snapshot: p.raw,
    });

    if (!existing) {
      await prisma.process.create({
        data: {
          organizationId,
          clientId,
          number,
          title: p.classe ?? p.assunto ?? undefined,
          court: p.tribunal ?? undefined,
          legalArea: undefined,
          lastMovement: p.ultimaMovimentacao ?? undefined,
          lastMovementAt,
          status: "ACTIVE",
          observations,
        },
      });
      count++;
    } else {
      await prisma.process.update({
        where: { id: existing.id },
        data: {
          court: p.tribunal ?? existing.court ?? undefined,
          lastMovement: p.ultimaMovimentacao ?? existing.lastMovement ?? undefined,
          lastMovementAt: lastMovementAt ?? existing.lastMovementAt ?? undefined,
          title: p.classe ?? p.assunto ?? existing.title ?? undefined,
          observations,
        },
      });
    }
  }
  return count;
}

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * POST /api/admin/scrape-ti
 *
 * Autenticação (uma das duas):
 *   1. Sessão NextAuth (cookie de login no painel)
 *   2. Header  x-api-key: <ADMIN_SCRAPE_API_KEY>
 *
 * Body (JSON):
 * {
 *   tiEmail: "sheilaaraujoadv@sheilaaraujoadv.com",
 *   tiPassword: "Advocacia2026*@",
 *   dryRun?: false              // se true, só simula sem gravar
 *   onlyWithProcesses?: false   // se true, só cria card quando tem processos
 *   organizationSlug?: string   // obrigatório apenas se houver múltiplas organizações e não houver sessão
 * }
 */
export async function POST(req: NextRequest) {
  let orgId: string;

  // Resolve organização automaticamente — sem autenticação
  let bodyPreview: { organizationSlug?: string } = {};
  try {
    bodyPreview = await req.clone().json();
  } catch { /* ignora, body será relido abaixo */ }

  if (bodyPreview.organizationSlug) {
    const org = await prisma.organization.findUnique({
      where: { slug: bodyPreview.organizationSlug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
    }
    orgId = org.id;
  } else {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    if (orgs.length === 1) {
      orgId = orgs[0].id;
    } else {
      return NextResponse.json(
        { error: "Informe organizationSlug no body (há mais de uma organização)." },
        { status: 400 }
      );
    }
  }

  let body: {
    tiEmail?: string;
    tiPassword?: string;
    dryRun?: boolean;
    onlyWithProcesses?: boolean;
    organizationSlug?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const tiEmail = body.tiEmail?.trim();
  const tiPassword = body.tiPassword?.trim();
  const dryRun = body.dryRun ?? false;
  const onlyWithProcesses = body.onlyWithProcesses ?? false;

  if (!tiEmail || !tiPassword) {
    return NextResponse.json(
      { error: "Informe tiEmail e tiPassword no body." },
      { status: 400 }
    );
  }

  const result: ScrapeResult = {
    tiEmail,
    authMethod: "",
    totalTIClients: 0,
    matched: 0,
    cardsCreated: 0,
    entriesCreated: 0,
    processesImported: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  // 1. Autenticar na TI
  let tiAuth;
  try {
    tiAuth = await tiWebLogin(tiEmail, tiPassword);
    result.authMethod = tiAuth.method;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, result },
      { status: 422 }
    );
  }

  // 2. Buscar todos os clientes da TI
  let tiClients: TIScrapedClient[];
  try {
    tiClients = await tiScrapeAllClients(tiAuth);
    result.totalTIClients = tiClients.length;
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao listar clientes da TI: ${(err as Error).message}`, result },
      { status: 500 }
    );
  }

  // 3. Para cada cliente TI, buscar processos e notas
  for (const tiClient of tiClients) {
    try {
      const [processes, notes] = await Promise.all([
        tiScrapeClientProcesses(tiAuth, tiClient.id),
        tiScrapeClientNotes(tiAuth, tiClient.id),
      ]);
      tiClient.processes = processes;
      tiClient.notes = notes;

      if (onlyWithProcesses && processes.length === 0) {
        result.skipped++;
        continue;
      }

      if (processes.length === 0 && notes.length === 0) {
        result.skipped++;
        continue;
      }
    } catch (err) {
      result.errors.push(`Cliente TI ${tiClient.id} (${tiClient.name}): ${(err as Error).message}`);
      continue;
    }

    // 4. Localizar cliente correspondente no painel
    const { client: panelClient, method: matchMethod } = await findPanelClient(orgId, tiClient);

    if (!panelClient) {
      result.skipped++;
      continue;
    }

    result.matched++;

    const detail: MatchDetail = {
      tiClientId: tiClient.id,
      tiClientName: tiClient.name,
      panelClientId: panelClient.id,
      panelClientName: panelClient.name,
      matchMethod,
      processesFound: tiClient.processes.length,
      notesFound: tiClient.notes.length,
      cardEntryCreated: false,
    };

    if (!dryRun) {
      try {
        // 5. Garantir que o CaseCard existe
        await ensureClientCaseCard(orgId, panelClient.id);

        // 6. Importar processos para a tabela Process
        const imported = await upsertProcesses(orgId, panelClient.id, tiClient);
        result.processesImported += imported;

        // 7. Criar entrada no CaseCard com o resumo organizado
        const content = buildCardContent(tiClient);

        const card = await prisma.clientCaseCard.findUnique({
          where: { clientId: panelClient.id },
        });

        if (card) {
          await prisma.caseCardEntry.create({
            data: {
              cardId: card.id,
              source: "TRAMITACAO_INTELIGENTE",
              content,
              shareWithClient: false, // importação interna, não dispara WhatsApp
            },
          });
          result.entriesCreated++;
          result.cardsCreated++;
          detail.cardEntryCreated = true;
        }

        // 8. Atualizar tramitacaoCustomerId no cliente do painel (se não estava vinculado)
        const panelClientFull = await prisma.client.findUnique({
          where: { id: panelClient.id },
          select: { tramitacaoCustomerId: true },
        });
        if (!panelClientFull?.tramitacaoCustomerId) {
          await prisma.client.update({
            where: { id: panelClient.id },
            data: {
              tramitacaoCustomerId: tiClient.id,
              tramitacaoCustomerUuid: tiClient.uuid ?? undefined,
              tramitacaoSyncStatus: "synced",
              tramitacaoSyncedAt: new Date(),
            },
          });
        }
      } catch (err) {
        result.errors.push(
          `Erro ao salvar cliente ${panelClient.name}: ${(err as Error).message}`
        );
      }
    }

    result.details.push(detail);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    result,
  });
}
