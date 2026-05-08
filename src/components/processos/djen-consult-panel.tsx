"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Scale, User, Link2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClienteVinculavel {
  id: string;
  name: string;
  cpf: string | null;
}

interface Publication {
  comunicaId: number;
  processo: string;
  dataPublicacao: string;
  siglaTribunal: string | null;
  nomeClasse: string | null;
  nomeOrgao: string | null;
  tipoComunicacao: string | null;
  resumo: string;
  cpfsEncontrados: string[];
  clientesVinculaveis: ClienteVinculavel[];
}

interface Props {
  processId: string;
  processNumber: string | null;
}

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

function fmtCpf(cpf: string) {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`;
}

export function DjenConsultPanel({ processId }: Props) {
  const [oabNumero, setOabNumero] = useState("");
  const [oabUf, setOabUf] = useState("SP");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publications, setPublications] = useState<Publication[] | null>(null);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [linking, setLinking] = useState<Record<number, boolean>>({});
  const [linked, setLinked] = useState<Record<number, string>>({}); // comunicaId → clientId

  async function consultar() {
    if (!oabNumero.trim()) { setError("Informe o número da OAB."); return; }
    setLoading(true);
    setError(null);
    setPublications(null);
    setLinked({});

    const res = await fetch(`/api/processes/${processId}/djen-consult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oabNumero: oabNumero.trim(), oabUf, dataInicio, dataFim }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? "Erro ao consultar."); return; }
    setPublications(data.publications ?? []);
  }

  async function vincularCliente(pub: Publication, cliente: ClienteVinculavel) {
    setLinking(prev => ({ ...prev, [pub.comunicaId]: true }));

    // Vincula o cliente ao processo via API existente
    const res = await fetch(`/api/processes/${processId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: cliente.id }),
    });

    setLinking(prev => ({ ...prev, [pub.comunicaId]: false }));

    if (res.ok) {
      setLinked(prev => ({ ...prev, [pub.comunicaId]: cliente.id }));
    } else {
      const data = await res.json();
      setError(data.error ?? "Erro ao vincular cliente.");
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Consulta DJEN por OAB</CardTitle>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Pesquise publicações pelo número da OAB e período. Se encontrar o CPF de um cliente cadastrado, você pode vinculá-lo ao processo.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Formulário */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Número OAB</label>
            <input
              type="text"
              value={oabNumero}
              onChange={e => setOabNumero(e.target.value)}
              placeholder="Ex: 123456"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">UF da OAB</label>
            <select
              value={oabUf}
              onChange={e => setOabUf(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
            >
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Data início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Data fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        <Button onClick={consultar} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Consultando DJEN..." : "Consultar"}
        </Button>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Resultados */}
        {publications !== null && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                {publications.length === 0
                  ? "Nenhuma publicação encontrada no período."
                  : `${publications.length} publicação(ões) encontrada(s)`}
              </p>
            </div>

            {publications.map(pub => {
              const isExpanded = expanded[pub.comunicaId] ?? false;
              const isLinking = linking[pub.comunicaId] ?? false;
              const linkedName = linked[pub.comunicaId];

              return (
                <div
                  key={pub.comunicaId}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                >
                  {/* Cabeçalho do card de publicação */}
                  <div className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono font-semibold text-gray-700 truncate">{pub.processo}</span>
                        {pub.siglaTribunal && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{pub.siglaTribunal}</Badge>
                        )}
                        {pub.tipoComunicacao && (
                          <Badge variant="default" className="text-[10px] shrink-0">{pub.tipoComunicacao}</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">{pub.dataPublicacao}{pub.nomeOrgao ? ` · ${pub.nomeOrgao}` : ""}</p>
                    </div>
                    <button
                      onClick={() => toggleExpand(pub.comunicaId)}
                      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Conteúdo expandido */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{pub.resumo}</p>

                      {/* CPFs encontrados */}
                      {pub.cpfsEncontrados.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 mb-1.5">CPFs identificados na publicação</p>
                          <div className="flex flex-wrap gap-1.5">
                            {pub.cpfsEncontrados.map(cpf => (
                              <span key={cpf} className="text-[11px] font-mono bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
                                {fmtCpf(cpf)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Clientes vinculáveis */}
                      {pub.clientesVinculaveis.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 mb-1.5">
                            Cliente(s) encontrado(s) no sistema
                          </p>
                          <div className="space-y-2">
                            {pub.clientesVinculaveis.map(cliente => (
                              <div
                                key={cliente.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{cliente.name}</p>
                                    {cliente.cpf && (
                                      <p className="text-[10px] text-gray-400 font-mono">{fmtCpf(cliente.cpf.replace(/\D/g, ""))}</p>
                                    )}
                                  </div>
                                </div>

                                {linked[pub.comunicaId] === cliente.id ? (
                                  <div className="flex items-center gap-1.5 text-emerald-600 shrink-0">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-xs font-medium">Vinculado</span>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={isLinking || Boolean(linkedName)}
                                    onClick={() => vincularCliente(pub, cliente)}
                                    className={cn(
                                      "gap-1.5 text-xs shrink-0",
                                      "border border-blue-200 text-blue-700 hover:bg-blue-100"
                                    )}
                                  >
                                    {isLinking
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Link2 className="h-3 w-3" />}
                                    Vincular ao processo
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {pub.clientesVinculaveis.length === 0 && pub.cpfsEncontrados.length > 0 && (
                        <p className="text-[11px] text-gray-400 italic">
                          CPF(s) encontrado(s) na publicação, mas não correspondem a nenhum cliente cadastrado.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
