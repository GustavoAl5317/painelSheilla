/// <reference types="next" />
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tiCreateCustomer, tiSearchByCPF, tiSearchByPhone, tiUpsertNote, tiGetDossier } from "@/lib/adapters/tramitacao-adapter";
import { trelloSyncClientCard } from "@/lib/adapters/trello-adapter";
import { appendCaseCardEntry } from "@/lib/case-card";
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
        if (!tiCustomer.processes) {
          tiCustomer = await tiGetDossier(orgId, tiCustomer.id);
        }

        const tiProcesses = tiCustomer.processes ?? [];
        tiProcessesCount = tiProcesses.length;
        
        const noteContent = [
          `Nome: ${client.name}`,
          `CPF: ${client.cpf ?? "Não informado"}`,
          `Telefone: ${client.phone ?? "Não informado"}`,
          `E-mail: ${client.email ?? "Não informado"}`,
          client.notes ? `\nNotas: ${client.notes}` : "",
        ].filter(Boolean).join("\n");

        await tiUpsertNote(orgId, tiCustomer.id, noteContent);

        // Importação simplificada de processos
        for (const tiProc of tiProcesses) {
          const rawNumber = tiProc.numero_processo_com_mascara ?? tiProc.numero_processo;
          const cleanNumber = rawNumber.replace(/\s/g, "");
          if (!cleanNumber) continue;

          const existing = await prisma.process.findFirst({
            where: { organizationId: orgId, clientId: client.id, number: cleanNumber },
          });

          if (!existing) {
            await prisma.process.create({
              data: {
                organizationId: orgId,
                clientId: client.id,
                number: cleanNumber,
                status: "ACTIVE",
              },
            });
            processesImported++;
          }
        }

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
