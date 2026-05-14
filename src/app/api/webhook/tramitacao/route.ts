import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureClientCaseCard } from "@/lib/case-card";
import type { TIPublication } from "@/lib/adapters/tramitacao-adapter";

// Webhook recebido da Tramitação Inteligente
// Eventos: publications.created | customer.created | customer.updated
export async function POST(req: NextRequest) {
  const orgSlug = req.nextUrl.searchParams.get("org");
  if (!orgSlug) return NextResponse.json({ error: "org obrigatório" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Processa em background (não bloqueia o ACK)
  processWebhook(org.id, payload).catch(err =>
    console.error("[TI Webhook] Erro:", err.message)
  );

  return NextResponse.json({ ok: true });
}


async function processWebhook(organizationId: string, payload: any) {
  // ── A. publications.created → garante Process + cria Deadline ───────────
  if (payload.event_type === "publications.created") {
    const publications: TIPublication[] = payload.payload?.publications ?? [];

    for (const pub of publications) {
      const processoFormatado = pub.numero_processo_com_mascara ?? pub.numero_processo;
      const deadlineTitle = `Intimação — Proc. ${processoFormatado}`;

      // Idempotência
      const exists = await prisma.deadline.findFirst({
        where: { organizationId, title: deadlineTitle },
      });
      if (exists) continue;

      // Extrai CPFs do texto da publicação
      const cpfMatches = (pub.texto ?? "").match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
      const cpfs = [...new Set(cpfMatches.map(c => c.replace(/\D/g, "")))];
      const destinatarioNames = (pub.destinatarios ?? []).map((d: any) => d.nome);

      // Tenta vincular ao cliente por nome ou CPF
      let linkedClient = await prisma.client.findFirst({
        where: {
          organizationId,
          OR: [
            destinatarioNames.length > 0 ? { name: { in: destinatarioNames } } : {},
            cpfs.length > 0 ? { cpf: { in: cpfs } } : {},
          ].filter(c => Object.keys(c).length > 0),
        },
        include: {
          processes: { where: { number: { contains: processoFormatado.slice(0, 20) } }, take: 1 },
          conversations: { take: 1, orderBy: { lastMessageAt: "desc" } },
        },
      });

      // Busca processo existente pelo número
      const processNumberSlice = processoFormatado.replace(/[^\d]/g, "").slice(0, 20);
      let linkedProcess = linkedClient?.processes?.[0] ?? null;

      if (!linkedProcess && processNumberSlice.length >= 10) {
        linkedProcess = await prisma.process.findFirst({
          where: { organizationId, number: { contains: processNumberSlice } },
        });
      }

      if (!linkedProcess) {
        linkedProcess = await prisma.process.create({
          data: {
            organizationId,
            clientId: linkedClient?.id ?? undefined,
            number: processoFormatado,
            title: pub.nomeClasse ?? `Processo TI — ${processoFormatado}`,
            court: pub.siglaTribunal ?? pub.nomeOrgao ?? undefined,
            observations: linkedClient
              ? "Cadastrado automaticamente via Tramitação Inteligente."
              : "Aguardando vinculação com cliente (CPF não encontrado no sistema).",
          },
        });
      } else if (!linkedProcess.clientId && linkedClient) {
        linkedProcess = await prisma.process.update({
          where: { id: linkedProcess.id },
          data: { clientId: linkedClient.id },
        });
      }

      // Garante ClientCaseCard, CrmCard e registra entrada na linha do tempo
      if (linkedClient) {
        try {
          const caseCard = await ensureClientCaseCard(organizationId, linkedClient.id);
          if (!caseCard.processId) {
            await prisma.clientCaseCard.update({
              where: { id: caseCard.id },
              data: { processId: linkedProcess.id },
            });
          }

          const existingCrmCard = await prisma.crmCard.findFirst({
            where: { organizationId, processId: linkedProcess.id },
          });
          if (!existingCrmCard) {
            const firstBoard = await prisma.crmBoard.findFirst({
              where: { organizationId },
              orderBy: { order: "asc" },
            });
            if (firstBoard) {
              const procNum = linkedProcess.number && linkedProcess.number !== "(a definir)"
                ? linkedProcess.number
                : null;
              await prisma.crmCard.create({
                data: {
                  organizationId,
                  boardId: firstBoard.id,
                  clientId: linkedClient.id,
                  processId: linkedProcess.id,
                  title: [linkedClient.name.toUpperCase(), procNum].filter(Boolean).join(" — "),
                  description: [
                    linkedProcess.legalArea ? `**Área:** ${linkedProcess.legalArea}` : null,
                    linkedProcess.court ? `**Tribunal:** ${linkedProcess.court}` : null,
                    linkedClient.phone ? `**Telefone:** ${linkedClient.phone}` : null,
                  ].filter(Boolean).join("\n"),
                },
              });
            }
          }

          // Registra entrada na linha do tempo (visível ao cliente na página de acompanhamento)
          const textoResumido = pub.texto
            ? (() => {
                const limpo = pub.texto.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
                if (limpo.length <= 300) return limpo;
                const corte = limpo.slice(0, 300);
                const ultimo = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("! "), corte.lastIndexOf("? "));
                return ultimo > 100 ? corte.slice(0, ultimo + 1) : `${corte}…`;
              })()
            : null;
          const entryLines = [
            pub.nomeClasse ? `**${pub.nomeClasse}**` : null,
            pub.nomeOrgao ?? pub.siglaTribunal ?? null,
            textoResumido || null,
          ].filter(Boolean).join("\n");

          if (entryLines) {
            await prisma.caseCardEntry.create({
              data: {
                cardId: caseCard.id,
                source: "TRAMITACAO_INTELIGENTE",
                content: entryLines,
                shareWithClient: true,
              },
            });
          }
        } catch {
          // falha no card/entry não deve bloquear o deadline
        }
      }

      // Calcula prazo
      const dueDate = pub.inicio_do_prazo_date
        ? new Date(pub.inicio_do_prazo_date)
        : pub.disponibilizacao_date
          ? new Date(pub.disponibilizacao_date)
          : new Date();

      await prisma.deadline.create({
        data: {
          organizationId,
          title: deadlineTitle,
          description: [
            pub.nomeOrgao,
            pub.siglaTribunal,
            pub.texto?.slice(0, 500),
          ].filter(Boolean).join("\n"),
          dueDate,
          processId: linkedProcess.id,
        },
      });

      // Marca urgente se prazo em até 7 dias
      const daysLeft = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      const isUrgent = daysLeft >= 0 && daysLeft <= 7;

      await prisma.notification.create({
        data: {
          organizationId,
          type: "PROCESS_UPDATE",
          title: `TI: Nova publicação${isUrgent ? " 🔴 URGENTE" : ""}`,
          message: `Processo ${processoFormatado} — nova movimentação identificada.`,
          metadata: {
            source: "TRAMITACAO_INTELIGENTE",
            link: pub.link_tramitacao ?? pub.link,
            urgent: isUrgent,
          },
        },
      });

      // Notificação ao cliente via WhatsApp desativada intencionalmente.
      // O cliente recebe a informação apenas quando pergunta pelo fluxo da IA (opção 3 do menu).
    }
  }

  // ── B. customer.created / customer.updated → sincroniza Client ──────────
  if (payload.event_type === "customer.created" || payload.event_type === "customer.updated") {
    const c = payload.customer;
    if (!c?.uuid) return;

    const client = await prisma.client.findFirst({
      where: { organizationId, tramitacaoCustomerUuid: c.uuid },
    });

    if (client) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          name: c.name ?? client.name,
          email: c.email ?? client.email,
          cpf: c.cpf_cnpj?.replace(/\D/g, "") ?? client.cpf,
          phone: c.phone_mobile ?? client.phone,
          tramitacaoSyncStatus: "Sincronizado",
          tramitacaoSyncedAt: new Date(),
        },
      });
    }
  }
}
