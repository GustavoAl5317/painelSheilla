import "server-only";
import { prisma } from "@/lib/prisma";
import {
  pjeAuthenticate,
  pjeFetchCommunications,
  pjeMarkAsRead,
  pjeCalculateDueDate,
} from "@/lib/adapters/pje-adapter";
import { appendCaseCardEntry } from "@/lib/case-card";

export interface PJeSyncResult {
  processed: number;
  deadlinesCreated: number;
  notificationsCreated: number;
  errors: string[];
}

export async function syncPJeCommunications(organizationId: string): Promise<PJeSyncResult> {
  const result: PJeSyncResult = { processed: 0, deadlinesCreated: 0, notificationsCreated: 0, errors: [] };

  const login = process.env.PJE_USERNAME;
  const senha = process.env.PJE_PASSWORD;

  if (!login || !senha) {
    result.errors.push("Credenciais PJe não configuradas no servidor (PJE_USERNAME / PJE_PASSWORD).");
    return result;
  }

  let token: string;
  try {
    const auth = await pjeAuthenticate(login, senha);
    token = auth.access_token;
  } catch (err) {
    result.errors.push(`Falha na autenticação PJe: ${(err as Error).message}`);
    return result;
  }

  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let batch;
    try {
      batch = await pjeFetchCommunications(token, true, page, 50);
    } catch (err) {
      result.errors.push(`Erro ao buscar comunicações (página ${page}): ${(err as Error).message}`);
      break;
    }

    for (const comm of batch.content) {
      result.processed++;
      try {
        const normalized = comm.numeroProcesso.replace(/\s/g, "");
        const process = await prisma.process.findFirst({
          where: { organizationId, number: { contains: normalized.slice(0, 20) } },
        });

        const dueDate = pjeCalculateDueDate(
          comm.dataDisponibilizacao,
          comm.prazo,
          comm.unidadePrazo
        );

        const deadlineTitle = `${comm.tipoComunicacao === "CITACAO" ? "Citação" : "Intimação"} — Proc. ${comm.numeroProcesso}`;

        const existing = await prisma.deadline.findFirst({
          where: { organizationId, title: deadlineTitle, dueDate },
        });
        if (existing) continue;

        const deadline = await prisma.deadline.create({
          data: {
            organizationId,
            title: deadlineTitle,
            description: [comm.orgaoJulgador?.nome, comm.texto?.slice(0, 500)]
              .filter(Boolean)
              .join("\n\n") || null,
            dueDate,
            processId: process?.id ?? null,
          },
        });
        result.deadlinesCreated++;

        await prisma.notification.create({
          data: {
            organizationId,
            type: "PROCESS_UPDATE",
            title: `PJe: ${comm.tipoComunicacao === "CITACAO" ? "Citação" : "Nova intimação"}`,
            message: `Processo ${comm.numeroProcesso} — nova movimentação identificada.`,
            metadata: { deadlineId: deadline.id, pjeCommunicationId: comm.id },
          },
        });
        result.notificationsCreated++;

        if (process?.clientId) {
          appendCaseCardEntry(organizationId, process.clientId, {
            source: "PJE",
            content: [
              `**${comm.tipoComunicacao}** — Proc. ${comm.numeroProcesso}`,
              comm.orgaoJulgador?.nome ? `Órgão: ${comm.orgaoJulgador.nome}` : "",
              comm.texto?.slice(0, 2000) ?? "",
            ]
              .filter(Boolean)
              .join("\n"),
            processId: process.id,
          }).catch(e => console.error("[PJe] case-card:", (e as Error).message));
        }

        await pjeMarkAsRead(token, comm.id);
      } catch (err) {
        result.errors.push(`Erro ao processar comunicação ${comm.id}: ${(err as Error).message}`);
      }
    }

    hasMore = !batch.last;
    page++;
  }

  return result;
}
