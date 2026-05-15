import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { ensureClientCaseCard } from "@/lib/case-card";
import { ensureClientPublicToken } from "@/lib/client-public-token";
import { resolveCredential } from "@/lib/credentials";
import { interpretLegalMovement } from "@/lib/ai/ai-service";
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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

function toTitleCase(str: string): string {
  return str.toLowerCase().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Limpa HTML e normaliza espaços, sem truncar. */
function limparTexto(texto: string | undefined | null): string {
  if (!texto) return "";
  return stripHtml(texto)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Versão resumida (até 300 chars) para notificação WhatsApp. */
function resumirPublicacao(texto: string | undefined | null): string {
  if (!texto) return "";
  const limpo = limparTexto(texto).replace(/\n+/g, " ");
  if (limpo.length <= 300) return limpo;
  const corte = limpo.slice(0, 300);
  const ultimoPonto = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("! "), corte.lastIndexOf("? "));
  if (ultimoPonto > 100) return `${corte.slice(0, ultimoPonto + 1)}`;
  return `${corte}…`;
}

async function processWebhook(organizationId: string, payload: any) {
  // ── A. publications.created → garante Process + cria Deadline ───────────
  if (payload.event_type === "publications.created") {
    const publications: TIPublication[] = payload.payload?.publications ?? [];

    // Resolve credenciais de IA uma vez por batch
    const [openaiKey, anthropicKey] = await Promise.all([
      resolveCredential(organizationId, "OPENAI_API_KEY"),
      resolveCredential(organizationId, "ANTHROPIC_API_KEY"),
    ]);
    const aiProvider = anthropicKey ? "anthropic" : openaiKey ? "openai" : null;
    const aiKey = anthropicKey ?? openaiKey ?? null;

    for (const pub of publications) {
      const processoFormatado = pub.numero_processo_com_mascara ?? pub.numero_processo;

      // Idempotência por pub.uuid — cada publicação da TI tem UUID único
      const idempotencyKey = `TI/${pub.uuid ?? pub.id} — Proc. ${processoFormatado}`;
      const exists = await prisma.deadline.findFirst({
        where: { organizationId, title: idempotencyKey },
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
            title: pub.nomeClasse ? toTitleCase(pub.nomeClasse) : `Processo TI — ${processoFormatado}`,
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

      // ── Interpretação por IA ─────────────────────────────────────────────
      const textoCompleto = limparTexto(pub.texto);
      let aiResumo: string | null = null;
      let tipoMovimentacao = toTitleCase(pub.nomeClasse ?? "Publicação Judicial");
      let mensagemCliente = `Nova movimentação no processo ${processoFormatado}.`;
      let diasPrazo: number | undefined;

      if (aiKey && aiProvider && textoCompleto) {
        try {
          const interp = await interpretLegalMovement(textoCompleto, aiKey, aiProvider);
          tipoMovimentacao = interp.tipoMovimentacao;
          aiResumo = interp.resumo;
          mensagemCliente = interp.mensagemCliente;
          diasPrazo = interp.diasPrazo;
        } catch { /* ignora falha de IA */ }
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

          // Entrada na timeline:
          // Com IA: tipo + resumo inteligente → depois texto integral
          // Sem IA: tipo → texto integral diretamente (sem truncar)
          const orgaoLabel = pub.nomeOrgao ?? pub.siglaTribunal ?? "";
          const entryContent = [
            `${tipoMovimentacao}${orgaoLabel ? ` — ${orgaoLabel}` : ""}`,
            aiResumo ?? null,
            textoCompleto ?? null,
          ].filter(Boolean).join("\n\n");

          if (entryContent) {
            await prisma.caseCardEntry.create({
              data: {
                cardId: caseCard.id,
                source: "TRAMITACAO_INTELIGENTE",
                content: entryContent,
                shareWithClient: true,
              },
            });
          }
        } catch {
          // falha no card/entry não deve bloquear o deadline
        }
      }

      // Atualiza última movimentação do processo
      await prisma.process.update({
        where: { id: linkedProcess.id },
        data: {
          lastMovement: `[${tipoMovimentacao}] ${aiResumo ?? textoCompleto.slice(0, 150)}`,
          lastMovementAt: new Date(),
        },
      }).catch(() => {});

      // Calcula prazo
      const dueDate = pub.inicio_do_prazo_date
        ? new Date(pub.inicio_do_prazo_date)
        : pub.disponibilizacao_date
          ? new Date(pub.disponibilizacao_date)
          : new Date();

      if (diasPrazo) {
        dueDate.setDate(dueDate.getDate() + diasPrazo);
      }

      await prisma.deadline.create({
        data: {
          organizationId,
          title: idempotencyKey,
          description: [
            `Tipo: ${tipoMovimentacao}`,
            pub.nomeOrgao ? `Órgão: ${pub.nomeOrgao}` : null,
            aiResumo ? `Resumo: ${aiResumo}` : null,
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
          title: `TI: ${tipoMovimentacao}${isUrgent ? " 🔴 URGENTE" : ""}`,
          message: `Processo ${processoFormatado} — ${(aiResumo ?? textoCompleto).slice(0, 120)}`,
          metadata: {
            source: "TRAMITACAO_INTELIGENTE",
            link: pub.link_tramitacao ?? pub.link,
            urgent: isUrgent,
          },
        },
      });

      // Notifica cliente via WhatsApp
      const conv = linkedClient?.conversations?.[0];
      if (conv) {
        const firstName = linkedClient!.name.split(" ")[0];
        const orgao = pub.siglaTribunal ?? pub.nomeOrgao ?? "";
        const classe = toTitleCase(pub.nomeClasse ?? "");

        let msgLines = [
          `⚖️ *Nova movimentação no seu processo*`,
          ``,
          `Olá, ${firstName}!`,
        ];

        if (classe || orgao) {
          msgLines.push(`📌 *${[classe, orgao].filter(Boolean).join(" — ")}*`);
        }
        msgLines.push(`📂 Processo: ${processoFormatado}`);
        msgLines.push(``, `📋 *O que aconteceu:*`, mensagemCliente);

        if (isUrgent) {
          const fmt = dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          msgLines.push(``, `🔴 *Prazo: ${fmt}* — entre em contato com o escritório.`);
        }

        try {
          const token = await ensureClientPublicToken(linkedClient!.id);
          const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
          if (baseUrl) {
            msgLines.push(``, `🔗 Acompanhe seus processos: ${baseUrl}/acompanhar/${token}`);
          }
        } catch { /* sem link se falhar */ }

        msgLines.push(``, `Qualquer dúvida, é só perguntar aqui!`);

        const msg = msgLines.join("\n");
        sendWhatsAppMessage(organizationId, conv.phoneNumber, msg, (conv as any).chatLid)
          .then(() =>
            prisma.conversation.update({
              where: { id: conv.id },
              data: { aiEnabled: false, operatorLastMessageAt: new Date() },
            })
          )
          .catch(() => {});
      }
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
