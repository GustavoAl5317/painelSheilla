import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/lib/prisma";
import { normalizeBrazilianPhone } from "../src/lib/phone-normalize";

async function migrateConversations() {
  const all = await prisma.conversation.findMany({
    select: { id: true, phoneNumber: true, organizationId: true },
  });

  let updated = 0;
  let skipped = 0;
  let merged = 0;

  for (const conv of all) {
    const normalized = normalizeBrazilianPhone(conv.phoneNumber);
    if (!normalized || normalized === conv.phoneNumber) {
      skipped++;
      continue;
    }

    // Já existe outra conversa com o número normalizado? Mantém a mais antiga.
    const existing = await prisma.conversation.findFirst({
      where: {
        organizationId: conv.organizationId,
        phoneNumber: normalized,
        NOT: { id: conv.id },
      },
      select: { id: true },
    });

    if (existing) {
      console.log(
        `[merge] conv ${conv.id} (${conv.phoneNumber}) duplica ${existing.id} (${normalized}) — pulando`,
      );
      merged++;
      continue;
    }

    await prisma.conversation.update({
      where: { id: conv.id },
      data: { phoneNumber: normalized },
    });
    console.log(`[conv] ${conv.phoneNumber} → ${normalized}`);
    updated++;
  }

  console.log(`Conversas: ${updated} atualizadas, ${skipped} já ok, ${merged} duplicatas detectadas.`);
}

async function migrateLeads() {
  const all = await prisma.lead.findMany({
    select: { id: true, phone: true },
    where: { phone: { not: null } },
  });

  let updated = 0;
  let skipped = 0;

  for (const lead of all) {
    if (!lead.phone) continue;
    const normalized = normalizeBrazilianPhone(lead.phone);
    if (!normalized || normalized === lead.phone) {
      skipped++;
      continue;
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { phone: normalized } });
    console.log(`[lead] ${lead.phone} → ${normalized}`);
    updated++;
  }

  console.log(`Leads: ${updated} atualizados, ${skipped} já ok.`);
}

async function migrateBlockedNumbers() {
  const configs = await prisma.aIConfig.findMany();
  let updated = 0;

  for (const config of configs) {
    let list: any[] = (config.blockedNumbers as any) || [];
    if (typeof list === "string") list = JSON.parse(list);
    if (!Array.isArray(list) || list.length === 0) continue;

    let changed = false;
    const seen = new Set<string>();
    const normalized: any[] = [];

    for (const item of list) {
      const rawPhone = typeof item === "string" ? item : item?.phone;
      const norm = normalizeBrazilianPhone(rawPhone);
      if (!norm) continue;
      if (seen.has(norm)) {
        changed = true;
        continue;
      }
      seen.add(norm);
      if (norm !== rawPhone) changed = true;
      const next = typeof item === "string" ? { phone: norm } : { ...item, phone: norm };
      normalized.push(next);
    }

    if (changed) {
      await prisma.aIConfig.update({
        where: { id: config.id },
        data: { blockedNumbers: normalized as any },
      });
      console.log(`[ai-config] ${config.id}: ${list.length} → ${normalized.length} entradas`);
      updated++;
    }
  }

  console.log(`AIConfig: ${updated} configs atualizadas.`);
}

async function main() {
  await migrateConversations();
  await migrateLeads();
  await migrateBlockedNumbers();
}

main().catch(console.error).finally(() => prisma.$disconnect());
