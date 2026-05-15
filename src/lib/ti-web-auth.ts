import "server-only";

const BASE = "https://planilha.tramitacaointeligente.com.br";

export interface TIAuthResult {
  token: string;
  method: string;
}

/**
 * Autentica na Tramitação Inteligente via email + senha.
 * Tenta múltiplos padrões de API até achar um que funcione.
 */
export async function tiWebLogin(email: string, password: string): Promise<TIAuthResult> {
  const jsonHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; PainelScraper/1.0)",
  };

  // 1. devise_token_auth (mais comum em Rails + React)
  try {
    const res = await fetch(`${BASE}/auth/sign_in`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const token = res.headers.get("access-token") ?? res.headers.get("token");
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const jsonData = json?.data as Record<string, unknown> | undefined;
      const bodyToken = (json?.token ?? jsonData?.token ?? json?.auth_token) as string | undefined;
      const t = token ?? bodyToken;
      if (t) return { token: t, method: "devise_token_auth" };
    }
  } catch { /* tenta próximo */ }

  // 2. API v1 - padrão devise
  try {
    const res = await fetch(`${BASE}/api/v1/users/sign_in`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ user: { email, password } }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const jsonUser = json?.user as Record<string, unknown> | undefined;
      const t = (json?.token ?? json?.api_token ?? jsonUser?.token) as string | undefined;
      if (t) return { token: t, method: "api_v1_user" };
    }
  } catch { /* tenta próximo */ }

  // 3. POST /api/v1/tokens
  try {
    const res = await fetch(`${BASE}/api/v1/tokens`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const t = (json?.token ?? json?.api_key ?? json?.access_token) as string | undefined;
      if (t) return { token: t, method: "api_v1_tokens" };
    }
  } catch { /* tenta próximo */ }

  // 4. POST /api/v1/login
  try {
    const res = await fetch(`${BASE}/api/v1/login`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const t = (json?.token ?? json?.api_key ?? json?.access_token) as string | undefined;
      if (t) return { token: t, method: "api_v1_login" };
    }
  } catch { /* tenta próximo */ }

  // 5. POST /api/v1/sessions
  try {
    const res = await fetch(`${BASE}/api/v1/sessions`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const t = (json?.token ?? json?.session_token) as string | undefined;
      if (t) return { token: t, method: "api_v1_sessions" };
    }
  } catch { /* tenta próximo */ }

  // 6. Login via web (Rails Devise form) + cookie de sessão usado como "token"
  try {
    // Pega CSRF token da página de login
    const loginPageRes = await fetch(`${BASE}/users/sign_in`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    const loginHtml = await loginPageRes.text();
    const csrfMatch = loginHtml.match(/name="authenticity_token" value="([^"]+)"/);
    const csrf = csrfMatch?.[1] ?? "";
    const cookies = loginPageRes.headers.get("set-cookie") ?? "";

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
        Cookie: extractCookieString(cookies),
        "User-Agent": "Mozilla/5.0",
        Referer: `${BASE}/users/sign_in`,
      },
      body: formBody.toString(),
      redirect: "manual",
    });

    const sessionCookie = signInRes.headers.get("set-cookie") ?? "";
    const allCookies = [cookies, sessionCookie].filter(Boolean).join("; ");
    const sessionToken = extractSessionCookie(allCookies);

    if (sessionToken && signInRes.status === 302) {
      return { token: sessionToken, method: "web_session" };
    }
  } catch { /* falhou */ }

  throw new Error(
    "Não foi possível autenticar na Tramitação Inteligente. " +
    "Verifique o e-mail e senha fornecidos."
  );
}

function extractCookieString(raw: string): string {
  return raw
    .split(",")
    .map(c => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function extractSessionCookie(raw: string): string | null {
  const match = raw.match(/_planilha_session=([^;,\s]+)/);
  return match ? `_planilha_session=${match[1]}` : null;
}

/** Monta os headers de autenticação conforme o método utilizado. */
export function buildAuthHeaders(auth: TIAuthResult): Record<string, string> {
  const base: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; PainelScraper/1.0)",
  };

  if (auth.method === "web_session") {
    base["Cookie"] = auth.token;
    base["X-Requested-With"] = "XMLHttpRequest";
  } else {
    base["Authorization"] = `Bearer ${auth.token}`;
  }

  return base;
}
