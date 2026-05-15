import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";

const BASE = "https://planilha.tramitacaointeligente.com.br";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const jsonHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": BASE,
    "Referer": `${BASE}/`,
  };

  const results: Record<string, unknown>[] = [];

  // 1. Segue o redirect de GET /api/v1 para descobrir a versão real
  try {
    const res = await fetch(`${BASE}/api/v1`, { headers: { Accept: "application/json" }, redirect: "follow" });
    const text = await res.text().catch(() => "");
    results.push({
      label: "GET /api/v1 (follow redirect)",
      finalUrl: res.url,
      status: res.status,
      body: text.slice(0, 300),
    });
  } catch (err) {
    results.push({ label: "GET /api/v1 (follow redirect)", error: (err as Error).message });
  }

  // 2. Tenta versões de API diferentes com auth
  const versions = ["v2", "v3", "v4"];
  const authPaths = ["auth/sign_in", "sessions", "login", "users/sign_in"];

  for (const v of versions) {
    for (const path of authPaths) {
      const url = `${BASE}/api/${v}/${path}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ email, password }),
          redirect: "manual",
        });
        const text = await res.text().catch(() => "");
        const isCf = text.includes("Just a moment") || res.headers.get("cf-mitigated") === "challenge";
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = isCf ? "[CF block]" : text.slice(0, 200); }
        if (res.status !== 404 || !isCf) {
          results.push({ label: `POST /api/${v}/${path}`, status: res.status, cfBlocked: isCf, xRuntime: res.headers.get("x-runtime"), body });
        }
      } catch (err) {
        results.push({ label: `POST /api/${v}/${path}`, error: (err as Error).message });
      }
    }
  }

  // 3. Descobre rotas Rails via GET em recursos conhecidos (clientes, processos)
  const resources = ["clientes", "customers", "processos", "processes", "users"];
  for (const r of resources) {
    for (const v of ["v1", "v2", "v3"]) {
      const url = `${BASE}/api/${v}/${r}`;
      try {
        const res = await fetch(url, { headers: jsonHeaders, redirect: "manual" });
        const text = await res.text().catch(() => "");
        const isCf = text.includes("Just a moment") || res.headers.get("cf-mitigated") === "challenge";
        if (res.status !== 404) {
          let body: unknown;
          try { body = JSON.parse(text); } catch { body = isCf ? "[CF block]" : text.slice(0, 200); }
          results.push({ label: `GET /api/${v}/${r}`, status: res.status, cfBlocked: isCf, xRuntime: res.headers.get("x-runtime"), body });
        }
      } catch { /* ignora 404s */ }
    }
  }

  // 4. Tenta a raiz /api/ para ver o que existe
  try {
    const res = await fetch(`${BASE}/api`, { headers: { Accept: "application/json" }, redirect: "manual" });
    const text = await res.text().catch(() => "");
    results.push({ label: "GET /api", status: res.status, location: res.headers.get("location"), body: text.slice(0, 200) });
  } catch (err) {
    results.push({ label: "GET /api", error: (err as Error).message });
  }

  return NextResponse.json({ results });
}
