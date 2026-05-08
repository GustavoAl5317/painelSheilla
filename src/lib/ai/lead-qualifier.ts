import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { findClientIdByOrgPhone } from "@/lib/phone-link-client";
import { runAIChat } from "./ai-service";
import type { AIMessage, LeadChatMode } from "./ai-service";

async function resolveAIConfig(organizationId: string, phoneNumber: string) {
  const aiConfig = await prisma.aIConfig.findUnique({ where: { organizationId } });
  if (!aiConfig) {
    console.log(`[AI Config] Nenhuma configuração de IA encontrada para org ${organizationId}`);
    return null;
  }
  if (!aiConfig.isActive) {
    console.log(`[AI Config] IA está desativada globalmente para org ${organizationId}`);
    return null;
  }

  // Verifica bloqueio em massa por número
  const blockedList = (aiConfig as any).blockedNumbers;
  if (Array.isArray(blockedList)) {
    const isBlocked = blockedList.some((item: any) => {
      const p = String(item.phone || "").replace(/\D/g, "");
      return p === phoneNumber;
    });
    if (isBlocked) {
      console.log(`[AI ignore] Número ${phoneNumber} está na lista de bloqueio em massa.`);
      return null;
    }
  }

  const provider: "openai" | "anthropic" = aiConfig.provider === "ANTHROPIC" ? "anthropic" : "openai";
  const credKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const orgApiKey = await resolveCredential(organizationId, credKey);
  const apiKey = orgApiKey ?? aiConfig.apiKey ?? "";
  if (!apiKey) return null;

  // Usa o PromptTemplate marcado como padrão, com fallback para aiConfig.systemPrompt
  const defaultTemplate = await prisma.promptTemplate.findFirst({
    where: { organizationId, isDefault: true },
    select: { content: true },
  });
  const systemPrompt = defaultTemplate?.content ?? aiConfig.systemPrompt ?? "";

  return {
    apiKey,
    model: aiConfig.model,
    provider,
    systemPrompt,
    transferKeywords: aiConfig.transferToHumanKeywords ?? [],
  };
}

// ─── Progressão de stage (apenas IA: Lead → Aguardando dados; Cliente fechado = manual) ──

/** Ordem das 3 colunas do kanban. "closed" só muda no app, nunca pela IA. */
const STAGE_ORDER = ["new_lead", "awaiting_data", "closed"] as const;

/** Slugs legados de bases antigas → equivalente atual */
function canonicalStageSlug(slug: string | null | undefined): (typeof STAGE_ORDER)[number] {
  if (!slug) return "new_lead";
  if (slug === "in_progress" || slug === "waiting_docs" || slug === "proposal_sent") {
    return "awaiting_data";
  }
  if (STAGE_ORDER.includes(slug as (typeof STAGE_ORDER)[number])) {
    return slug as (typeof STAGE_ORDER)[number];
  }
  return "new_lead";
}

/** Score a partir de extractQualifiedData: nome, telefone, e-mail, área, CPF, resumo. */
const MIN_SCORE_FOR_AWAITING_DATA = 40;

