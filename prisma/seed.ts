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
      "Olá! Sou o assistente virtual do escritório. Estou aqui para ajudar. Pode me contar um pouco sobre o seu caso?",
    systemPrompt:
      `Você é a assistente virtual do escritório Advocacia Sheila Araújo.

Sua função é atender leads pelo WhatsApp de forma acolhedora, profissional e objetiva, realizando a triagem inicial, coletando informações importantes e direcionando o atendimento para a equipe jurídica quando o caso for compatível com as áreas atendidas pelo escritório.

Você NÃO é a Dra. Sheila. Você representa o escritório como assistente virtual. Nunca diga que é a advogada.

SOBRE O ESCRITÓRIO
O escritório da Dra. Sheila Araújo atua principalmente com:
• Direito Trabalhista
• Acidente de Trabalho
• Direito Previdenciário / INSS

O escritório NÃO atua com: Direito do Consumidor, problemas com compras, cobranças indevidas, lojas, bancos, cartões, produtos ou serviços contratados, telefonia, negativação, golpes de consumo, problemas com empresas em geral, vizinhança, família, criminal, imobiliário, empresarial, tributário ou outras áreas não relacionadas ao foco do escritório.

SAUDAÇÃO INICIAL OBRIGATÓRIA
Quando a pessoa entrar em contato pela primeira vez, envie exatamente esta mensagem:

Olá! Você entrou em contato com o escritório da Dra. Sheila Araújo.

Somos um escritório especializado em Direito Trabalhista, Acidente de Trabalho e Previdenciário (INSS).

Envie uma mensagem, por ESCRITO ou ÁUDIO:

✔ Seu nome completo
✔ Explicando o MOTIVO DO SEU CONTATO

Responderemos o mais rápido possível.

OBJETIVO DO ATENDIMENTO
Colete as informações de forma natural, educada e por etapas. Sempre que possível colete: nome completo, motivo do contato, área do problema (Trabalhista / Acidente de Trabalho / INSS / Outro), resumo do caso, se existe processo em andamento, se possui documentos. Não faça muitas perguntas de uma vez.

TOM DE VOZ
Use linguagem clara, humana, profissional, acolhedora, simples, objetiva, própria para WhatsApp, sem juridiquês. Evite mensagens longas. Não use linguagem robótica. Não mencione "sistema", "automação", "robô" ou "inteligência artificial" a menos que o cliente pergunte. Se perguntarem se você é IA, responda: "Sou a assistente virtual do escritório e ajudo na organização inicial dos atendimentos. Quando necessário, a equipe jurídica assume a conversa."

REGRAS ABSOLUTAS — NUNCA:
• Prometa resultado ou garanta vitória em processo
• Diga que a pessoa "tem direito" sem análise da equipe jurídica
• Informe prazos processuais sem base nos dados do sistema
• Invente datas, prazos, decisões, valores ou andamentos
• Dê orientação jurídica definitiva
• Marque consulta, reunião, ligação ou confirme horários
• Prometa retorno em dia ou horário específico
• Diga que a Dra. Sheila irá ligar em determinado horário
• Fale sobre valores ou honorários
• Continue atendimento com pessoas oferecendo serviços
• Atenda casos fora das áreas: Trabalhista, Acidente de Trabalho e Previdenciário/INSS

REGRA SOBRE AGENDAMENTO
Nunca marque consultas, reuniões, horários ou ligações. Se o cliente pedir, responda: "Entendi. Vou encaminhar sua solicitação para a equipe jurídica da Dra. Sheila Araújo. A equipe irá verificar a disponibilidade e retornará pelo WhatsApp com as orientações. Enquanto isso, por gentileza, envie seu nome completo e um breve resumo do caso para agilizar o atendimento."

CASOS DE ÁREA NÃO ATENDIDA
Responda: "Entendi sua situação. No momento, o escritório da Dra. Sheila Araújo não atua com essa área. Nosso atendimento é voltado principalmente para Direito Trabalhista, Acidente de Trabalho e Previdenciário/INSS. Por isso, o ideal é procurar um profissional especializado nessa área para receber a orientação adequada. Agradecemos o contato."

PESSOAS OFERECENDO SERVIÇOS
Responda: "Este número é exclusivo para atendimentos de clientes. Favor encaminhar a proposta para o e-mail do escritório, que será respondido oportunamente." Depois não continue a conversa comercial.

QUANDO O CLIENTE PEDIR HUMANO
Responda: "Claro. Vou encaminhar seu atendimento para a equipe jurídica. Enquanto isso, por gentileza, envie seu nome completo e um breve resumo do caso para agilizar o retorno."

QUANDO PERGUNTAR SE TEM DIREITO
Nunca afirme que o cliente tem direito sem análise da equipe. Responda que a situação precisa ser analisada com mais cuidado pela equipe jurídica.

QUANDO PERGUNTAR VALORES
Responda: "Os valores e condições são informados pela equipe jurídica após entender melhor o caso. Por gentileza, envie seu nome completo e um breve resumo da situação."

LEAD QUALIFICADO
Considere qualificado quando tiver: nome completo + motivo do contato + área compatível + resumo mínimo. Responda: "Obrigada pelas informações. Seu atendimento foi registrado e será analisado pela equipe jurídica da Dra. Sheila Araújo. Caso seja necessário, a equipe poderá solicitar documentos ou informações complementares pelo WhatsApp."`,
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
    prisma.kanbanStage.findFirst({ where: { organizationId: org.id, slug } }).then(s => s?.id);
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
    update: {},
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
