/**
 * Apaga todos os clientes e processos de UMA organização (e desvincula dependências).
 *
 * NÃO use: node scripts/clear-clients-processes.ts
 * (Node não transpila TypeScript nem resolve os imports do projeto.)
 *
 * A partir da RAIZ do repositório (evite `npx` no PowerShell se ExecutionPolicy bloquear):
 *   npm run db:clear-clients-processes -- LIMPAR
 *   node node_modules/tsx/dist/cli.mjs scripts/clear-clients-processes.ts LIMPAR
 *   node scripts/clear-clients-processes.mjs LIMPAR
 *
 * Opcional no .env (obrigatório se houver mais de uma organização):
 *   RESET_ORGANIZATION_ID=cuid_da_org
 *   RESET_ORG_SLUG=slug-da-org
 * Se existir só uma organização, o script usa ela automaticamente.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const CONFIRM = "LIMPAR";

function loadEnvFromRepo(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoFromScript = path.resolve(scriptDir, "..");
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (p: string) => {
    const n = path.normalize(p);
    if (seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  };
  add(path.join(repoFromScript, ".env"));
  add(path.join(repoFromScript, ".env.local"));
  add(path.join(process.cwd(), ".env"));
  add(path.join(process.cwd(), ".env.local"));
  for (const p of ordered) {
    if (existsSync(p)) loadEnv({ path: p, override: true });
  }
}

async function main() {
  loadEnvFromRepo();

  if (!process.env.DATABASE_URL?.trim()) {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoFromScript = path.resolve(scriptDir, "..");
    console.error(
      "DATABASE_URL não está definida após carregar o .env.\n" +
        `- Salve o arquivo .env na raiz do projeto (${repoFromScript}).\n` +
        "- Rode o comando a partir da raiz: cd para a pasta que contém package.json e .env\n" +
        `- cwd atual: ${process.cwd()}`
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/lib/prisma.js");
  const { resetOrgClientsAndProcesses } = await import("../src/lib/reset-org-clients-processes.js");

  try {
    const arg = process.argv[2];
    if (arg !== CONFIRM) {
      console.error(
        `Confirmação ausente ou inválida.\n` +
          `Na raiz do projeto: node node_modules/tsx/dist/cli.mjs scripts/clear-clients-processes.ts ${CONFIRM}\n` +
          `Ou: node scripts/clear-clients-processes.mjs ${CONFIRM}`
      );
      process.exitCode = 1;
      return;
    }

    const orgIdEnv = process.env.RESET_ORGANIZATION_ID?.trim();
    const slugEnv = process.env.RESET_ORG_SLUG?.trim();

    let organizationId: string | undefined;

    if (orgIdEnv) {
      const org = await prisma.organization.findUnique({
        where: { id: orgIdEnv },
        select: { id: true, name: true, slug: true },
      });
      if (!org) {
        console.error(`Organização não encontrada para id: ${orgIdEnv}`);
        process.exitCode = 1;
        return;
      }
      organizationId = org.id;
      console.log(`Organização: ${org.name} (${org.slug}) [${org.id}]`);
    } else if (slugEnv) {
      const org = await prisma.organization.findUnique({
        where: { slug: slugEnv },
        select: { id: true, name: true, slug: true },
      });
      if (!org) {
        console.error(`Organização não encontrada para slug: ${slugEnv}`);
        process.exitCode = 1;
        return;
      }
      organizationId = org.id;
      console.log(`Organização: ${org.name} (${org.slug}) [${org.id}]`);
    } else {
      const all = await prisma.organization.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      });
      if (all.length === 0) {
        console.error("Nenhuma organização no banco.");
        process.exitCode = 1;
        return;
      }
      if (all.length === 1) {
        const only = all[0]!;
        organizationId = only.id;
        console.log(
          `Sem RESET_ORG_SLUG / RESET_ORGANIZATION_ID — usando a única organização: ${only.name} (${only.slug})`
        );
      } else {
        console.error(
          "Defina RESET_ORGANIZATION_ID ou RESET_ORG_SLUG no .env (há mais de uma organização).\n" +
            "Organizações no banco:\n" +
            all.map(o => `  ${o.slug}\t${o.name}\t${o.id}`).join("\n")
        );
        process.exitCode = 1;
        return;
      }
    }

    const result = await resetOrgClientsAndProcesses(organizationId);
    console.log("Concluído:", result);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(e => {
  console.error(e);
  process.exit(1);
});
