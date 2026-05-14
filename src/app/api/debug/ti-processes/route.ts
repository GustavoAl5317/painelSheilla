import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveCredential } from "@/lib/credentials";

/**
 * GET /api/debug/ti-processes?tiCustomerId=449
 *
 * Proba todos os endpoints de processos da TI para um cliente específico
 * e retorna as respostas brutas. Use para diagnosticar por que processos
 * não estão sendo importados.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const tiCustomerId = req.nextUrl.searchParams.get("tiCustomerId");

  if (!tiCustomerId) {
    return NextResponse.json({ error: "Informe ?tiCustomerId=XXX na URL" }, { status: 400 });
  }

  const apiKey = await resolveCredential(orgId, "TRAMITACAO_API_KEY");
  const baseUrlCred = await resolveCredential(orgId, "TRAMITACAO_API_URL");
  const baseUrl = (baseUrlCred ?? "https://planilha.tramitacaointeligente.com.br/api/v1").replace(/\/$/, "");

  if (!apiKey) return NextResponse.json({ error: "TRAMITACAO_API_KEY não configurada" }, { status: 422 });

  const h = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const id = tiCustomerId;

  const paths = [
    `/clientes/${id}`,
    `/clientes/${id}?include=processos`,
    `/clientes/${id}?include=processos,last_movements`,
    `/clientes/${id}/processos`,
    `/clientes/${id}/processos?page=1&per_page=100`,
    `/processos?customer_id=${id}`,
    `/processos?customer_id=${id}&per_page=100`,
    `/processos?cliente_id=${id}`,
    `/lawsuits?customer_id=${id}`,
    `/monitoramentos?customer_id=${id}`,
    `/casos?customer_id=${id}`,
    `/acompanhamentos?customer_id=${id}`,
  ];

  const results = await Promise.all(
    paths.map(async path => {
      try {
        const res = await fetch(`${baseUrl}${path}`, { headers: h });
        const body = await res.json().catch(() => null);
        return {
          path,
          status: res.status,
          ok: res.ok,
          // Limita o body a 2KB para não sobrecarregar a resposta
          body: JSON.parse(JSON.stringify(body).slice(0, 2000)),
          keys: body && typeof body === "object" && !Array.isArray(body)
            ? Object.keys(body as object)
            : Array.isArray(body)
              ? [`array[${(body as unknown[]).length}]`]
              : null,
        };
      } catch (e) {
        return { path, status: null, ok: false, error: (e as Error).message, body: null, keys: null };
      }
    })
  );

  const ok = results.filter(r => r.ok);
  const notOk = results.filter(r => !r.ok).map(r => ({ path: r.path, status: r.status }));

  return NextResponse.json({ baseUrl, tiCustomerId: id, ok, notOk });
}
