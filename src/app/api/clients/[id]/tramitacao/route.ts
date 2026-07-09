/// <reference types="next" />
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tiCreateCustomer, tiSearchByCPF, tiSearchByPhone, tiUpsertNote, tiGetDossier } from "@/lib/adapters/tramitacao-adapter";
import { importProcessesFromTramitacaoForPainelClient } from "@/lib/ti-client-process-import";
import { ensureClientCaseCard } from "@/lib/case-card";
import { trelloSyncClientCard } from "@/lib/adapters/trello-adapter";
import { buildTramitacaoTriageNoteContent } from "@/lib/tramitacao-client-note";
import { generateRandomCpf } from "@/lib/utils";

// POST /api/clients/[id]/tramitacao
// Envia o cliente para a Tramitação Inteligente e importa os processos de volta
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const sessionOrgId = session ? (session.user as { organizationId: string }).organizationId : null;

  const { id } = await params;
  const body = await req.json();
  const { syncTrello = false } = body;
  const orgId: string = (body.organizationId as string) || sessionOrgId || "";

  if (!orgId) return NextResponse.json({ error: "organizationId obrigatório" }, { status: 400 });

  const client = await prisma.client.findFirst({
    where: { id, organizationId: orgId },
    include: { processes: { orderBy: { createdAt: "asc" } } },
  });

  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  
  // Garante que o cliente tenha um CPF para a TI (gera um falso se necessário)
  let currentCpf = client.cpf;
  if (!currentCpf) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateRandomCpf();
      const exists = await prisma.client.findFirst({ where: { organizationId: orgId, cpf: candidate } });
      if (!exists) {
        currentCpf = candidate;
        await prisma.client.update({ where: { id: client.id }, data: { cpf: candidate } });
        break;
      }
      attempts++;
    }
  }

  try {
    let tiCustomer: any = null;
    let processesImported = 0;
    let processesUpdated = 0;
    let tiProcessesCount = 0;

    // ── 1. Integração com Tramitação Inteligente (TI) ─────────────────────────
    try {
      tiCustomer = client.tramitacaoCustomerId
        ? await tiGetDossier(orgId, client.tramitacaoCustomerId).catch(() => null)
        : client.cpf
          ? await tiSearchByCPF(orgId, client.cpf)
          : client.phone
            ? await tiSearchByPhone(orgId, client.phone)
            : null;

      if (!tiCustomer) {
        tiCustomer = await tiCreateCustomer(orgId, {
          name: client.name,
          phone_mobile: client.phone ?? "",
          cpf_cnpj: currentCpf ?? "",
          email: client.email ?? "",
        });
      }

      if (tiCustomer) {
        const tiProcRes = await importProcessesFromTramitacaoForPainelClient(orgId, client.id, tiCustomer);
        processesImported = tiProcRes.imported;
        processesUpdated = tiProcRes.updated;
        tiProcessesCount = tiProcRes.totalFromTi;

        // Garante ClientCaseCard e cria CrmCard por processo importado
        const clientProcesses = await prisma.process.findMany({
          where: { organizationId: orgId, clientId: client.id },
          orderBy: { createdAt: "asc" },
        });

        const caseCard = await ensureClientCaseCard(orgId, client.id);
        if (!caseCard.processId && clientProcesses.length > 0) {
          await prisma.clientCaseCard.update({
            where: { id: caseCard.id },
            data: { processId: clientProcesses[0]!.id },
          });
        }

        const firstBoard = await prisma.crmBoard.findFirst({
          where: { organizationId: orgId },
          orderBy: { order: "asc" },
        });

        if (firstBoard) {
          for (const proc of clientProcesses) {
            const exists = await prisma.crmCard.findFirst({
              where: { organizationId: orgId, processId: proc.id },
            });
            if (exists) continue;

            const title = [
              client.name.toUpperCase(),
              proc.number && proc.number !== "(a definir)" ? proc.number : null,
            ].filter(Boolean).join(" — ");

            await prisma.crmCard.create({
              data: {
                organizationId: orgId,
                boardId: firstBoard.id,
                clientId: client.id,
                processId: proc.id,
                title,
                description: [
                  proc.legalArea ? `**Área:** ${proc.legalArea}` : null,
                  proc.court ? `**Tribunal:** ${proc.court}` : null,
                  client.phone ? `**Telefone:** ${client.phone}` : null,
                  client.cpf ? `**CPF:** ${client.cpf}` : null,
                ].filter(Boolean).join("\n"),
              },
            });
          }
        }

        const noteContent = await buildTramitacaoTriageNoteContent(
          {
            id: client.id,
            name: client.name,
            cpf: client.cpf,
            phone: client.phone,
            email: client.email,
            notes: client.notes,
          },
          orgId
        );

        await tiUpsertNote(orgId, tiCustomer.id, noteContent);

        await prisma.client.update({
          where: { id: client.id },
          data: {
            tramitacaoCustomerId: tiCustomer.id,
            tramitacaoCustomerUuid: tiCustomer.uuid,
            tramitacaoSyncStatus: "Sincronizado",
            tramitacaoSyncedAt: new Date(),
          },
        });
      }
    } catch (tiErr) {
      console.error("[TI Sync Error]:", (tiErr as Error).message);
    }

    // ── 5. Sync Trello (opcional) ─────────────────────────────────────────────
    let trelloCard = null;
    if (syncTrello) {
      try {
        const firstProc = client.processes[0];
        trelloCard = await trelloSyncClientCard(orgId, {
          name: client.name,
          contactNumber: client.phone ?? "",
          cpf: currentCpf ?? undefined,
          email: client.email ?? undefined,
          legalArea: firstProc?.legalArea ?? undefined,
          notes: client.notes ?? undefined,
          tramitacaoCustomerId: tiCustomer?.id,
        });

        await prisma.client.update({
          where: { id: client.id },
          data: {
            trelloCardId:  trelloCard.id,
            trelloCardUrl: trelloCard.shortUrl,
          },
        });
      } catch (err) {
        console.error("[TI Sync] Trello sync failed:", (err as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      tramitacaoCustomerId: tiCustomer?.id,
      tramitacaoCustomerUuid: tiCustomer?.uuid,
      processesImported,
      processesUpdated,
      totalTIProcesses: tiProcessesCount,
      trelloCard,
    });
  } catch (err) {
    console.error("[TI Sync Route Error]:", err);
    await prisma.client.update({
      where: { id: client.id },
      data: { tramitacaoSyncStatus: "Erro" },
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
