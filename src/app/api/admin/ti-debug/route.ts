import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";

const BASE = "https://planilha.tramitacaointeligente.com.br";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const base64 = Buffer.from(`${email}:${password}`).toString("base64");
  const results: Record<string, unknown>[] = [];

  const authAttempts = [
    { label: "Basic auth", headers: { Authorization: `Basic ${base64}` } },
    { label: "Bearer email:password base64", headers: { Authorization: `Bearer ${base64}` } },
    { label: "Token token=email:password", headers: { Authorization: `Token token=${base64}` } },
    { label: "X-User-Email + X-User-Token (password)", headers: { "X-User-Email": email, "X-User-Token": password } },
    { label: "X-Api-Key = password", headers: { "X-Api-Key": password } },
    { label: "query ?user_email&user_token (password as token)", url: `/api/v1/clientes?user_email=${encodeURIComponent(email)}&user_token=${encodeURIComponent(password)}`, headers: {} },
    { label: "query ?email&password", url: `/api/v1/clientes?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, headers: {} },
  ];

  for (const attempt of authAttempts) {
    const url = `${BASE}${(attempt as { url?: string }).url ?? "/api/v1/clientes"}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          ...attempt.headers,
        },
        redirect: "manual",
      });
      const text = await res.text().catch(() => "");
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
      results.push({ label: attempt.label, status: res.status, xRuntime: res.headers.get("x-runtime"), body });
    } catch (err) {
      results.push({ label: attempt.label, error: (err as Error).message });
    }
  }

  return NextResponse.json({ results });
}