async function advanceLeadStage(
  organizationId: string,
  leadId: string,
  currentSlug: string | undefined | null,
  score: number
): Promise<void> {
  const canon = canonicalStageSlug(currentSlug);
  const currentIndex = STAGE_ORDER.indexOf(canon);

  // Não mexe em quem já está em Cliente fechado (só humano) nem avança além
  if (canon === "closed") return;
  if (canon === "awaiting_data") return;

  if (score < MIN_SCORE_FOR_AWAITING_DATA) return;

  const targetStage = await prisma.kanbanStage.findFirst({
    where: { organizationId, slug: "awaiting_data" },
  });
  if (!targetStage) return;

  if (currentIndex < STAGE_ORDER.indexOf("awaiting_data")) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { stageId: targetStage.id },
    });
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processIncomingMessage(
  organizationId: string,
  conversationId: string,
  userMessage: string,
  hasMedia = false,
  currentMessageId?: string
) {
  const convInclude = {
    messages: { orderBy: { createdAt: "desc" as const }, take: 60 },
    lead: { include: { stage: true } },
  };
  let conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: convInclude,
  });
  if (!conversation) return null;
  if (conversation.isBlocked) {
    console.log(`[AI ignore] Conversa ${conversationId} está bloqueada.`);
    return null;
  }

  const config = await resolveAIConfig(organizationId, conversation.phoneNumber);
  if (!config) return null;

  // Mesma regra do webhook: tenta vincular Cliente existente (cadastro) pelo número do WhatsApp
  if (!conversation.clientId) {
    const clientId = await findClientIdByOrgPhone(organizationId, conversation.phoneNumber);
    if (clientId) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { clientId } });
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: convInclude,
      });
      if (!conversation) return null;
    }
  }

  // ── Contexto do cliente (se conversa já vinculada a um cliente) ───────────
  let clientContext: string | undefined;
  if (conversation.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: conversation.clientId },
      include: {
        processes: {
          where: { status: "ACTIVE" },
          include: {
            deadlines: {
              where: { status: "PENDING" },
              orderBy: { dueDate: "asc" },
              take: 3,
            },
          },
          take: 5,
        },
      },
    });

    if (client) {
      const processLines = client.processes.map(p => {
        const movimento = p.lastMovement
          ? `\n   Última movimentação (${p.lastMovementAt?.toLocaleDateString("pt-BR") ?? "?"}): ${p.lastMovement}`
          : "";
        return [
          `- Proc. ${p.number}${p.title ? ` | ${p.title}` : ""}${p.court ? ` | ${p.court}` : ""}`,
          movimento,
          "",
        ].filter(Boolean).join("");
      }).join("\n");

      // Entradas do card liberadas pelo advogado para o cliente ver
      const caseCard = await prisma.clientCaseCard.findUnique({
        where: { clientId: conversation.clientId! },
        include: {
          entries: {
            where: { shareWithClient: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
      const cardLines = caseCard?.entries.length
        ? caseCard.entries
            .map(e => `[${e.createdAt.toLocaleDateString("pt-BR")}] ${e.content}`)
            .join("\n")
        : null;

      clientContext = [
        `Nome: ${client.name}`,
        client.cpf ? `CPF: ${client.cpf}` : "",
        client.phone ? `Telefone: ${client.phone}` : "",
        (client as any).processNumber ? `Número do processo: ${(client as any).processNumber}` : "",
        client.processes.length > 0
          ? `\nProcessos ativos:\n${processLines}`
          : "\nNenhum processo ativo cadastrado.",
        cardLines
          ? `\nInformações do escritório:\n${cardLines}`
          : "",
      ].filter(Boolean).join("\n");
    }
  }

  // Mensagens chegam em ordem decrescente (mais recente primeiro) — inverte para ordem cronológica
  const chronological = [...conversation.messages].reverse();

  // Exclui a mensagem atual do histórico por ID (se disponível) ou pela posição final.
  const priorMessages = currentMessageId
    ? chronological.filter(m => m.id !== currentMessageId)
    : chronological.slice(0, -1);

  // Detecta se o operador humano interveio (mensagem OUTBOUND não gerada pela IA)
  const operatorIntervened = priorMessages.some(m => m.direction === "OUTBOUND" && !m.isAI);

  // Monta histórico completo. Mensagens do operador humano entram como "assistant" mas com
  // prefixo "[Atendente humano]" para a IA não confundir com respostas dela mesma.
  const history: AIMessage[] = priorMessages.map(m => {
    if (m.direction === "OUTBOUND" && !m.isAI) {
      return { role: "assistant" as const, content: `[Atendente humano]: ${m.content}` };
    }
    return {
      role: m.direction === "INBOUND" ? "user" as const : "assistant" as const,
      content: m.content,
    };
  });

  const inbounds = chronological.filter(m => m.direction === "INBOUND");
  const hadAiReply = chronological.some(m => m.direction === "OUTBOUND" && m.isAI);
  const allInboundText = inbounds.map(m => m.content).join("\n");
  const lead = conversation.lead;
  const nameLooksPhone =
    !lead?.name || /^\+?[\d\s().-]{10,}$/.test(lead.name.replace(/\s/g, ""));

  const textSuggestsOngoing = (t: string) =>
    /dra\.?|doutor|doutora|dra\s|doutor\s|sra\.?|sr\.?|oab|quando\s+o|valor|pagamento|processo|honor|já\s|retorno|acordo|escritór|escrit|advogad|parcela|me\s+lig|falar com/i.test(
      t
    );

  const leadMode: LeadChatMode =
    hadAiReply ||
    (lead && !nameLooksPhone) ||
    textSuggestsOngoing(userMessage) ||
    textSuggestsOngoing(allInboundText)
      ? "established"
      : "cold";

  // Se a mensagem sugere conversa em andamento mas não há histórico nem cadastro,
  // o sistema não tem contexto anterior — avisa que a doutora responderá em breve.
  const semContexto =
    leadMode === "established" &&
    history.length === 0 &&
    !clientContext &&
    textSuggestsOngoing(userMessage);

  if (semContexto) {
    return {
      content: "Olá! Recebi sua mensagem. Nossa equipe já foi notificada e a doutora responderá em breve. 😊",
      shouldTransferToHuman: true,
      triageComplete: false,
      qualifiedData: { score: 0 },
    };
  }

  const result = await runAIChat(config, history, userMessage, {
    clientContext,
    leadMode,
    hasMedia,
    operatorIntervened,
  });

  // ── Vincula conversa ao cliente pelo CPF (se ainda não vinculada) ─────────
  if (!conversation.clientId && result.qualifiedData?.cpf) {
    const cpfClean = result.qualifiedData.cpf.replace(/\D/g, "");
    const clientByCPF = await prisma.client.findFirst({
      where: { organizationId, cpf: cpfClean },
      select: { id: true },
    });
    if (clientByCPF) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { clientId: clientByCPF.id },
      });
    }
  }

  // ── Atualiza dados e score do lead ────────────────────────────────────────
  if (conversation.leadId && result.qualifiedData) {
    const { name, email, phone, legalArea, caseSummary, score } = result.qualifiedData;
    const currentLead = conversation.lead;
    const update: Record<string, unknown> = {};

    // Atualiza nome apenas se o lead ainda usa o telefone como nome (valor padrão do webhook)
    if (name && currentLead && /^\+?\d+$/.test(currentLead.name)) {
      update.name = name;
    }
    if (email)       update.email = email;
    if (phone)       update.phone = phone;
    if (legalArea)   update.legalArea = legalArea;
    if (caseSummary) update.caseSummary = caseSummary;

    if (score > (currentLead?.aiScore ?? 0)) {
      update.aiScore = score;
      if (score >= 40) update.aiQualified = true;
    }

    if (Object.keys(update).length > 0) {
      await prisma.lead.update({ where: { id: conversation.leadId }, data: update });
    }

    // ── Progressão automática de stage ────────────────────────────────────
    await advanceLeadStage(
      organizationId,
      conversation.leadId,
      currentLead?.stage?.slug,
      score
    );
  }

  // ── Triagem concluída ─────────────────────────────────────────────────────
  if (result.triageComplete && conversation.leadId) {
    await prisma.lead.update({
      where: { id: conversation.leadId },
      data: { aiQualified: true, aiScore: Math.max(conversation.lead?.aiScore ?? 0, 80) },
    });

    const targetStage = await prisma.kanbanStage.findFirst({
      where: { organizationId, slug: "awaiting_data" },
    });
    if (targetStage && canonicalStageSlug(conversation.lead?.stage?.slug) === "new_lead") {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { stageId: targetStage.id },
      });
    }

    await prisma.notification.create({
      data: {
        organizationId,
        type: "NEW_LEAD",
        title: "Triagem concluída — novo lead qualificado",
        message: `A IA concluiu a triagem de ${conversation.phoneNumber}. Caso pronto para análise.`,
        metadata: { conversationId, leadId: conversation.leadId },
      },
    });
  }

  // ── Transferência para humano ─────────────────────────────────────────────
  if (result.shouldTransferToHuman) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "TRANSFERRED_TO_HUMAN", aiEnabled: false },
    });

    await prisma.notification.create({
      data: {
        organizationId,
        type: "NEW_LEAD",
        title: "Lead solicitou atendimento humano",
        message: `Conversa com ${conversation.phoneNumber} precisa de atenção imediata.`,
        metadata: { conversationId, leadId: conversation.leadId },
      },
    });
  }

  return result;
}
