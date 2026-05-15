import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";

const BASE = "https://planilha.tramitacaointeligente.com.br";

/**
 * POST /api/admin/ti-debug
 * Body: { "email": "...", "password": "..." }
 *
 * Testa cada possível endpoint de autenticação e retorna status + body bruto
 * para descobrir qual a API correta da Tramitação Inteligente.
 */
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const jsonHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; PainelScraper/1.0)",
  };

  const results: Record<string, unknown>[] = [];

  const attempts = [
    { label: "POST /auth/sign_in (devise_token_auth)", url: `${BASE}/auth/sign_in`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/users/sign_in", url: `${BASE}/api/v1/users/sign_in`, body: JSON.stringify({ user: { email, password } }) },
    { label: "POST /api/v1/tokens", url: `${BASE}/api/v1/tokens`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/login", url: `${BASE}/api/v1/login`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/v1/sessions", url: `${BASE}/api/v1/sessions`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/login", url: `${BASE}/api/login`, body: JSON.stringify({ email, password }) },
    { label: "POST /api/sessions", url: `${BASE}/api/sessions`, body: JSON.stringify({ email, password }) },
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
      try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });

      results.push({
        label: attempt.label,
        url: attempt.url,
        status: res.status,
        headers: responseHeaders,
        body,
      });
    } catch (err) {
      results.push({ label: attempt.label, url: attempt.url, error: (err as Error).message });
    }
  }

  // Tenta também GET na raiz pra ver se tem algo
  try {
    const res = await fetch(`${BASE}/api/v1`, { headers: { Accept: "application/json" }, redirect: "manual" });
    const text = await res.text().catch(() => "");
    results.push({ label: "GET /api/v1 (discovery)", status: res.status, body: text.slice(0, 500) });
  } catch (err) {
    results.push({ label: "GET /api/v1 (discovery)", error: (err as Error).message });
  }

  // Tenta web form login para ver o redirect
  try {
    const loginPageRes = await fetch(`${BASE}/users/sign_in`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      redirect: "manual",
    });
    const html = await loginPageRes.text();
    const csrfMatch = html.match(/name="authenticity_token" value="([^"]+)"/);
    const csrf = csrfMatch?.[1] ?? "";
    const cookies = loginPageRes.headers.get("set-cookie") ?? "";

    if (csrf) {
      const formBody = new URLSearchParams({
        authenticity_token: csrf,
        "user[email]": email,
        "user[password]": password,
        commit: "Entrar",
      });

      const signInRes = await fetch(`${BASE}/users/sign_in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies.split(",").map(c => c.split(";")[0]?.trim()).filter(Boolean).join("; "),
          "User-Agent": "Mozilla/5.0",
          Referer: `${BASE}/users/sign_in`,
        },
        body: formBody.toString(),
        redirect: "manual",
      });

      const setCookie = signInRes.headers.get("set-cookie") ?? "";
      const location = signInRes.headers.get("location") ?? "";

      results.push({
        label: "Web form POST /users/sign_in",
        status: signInRes.status,
        location,
        hasCsrf: !!csrf,
        setCookie: setCookie.slice(0, 300),
      });
    } else {
      results.push({ label: "Web form GET /users/sign_in", status: loginPageRes.status, note: "CSRF não encontrado no HTML" });
    }
  } catch (err) {
    results.push({ label: "Web form /users/sign_in", error: (err as Error).message });
  }

  return NextResponse.json({ results });
}
