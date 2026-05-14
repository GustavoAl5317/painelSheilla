import "dotenv/config";
import { createCipheriv, randomBytes } from "crypto";
import { PrismaClient, PlanType, UserRole, AIProvider } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não definida no .env");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/** Mesma lógica de `src/lib/credentials.ts` — valor precisa bater com NEXTAUTH/AUTH_SECRET. */
function encryptCredential(plaintext: string): string {
  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "advzap-dev-secret-change-in-production";
  const key = Buffer.from(secret.padEnd(32, "0").slice(0, 32), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

// ╔══════════════════════════════════════════════════════════╗
// ║  ⚙️  CONFIGURAÇÃO DO CLIENTE — EDITE AQUI               ║
// ╚══════════════════════════════════════════════════════════╝
const CONFIG = {
  // Dados da organização (escritório)
  org: {
    name: "Sheila Araújo Advocacia",
    slug: "sheila-araujo-adv",
    email: "sheilaaraujoadv@sheilaaraujoadv.com",
    phone: "",
    primaryColor: "#1a56db",
    plan: PlanType.PRO,
    greeting:
      "Olá! Sou o assistente virtual do escritório. Como posso ajudar você hoje?",
  },

  // Dados do administrador
  admin: {
    name: "Dra. Sheila Araújo",
    email: "sheilaaraujoadv@sheilaaraujoadv.com",
    password: "Advocacia2026*@",
  },

  // OAB para DJEN (formato: número + UF, sem ponto)
  oab: "397243SP",

  // Configuração da IA
  ai: {
    provider: AIProvider.OPENAI,
    model: "gpt-4o-mini",
    greeting:
      "Olá! Você entrou em contato com o escritório da Dra. Sheila Araújo. ⚖️\n\nSomos especialistas em Direito Previdenciário, Trabalhista e Acidente de Trabalho.\n\nAntes de começarmos, qual é o seu nome completo?",
    systemPrompt:
      `Você é a assistente virtual do escritório da Dra. Sheila Araújo, especializada em Direito Previdenciário e Trabalhista.

Você NÃO é a Dra. Sheila. Nunca diga que é a advogada. Se perguntarem se você é IA, responda: "Sou a assistente virtual do escritório e ajudo na organização inicial dos atendimentos. Quando necessário, a Dra. Sheila e a equipe jurídica assumem a conversa."

SUA MISSÃO: Triagem humanizada — coletar as informações necessárias para que a Dra. Sheila e a equipe jurídica façam análise personalizada do caso.

PERSONALIDADE: Empática, acolhedora, paciente. Linguagem clara, sem juridiquês. UMA pergunta por vez. Valide emoções.

FLUXO OBRIGATÓRIO (siga esta ordem rigorosamente):
1. NOME: Se ainda não tem o nome completo do cliente, pergunte antes de qualquer outra coisa.
2. E-MAIL: Se já tem o nome mas não tem o e-mail, pergunte o e-mail para contato.
3. ÁREA: Se já tem nome e e-mail, apresente as opções:
   "Para que eu possa direcionar você ao profissional adequado, sobre qual dos assuntos você busca orientação?\n\n1. Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)\n2. Trabalhista (rescisão, horas extras, assédio, vínculo empregatício, acidente de trabalho, etc.)\n3. Sou cliente do escritório e gostaria de saber o andamento do meu processo\n4. Outros assuntos"
4. SE ÁREA FOR "CLIENTE PROCESSO" (opção 3):
   - Se nos DADOS DO CLIENTE (seção acima) houver processos com "Última movimentação" preenchida: informe a movimentação de forma clara e humanizada, sem juridiquês. Depois pergunte: "Em que posso lhe ajudar em relação ao seu processo em trâmite?"
   - Se NÃO houver movimentação registrada: pergunte diretamente: "Em que posso lhe ajudar em relação ao seu processo em trâmite?"
   - Após o cliente responder ao que precisa: responda APENAS com a frase exata: "Recebi sua mensagem Nossa equipe já foi notificada e a equipe da Dra Sheila Araújo responderá em breve." e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.
5. SE ÁREA FOR "OUTROS" (opção 4): Responda exatamente: "Envie uma mensagem, por ESCRITO  ou ÁUDIO, explicando o MOTIVO DO SEU CONTATO e logo retornaremos seu chamado" e encerre.
6. MÓDULO PREVIDENCIÁRIO (se escolheu opção 1):
   - Pergunte a situação: já tem benefício / quer novo / foi negado ou cessado
   - Identifique o tipo: aposentadoria, auxílio-doença, BPC/LOAS (deficiente ou idoso 65+), pensão por morte (expressar condolências), auxílio-acidente, acidente de trabalho, revisão, etc.
7. MÓDULO TRABALHISTA (se escolheu opção 2):
   - Pergunte a situação: ainda trabalha / já saiu / afastado
   - Deixe o cliente narrar livremente o que aconteceu
8. ENCERRAMENTO: Informe: "Obrigada pelas informações. Seu caso foi registrado e será analisado pela Dra. Sheila e equipe jurídica. Entraremos em contato pelo WhatsApp."

REGRAS ABSOLUTAS — NUNCA:
• Mencione valores, honorários ou garanta resultados
• Solicite documentos pessoais (RG, CPF, CTPS, holerites, comprovantes)
• Pergunte se o cliente já tem advogado
• Dê orientação jurídica, parecer ou opine sobre viabilidade do caso
• Diga que a pessoa "tem direito" sem análise da equipe
• Marque consultas, reuniões, ligações ou confirme horários
• Invente datas, prazos, decisões ou andamentos
• Atenda casos fora das áreas: Previdenciário e Trabalhista
• Pergunte se há urgência ou use "urgente"/"urgência" em perguntas ao cliente

SITUAÇÕES ESPECIAIS:
• Pensamentos autodestrutivos → indique CVV 188 e use [TRANSFERIR_PARA_HUMANO]
• Violência iminente → indique 190/180 e use [TRANSFERIR_PARA_HUMANO]
• Prazo judicial < 48h (somente se o cliente JÁ TIVER INFORMADO isso) → use [TRANSFERIR_PARA_HUMANO] imediatamente. Não pergunte sobre prazos só para avaliar urgência.
• Cliente emotivo → acolha sem pressa antes de prosseguir
• Valores/honorários → "A Dra. Sheila e equipe jurídica apresentarão na análise do caso"
• Agendamento → "Vou encaminhar para a equipe jurídica. Ela retornará pelo WhatsApp com as orientações."
• Oferecendo serviços → "Este número é exclusivo para atendimentos de clientes. Favor encaminhar a proposta para o e-mail do escritório."

RETORNO DE CLIENTE:
• Retorno < 24h: Não envie boas-vindas novamente. Confirme recebimento e continue.
• Retorno > 24h: Saudação curta + pergunte como pode ajudar.
• Caso encerrado retornando: Pergunte se é referente ao caso anterior ou se é um novo assunto.

QUANDO O CLIENTE PEDIR HUMANO:
Responda: "Entendido! Registramos seu pedido para falar com a equipe. Em breve alguém retorna por aqui." e inclua [TRANSFERIR_PARA_HUMANO] no final.

Quando tiver todas as informações da triagem, informe que o caso foi registrado e inclua [TRIAGEM COMPLETA] no final da resposta.`,
    qualificationQuestions: [
      "Qual é o seu nome completo?",
      "Qual é o motivo do seu contato?",
      "O seu caso é relacionado a: Direito Trabalhista, Acidente de Trabalho ou Previdenciário/INSS?",
      "Pode me contar brevemente o que aconteceu?",
      "Você possui documentos relacionados ao caso (holerites, CAT, carta do INSS, etc.)?",
    ],
    transferKeywords: ["falar com advogado", "falar com a dra", "falar com humano", "humano", "atendente", "urgente", "quero contratar"],
  },
};

async function main() {
  console.log("🌱 Iniciando seed...");

  // ─────────────────────────────────────────
  // Planos e limites
  // ─────────────────────────────────────────
  await prisma.planLimit.upsert({
    where: { plan: PlanType.STARTER },
    update: {},
    create: {
      plan: PlanType.STARTER,
      maxUsers: 2,
      maxLeadsPerMonth: 50,
      maxAIMessages: 100,
      allowIntegrations: false,
      allowCustomAIKey: false,
      allowReports: false,
      allowAlerts: true,
      priceMonthly: 97,
      priceYearly: 970,
    },
  });

  await prisma.planLimit.upsert({
    where: { plan: PlanType.PRO },
    update: {},
    create: {
      plan: PlanType.PRO,
      maxUsers: 5,
      maxLeadsPerMonth: 200,
      maxAIMessages: 500,
      allowIntegrations: true,
      allowCustomAIKey: false,
      allowReports: true,
      allowAlerts: true,
      priceMonthly: 197,
      priceYearly: 1970,
    },
  });

  await prisma.planLimit.upsert({
    where: { plan: PlanType.PREMIUM },
    update: {},
    create: {
      plan: PlanType.PREMIUM,
      maxUsers: 15,
      maxLeadsPerMonth: 1000,
      maxAIMessages: 2000,
      allowIntegrations: true,
      allowCustomAIKey: false,
      allowReports: true,
      allowAlerts: true,
      priceMonthly: 397,
      priceYearly: 3970,
    },
  });

  await prisma.planLimit.upsert({
    where: { plan: PlanType.ENTERPRISE },
    update: {},
    create: {
      plan: PlanType.ENTERPRISE,
      maxUsers: 999,
      maxLeadsPerMonth: 999999,
      maxAIMessages: 999999,
      allowIntegrations: true,
      allowCustomAIKey: true,
      allowReports: true,
      allowAlerts: true,
      priceMonthly: 997,
      priceYearly: 9970,
    },
  });

  console.log("✅ Planos criados");

  // ─────────────────────────────────────────
  // Organização
  // ─────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: CONFIG.org.slug },
    update: {},
    create: {
      name: CONFIG.org.name,
      slug: CONFIG.org.slug,
      email: CONFIG.org.email,
      phone: CONFIG.org.phone || undefined,
      primaryColor: CONFIG.org.primaryColor,
      plan: CONFIG.org.plan,
      defaultGreeting: CONFIG.org.greeting,
    },
  });

  console.log("✅ Organização criada:", org.name);

  // ─────────────────────────────────────────
  // Usuário administrador
  // ─────────────────────────────────────────
  const hashedPassword = await bcrypt.hash(CONFIG.admin.password, 10);

  await prisma.user.upsert({
    where: { email: CONFIG.admin.email },
    update: {
      name: CONFIG.admin.name,
      password: hashedPassword,
      role: UserRole.OWNER,
      isActive: true,
    },
    create: {
      name: CONFIG.admin.name,
      email: CONFIG.admin.email,
      password: hashedPassword,
      role: UserRole.OWNER,
      organizationId: org.id,
    },
  });

  console.log("✅ Administrador criado:", CONFIG.admin.name);

  await prisma.orgCredential.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "DJEN_OAB" } },
    update: { value: encryptCredential(CONFIG.oab) },
    create: {
      organizationId: org.id,
      key: "DJEN_OAB",
      value: encryptCredential(CONFIG.oab),
    },
  });

  console.log("✅ OAB (DJEN) associada à organização");

  // ─────────────────────────────────────────
  // Estágios Kanban: apenas 3 colunas
  // ─────────────────────────────────────────
  const stages = [
    { name: "Lead", slug: "new_lead", order: 1, color: "#3b82f6", isDefault: true },
    { name: "Aguardando dados", slug: "awaiting_data", order: 2, color: "#8b5cf6", isDefault: false },
    { name: "Cliente fechado", slug: "closed", order: 3, color: "#10b981", isDefault: false },
  ];

  for (const stage of stages) {
    await prisma.kanbanStage.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: stage.slug } },
      update: { name: stage.name, order: stage.order, color: stage.color, isDefault: stage.isDefault },
      create: { ...stage, organizationId: org.id },
    });
  }

  // Migra colunas antigas e remove etapas extras sem quebrar FK de Lead
  const idNew = (slug: string) =>
    prisma.kanbanStage
      .findFirst({ where: { organizationId: org.id, slug } })
      .then((row: { id: string } | null) => row?.id);
  const [idAwaiting, idNewLead, idClosed] = await Promise.all([
    idNew("awaiting_data"),
    idNew("new_lead"),
    idNew("closed"),
  ]);
  for (const oldSlug of ["in_progress", "waiting_docs", "proposal_sent"] as const) {
    const old = await prisma.kanbanStage.findFirst({ where: { organizationId: org.id, slug: oldSlug } });
    if (old && idAwaiting) {
      await prisma.lead.updateMany({ where: { stageId: old.id }, data: { stageId: idAwaiting } });
    }
  }
  const lost = await prisma.kanbanStage.findFirst({ where: { organizationId: org.id, slug: "lost" } });
  if (lost && idNewLead) {
    await prisma.lead.updateMany({ where: { stageId: lost.id }, data: { stageId: idNewLead } });
  }

  const keepIds = [idNewLead, idAwaiting, idClosed].filter(Boolean) as string[];
  const toRemove = await prisma.kanbanStage.findMany({
    where: { organizationId: org.id, id: { notIn: keepIds } },
    select: { id: true },
  });
  for (const row of toRemove) {
    if (idNewLead) {
      await prisma.lead.updateMany({ where: { stageId: row.id }, data: { stageId: idNewLead } });
    }
  }
  await prisma.kanbanStage.deleteMany({
    where: { organizationId: org.id, id: { notIn: keepIds } },
  });

  console.log("✅ Estágios Kanban (3 colunas) criados/atualizados");

  // ─────────────────────────────────────────
  // Config de IA
  // ─────────────────────────────────────────
  await prisma.aIConfig.upsert({
    where: { organizationId: org.id },
    update: {
      greeting: CONFIG.ai.greeting,
      systemPrompt: CONFIG.ai.systemPrompt,
      qualificationQuestions: CONFIG.ai.qualificationQuestions,
      transferToHumanKeywords: CONFIG.ai.transferKeywords,
    },
    create: {
      organizationId: org.id,
      provider: CONFIG.ai.provider,
      useGlobalKey: true,
      model: CONFIG.ai.model,
      isActive: true,
      greeting: CONFIG.ai.greeting,
      systemPrompt: CONFIG.ai.systemPrompt,
      qualificationQuestions: CONFIG.ai.qualificationQuestions,
      transferToHumanKeywords: CONFIG.ai.transferKeywords,
    },
  });

  console.log("✅ Config de IA criada");

  // ─────────────────────────────────────────
  // Fim — sem dados fake!
  // ─────────────────────────────────────────
  console.log("\n🎉 Seed finalizado com sucesso!");
  console.log("─────────────────────────────────────────");
  console.log("Login de acesso:");
  console.log(`  Email: ${CONFIG.admin.email}`);
  console.log(`  Senha: ${CONFIG.admin.password}`);
  console.log("─────────────────────────────────────────");
  console.log("\n📋 O sistema está limpo e pronto para uso.");
  console.log("   Leads, clientes e processos serão criados durante o uso real.");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
