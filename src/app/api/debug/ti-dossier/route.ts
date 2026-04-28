import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveCredential } from "@/lib/credentials";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const apiKey = await resolveCredential(orgId, "TRAMITACAO_API_KEY");
  const baseUrlCred = await resolveCredential(orgId, "TRAMITACAO_API_URL");
  const baseUrl = (baseUrlCred ?? "https://planilha.tramitacaointeligente.com.br/api/v1").replace(/\/$/, "");

  if (!apiKey) return NextResponse.json({ error: "TRAMITACAO_API_KEY não configurada" }, { status: 422 });

  const h = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function probe(path: string) {
    const r = await fetch(`${baseUrl}${path}`, { headers: h });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  }

  // Testa a raiz da API e endpoints comuns de listagem
  const results = await Promise.all([
    probe(``).then(r => ({ key: "raiz_v1", ...r })),
    probe(`/`).then(r => ({ key: "raiz_barra", ...r })),
    probe(`/routes`).then(r => ({ key: "routes", ...r })),
    probe(`/endpoints`).then(r => ({ key: "endpoints", ...r })),
    probe(`/tarefas`).then(r => ({ key: "tarefas", ...r })),
    probe(`/tarefas?customer_id=434`).then(r => ({ key: "tarefas_customer", ...r })),
    probe(`/prazos`).then(r => ({ key: "prazos", ...r })),
    probe(`/prazos?customer_id=434`).then(r => ({ key: "prazos_customer", ...r })),
    probe(`/usuarios`).then(r => ({ key: "usuarios", ...r })),
    probe(`/notas?customer_id=434`).then(r => ({ key: "notas_customer", ...r })),
    probe(`/notas`).then(r => ({ key: "notas_todas", ...r })),
    probe(`/arquivos?customer_id=434`).then(r => ({ key: "arquivos", ...r })),
    probe(`/documentos?customer_id=434`).then(r => ({ key: "documentos", ...r })),
  ]);

  const ok = results.filter(r => r.status === 200);
  const other = results.filter(r => r.status !== 200).map(r => ({ key: r.key, status: r.status }));

  return NextResponse.json({ baseUrl, ok, notFound: other });
}
