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

  // Apenas variantes /api/v1/ — essas passam pelo Cloudflare e chegam no Rails
  const attempts = [
    { label: "POST /api/v1/auth/sign_in", url: `${BASE}/api/v1/auth/sign_in`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/auth/sign_in (user wrap)", url: `${BASE}/api/v1/auth/sign_in`, body: JSON.stringify({ user: { email, password } }) },
    { label: "POST /api/v1/sessions", url: `${BASE}/api/v1/sessions`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/sessions (user wrap)", url: `${BASE}/api/v1/sessions`, body: JSON.stringify({ user: { email, password } }) },
    { label: "POST /api/v1/login", url: `${BASE}/api/v1/login`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/authenticate", url: `${BASE}/api/v1/authenticate`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/token", url: `${BASE}/api/v1/token`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/access_tokens", url: `${BASE}/api/v1/access_tokens`, body: JSON.stringify({ email, password }) },
    // Tenta também com snake_case
    { label: "POST /api/v1/auth/sign_in (snake)", url: `${BASE}/api/v1/auth/sign_in`, body: JSON.stringify({ user_email: email, user_password: password }) },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: jsonHeaders,
        body: attempt.body,
        redirect: "manual",
      });

      let body: unknown = null;
      const text = await res.text().catch(() => "");
      const isCfChallenge = text.includes("Just a moment") || res.headers.get("cf-mitigated") === "challenge";
      try { body = JSON.parse(text); } catch { body = isCfChallenge ? "[Cloudflare challenge]" : text.slice(0, 300); }

      results.push({
        label: attempt.label,
        status: res.status,
        cfBlocked: isCfChallenge,
        xRuntime: res.headers.get("x-runtime"),
        body,
      });
    } catch (err) {
      results.push({ label: attempt.label, error: (err as Error).message });
    }
  }

  // Descobre rotas disponíveis via OPTIONS
  try {
    const res = await fetch(`${BASE}/api/v1/auth/sign_in`, {
      method: "OPTIONS",
      headers: { "Origin": BASE, "Access-Control-Request-Method": "POST" },
      redirect: "manual",
    });
    results.push({ label: "OPTIONS /api/v1/auth/sign_in", status: res.status, allow: res.headers.get("allow") });
  } catch (err) {
    results.push({ label: "OPTIONS /api/v1/auth/sign_in", error: (err as Error).message });
  }

  return NextResponse.json({ results });
}
