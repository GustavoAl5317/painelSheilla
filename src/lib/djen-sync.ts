import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { interpretLegalMovement } from "@/lib/ai/ai-service";
import { trelloAddMovementComment } from "@/lib/adapters/trello-adapter";
import { appendCaseCardEntry } from "@/lib/case-card";

/** API pública de comunicações (DJEN) — o antigo djen.jus.br não resolve mais. */
const COMUNICA_API = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

export interface DJENSyncResult {
  synced: number;
  errors: string[];
}

export interface ComunicacaoAPIItem {
  id: number;
  texto: string;
  siglaTribunal: string | null;
  datadisponibilizacao?: string;
  data_disponibilizacao?: string;
  numeroprocessocommascara: string;
  numero_processo: string;
  nomeClasse?: string | null;
  nomeOrgao?: string | null;
  tipoComunicacao?: string | null;
}

interface ComunicacaoAPIResponse {
  status?: string;
  message?: string;
  count: number;
  items: ComunicacaoAPIItem[];
}

function formatFetchError(err: unknown): string {
  const e = err as Error & { cause?: Error & { code?: string } };
  if (e?.cause) {
    return `${e.message} (${e.cause.message || e.cause})`;
  }
  return e?.message ?? String(err);
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function mapItemToPub(item: ComunicacaoAPIItem) {
  const raw = stripHtml(item.texto);
  const processo = item.numeroprocessocommascara || item.numero_processo;
  const cpfMatches = raw.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
  const cpfs = [...new Set(cpfMatches.map(c => c.replace(/\D/g, "")))];
  const iso = item.data_disponibilizacao?.trim() ?? "";
  let dataPublicacao = item.datadisponibilizacao?.trim() ?? "";
  if (!dataPublicacao && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    dataPublicacao = `${d}/${m}/${y}`;
  }
  if (!dataPublicacao) dataPublicacao = new Date().toLocaleDateString("pt-BR");

  return {
    id: `DJEN_${item.id}`,
    processo,
    cpfs,
    rawText: raw.slice(0, 2000),
    dataPublicacao,
    siglaTribunal: item.siglaTribunal,
    comunicaId: item.id,
    nomeClasse: item.nomeClasse?.trim() ?? null,
    nomeOrgao: item.nomeOrgao?.trim() ?? null,
    tipoComunicacao: item.tipoComunicacao?.trim() ?? null,
  };
}

export async function fetchComunicacoesOAB(
  numero: string,
  uf: string,
  dataInicio: string,
  dataFim: string
): Promise<ComunicacaoAPIItem[]> {
  const all: ComunicacaoAPIItem[] = [];
  const size = 100;
  let page = 0;

  for (;;) {
    const url = new URL(COMUNICA_API);
    url.searchParams.set("numeroOab", numero);
    url.searchParams.set("ufOab", uf);
    url.searchParams.set("dataDisponibilizacaoInicio", dataInicio);
    url.searchParams.set("dataDisponibilizacaoFim", dataFim);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(size));

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AdvZap/1.0 (DJEN; +https://comunica.pje.jus.br)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as ComunicacaoAPIResponse;
    if (data.status && data.status !== "success") {
      throw new Error(data.message || "Resposta inesperada da API de comunicações");
    }
    if (!Array.isArray(data.items)) {
      throw new Error("Resposta da API sem lista de itens");
    }
    if (data.items.length === 0) break;

    all.push(...data.items);
    if (all.length >= data.count || data.items.length < size) break;
    page += 1;
  }

  return all;
}

/** CPF na publicação vem só com dígitos; no cadastro pode estar formatado. */
async function findClientMatchingPubCpfs(
  organizationId: string,
  cpfDigitsList: string[],
  processNumberSlice: string
) {
  if (cpfDigitsList.length === 0) return null;

  const leadInclude = {
    processes: { where: { number: { contains: processNumberSlice } }, take: 1 as const },
    conversations: { take: 1 as const, orderBy: { lastMessageAt: "desc" as const } },
  };

  const direct = await prisma.client.findFirst({
    where: { organizationId, cpf: { in: cpfDigitsList } },
    include: leadInclude,
  });
  if (direct) return direct;

  const withCpf = await prisma.client.findMany({
    where: { organizationId, cpf: { not: null } },
    include: leadInclude,
  });
  const want = new Set(cpfDigitsList);
  return (
    withCpf.find(c => {
      const d = c.cpf?.replace(/\D/g, "") ?? "";
      return d.length === 11 && want.has(d);
    }) ?? null
  );
}

// ─── Sync principal ───────────────────────────────────────────────────────────

export async function syncDJEN(organizationId: string): Promise<DJENSyncResult> {
  const result: DJENSyncResult = { synced: 0, errors: [] };

  const oabRaw = await resolveCredential(organizationId, "DJEN_OAB");
  if (!oabRaw) {
    result.errors.push("Número OAB não configurado (DJEN_OAB).");
    return result;
  }

  const [openaiKey, anthropicKey] = await Promise.all([
    resolveCredential(organizationId, "OPENAI_API_KEY"),
    resolveCredential(organizationId, "ANTHROPIC_API_KEY"),
  ]);
  const aiProvider = anthropicKey ? "anthropic" : openaiKey ? "openai" : null;
  const aiKey = anthropicKey ?? openaiKey ?? null;

  const oabs = oabRaw.split(",").map(s => s.trim()).filter(Boolean);

  const d0 = new Date();
  d0.setDate(d0.getDate() - 1);
  const dataInicio = toISODateLocal(d0);
  const dataFim = toISODateLocal(new Date());

  for (const oab of oabs) {
    const numero = oab.replace(/[^0-9]/g, "");
    const uf = oab.replace(/[^a-zA-Z]/g, "").toUpperCase();

    let items: ComunicacaoAPIItem[];
    try {
      items = await fetchComunicacoesOAB(numero, uf, dataInicio, dataFim);
    } catch (err) {
      result.errors.push(`DJEN OAB ${numero}/${uf}: ${formatFetchError(err)}`);
      continue;
    }

    for (const item of items) {
      const pub = mapItemToPub(item);
      const deadlineTitle = `DJEN — ${pub.processo} [ref. ${item.id}]`;
      const existing = await prisma.deadline.findFirst({
        where: { organizationId, title: deadlineTitle },
      });
      if (existing) continue;

      let interpretation: {
        tipoMovimentacao: string;
        resumo: string;
        mensagemCliente: string;
        diasPrazo?: number;
      } = {
        tipoMovimentacao: "Publicação Judicial",
        resumo: `${pub.siglaTribunal ? `Tribunal: ${pub.siglaTribunal}\n` : ""}${pub.rawText.slice(0, 300)}`,
        mensagemCliente: `Há uma nova movimentação no processo *${pub.processo}*. Em breve entraremos em contato.`,
      };

      if (aiKey && aiProvider) {
        try {
          interpretation = await interpretLegalMovement(pub.rawText, aiKey, aiProvider);
        } catch (err) {
          console.error("[DJEN] AI interpretation failed:", (err as Error).message);
        }
      }

      const dueDate = new Date();
      if (interpretation.diasPrazo) {
        dueDate.setDate(dueDate.getDate() + interpretation.diasPrazo);
      }

      const processNumberSlice = pub.processo.replace(/[^\d]/g, "").slice(0, 20);

      let linkedClient = null as {
        id: string;
        name: string;
        trelloCardId: string | null;
        processes: { id: string; clientId: string | null }[];
        conversations: { phoneNumber: string }[];
      } | null;
      let linkedProcess = null as { id: string; clientId: string | null } | null;
      let clientMatchedByCpf = false;

      if (pub.cpfs.length > 0) {
        linkedClient = await findClientMatchingPubCpfs(organizationId, pub.cpfs, processNumberSlice);
        if (linkedClient) clientMatchedByCpf = true;
        linkedProcess = linkedClient?.processes?.[0] ?? null;
      }

      if (!linkedProcess && processNumberSlice.length >= 10) {
        linkedProcess = await prisma.process.findFirst({
          where: { organizationId, number: { contains: processNumberSlice } },
        });
        if (linkedProcess?.clientId) {
          linkedClient = await prisma.client.findUnique({
            where: { id: linkedProcess.clientId },
            include: {
              processes: { where: { id: linkedProcess.id }, take: 1 },
              conversations: { take: 1, orderBy: { lastMessageAt: "desc" } },
            },
          });
        }
      }

      // Cadastro automático: CPF da publicação bate com cliente e ainda não há processo com esse número na org
      if (
        clientMatchedByCpf &&
        linkedClient &&
        !linkedProcess &&
        processNumberSlice.length >= 10
      ) {
        const alreadyExists = await prisma.process.findFirst({
          where: { organizationId, number: { contains: processNumberSlice } },
        });
        if (!alreadyExists) {
          try {
            const title =
              pub.nomeClasse ||
              pub.tipoComunicacao ||
              `Acompanhamento — ${pub.processo}`;
            const court = pub.siglaTribunal ?? pub.nomeOrgao ?? undefined;
            const movementPreview = `[${interpretation.tipoMovimentacao}] ${interpretation.resumo}`.slice(0, 500);

            linkedProcess = await prisma.process.create({
              data: {
                organizationId,
                clientId: linkedClient.id,
                number: pub.processo.trim(),
                title: title.slice(0, 500),
                court: court?.slice(0, 500),
                observations:
                  "Cadastro automático AdvZap: DJEN/PJe Comunica identificou CPF deste cliente na publicação.",
                lastMovement: movementPreview,
                lastMovementAt: new Date(),
              },
            });
            console.log(
              `[DJEN] Processo criado automaticamente: ${pub.processo} → cliente ${linkedClient.name} (${linkedClient.id})`
            );
          } catch (err) {
            const msg = (err as Error).message;
            console.error("[DJEN] Falha ao criar processo automático:", msg);
            result.errors.push(`Proc. ${pub.processo} (autocadastro): ${msg}`);
          }
        }
      }

      await prisma.deadline.create({
        data: {
          organizationId,
          title: deadlineTitle,
          description: [
            `**Tipo:** ${interpretation.tipoMovimentacao}`,
            pub.siglaTribunal ? `**Tribunal:** ${pub.siglaTribunal}` : "",
            `**Resumo:** ${interpretation.resumo}`,
            "",
          ]
            .filter(Boolean)
            .join("\n"),
          dueDate,
          processId: linkedProcess?.id ?? null,
        },
      });

      if (linkedProcess) {
        await prisma.process.update({
          where: { id: linkedProcess.id },
          data: {
            lastMovement: `[${interpretation.tipoMovimentacao}] ${interpretation.resumo}`,
            lastMovementAt: new Date(),
          },
        });
      }

      if (linkedClient?.trelloCardId) {
        trelloAddMovementComment(organizationId, linkedClient.trelloCardId, {
          tipo: interpretation.tipoMovimentacao,
          resumo: interpretation.resumo,
          processo: pub.processo,
          data: pub.dataPublicacao,
        }).catch(() => {});
      }

      if (linkedClient && linkedProcess) {
        const cardText = [
          `**${interpretation.tipoMovimentacao}** (Proc. ${pub.processo})`,
          pub.siglaTribunal ? `Tribunal: ${pub.siglaTribunal}` : "",
          interpretation.resumo,
        ]
          .filter(Boolean)
          .join("\n");
        appendCaseCardEntry(organizationId, linkedClient.id, {
          source: "DJEN",
          content: cardText,
          processId: linkedProcess.id,
        }).catch(e => console.error("[DJEN] case-card:", (e as Error).message));
      }

      await prisma.notification.create({
        data: {
          organizationId,
          type: "PROCESS_UPDATE",
          title: `DJEN: ${interpretation.tipoMovimentacao}${pub.siglaTribunal ? ` — ${pub.siglaTribunal}` : ""}`,
          message: `Proc. ${pub.processo}${linkedClient ? ` — ${linkedClient.name}` : ""}: ${interpretation.resumo}`,
          metadata: { source: "DJEN", publicationId: pub.id, comunicaId: item.id },
        },
      });

      const conv = linkedClient?.conversations?.[0];
      if (conv) {
        const firstName = linkedClient!.name.split(" ")[0];
        const msg = `📋 *Nova movimentação judicial*\n\nOlá ${firstName}! ${interpretation.mensagemCliente}`;
        sendWhatsAppMessage(organizationId, conv.phoneNumber, msg).catch(() => {});
      }

      result.synced++;
    }
  }

  return result;
}
