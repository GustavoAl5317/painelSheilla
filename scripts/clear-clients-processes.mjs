/**
 * Wrapper que evita `npx` no PowerShell (ExecutionPolicy costuma bloquear npx.ps1).
 * Uso a partir da RAIZ do repositório:
 *   node scripts/clear-clients-processes.mjs LIMPAR
 *
 * Variáveis: RESET_ORG_SLUG ou RESET_ORGANIZATION_ID + DATABASE_URL no .env
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const scriptTs = path.join(root, "scripts", "clear-clients-processes.ts");
const args = process.argv.slice(2);

const r = spawnSync(process.execPath, [tsxCli, scriptTs, ...args], {
  cwd: root,
  stdio: "inherit",
});

process.exit(r.status === null ? 1 : r.status);
