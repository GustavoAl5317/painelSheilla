"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, Scale, User, Link2, CheckCircle2,
  ChevronDown, ChevronUp, FileText, RefreshCw, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClienteVinculavel {
  id: string;
  name: string;
  cpf: string | null;
}

interface Processo {
  id: string;
  number: string | null;
  title: string | null;
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
  rawText: string;
  cpfsEncontrados: string[];
  clientesVinculaveis: ClienteVinculavel[];
}

interface LinkedInfo {
  processId: string;
  processNumber: string | null;
  processTitle: string | null;
  client: { id: string; name: string; cpf: string | null } | null;
}

interface ClienteSimples {
  id: string;
  name: string;
  cpf: string | null;
}

interface Props {
  processos: Processo[];
}

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type LinkState =
  | { status: "idle" }
  | { status: "selecting" }
  | { status: "loading" }
  | { status: "done"; resumo: string };

type ManualLinkState =
  | { status: "idle" }
  | { status: "selecting" }
  | { status: "loading" }
  | { status: "done"; resumo: string };

type UpdateCardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; resumo: string };

export function DjenConsultPage({ processos }: Props) {
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
  const [filterText, setFilterText] = useState("");

  // linked: comunicaId → info de vínculo já existente (carregado após consulta)
  const [linked, setLinked] = useState<Record<number, LinkedInfo>>({});

  // clientes para vínculo manual
  const [allClients, setAllClients] = useState<ClienteSimples[] | null>(null);
  const [clientsLoading, setClientsLoading] = useState(false);

  // linkState (CPF identificado): por (comunicaId, clienteId)
  const [linkState, setLinkState] = useState<Record<string, LinkState>>({});
  const [selectedProcess, setSelectedProcess] = useState<Record<string, string>>({});

  // manualLinkState: por comunicaId (vínculo manual)
  const [manualLinkState, setManualLinkState] = useState<Record<number, ManualLinkState>>({});
  const [manualClient, setManualClient] = useState<Record<number, string>>({});
  const [manualProcess, setManualProcess] = useState<Record<number, string>>({});
  const [clientSearch, setClientSearch] = useState<Record<number, string>>({});

  // updateCardState: por (comunicaId, clienteId)
  const [updateCardState, setUpdateCardState] = useState<Record<string, UpdateCardState>>({});

  function linkKey(comunicaId: number, clienteId: string) {
    return `${comunicaId}__${clienteId}`;
  }

  function updateCardKey(comunicaId: number, clienteId: string) {
    return `${comunicaId}__${clienteId}`;
  }

  const loadClients = useCallback(async () => {
    if (allClients !== null) return;
    setClientsLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setAllClients(Array.isArray(data) ? data : []);
    } catch {
      setAllClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, [allClients]);

  async function consultar() {
    if (!oabNumero.trim()) { setError("Informe o número da OAB."); return; }
    setLoading(true);
    setError(null);
    setPublications(null);
    setLinkState({});
    setSelectedProcess({});
    setManualLinkState({});
    setManualClient({});
    setManualProcess({});
    setClientSearch({});
    setUpdateCardState({});
    setLinked({});

    const res = await fetch("/api/djen-consult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oabNumero: oabNumero.trim(), oabUf, dataInicio, dataFim }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? "Erro ao consultar."); return; }

    const raw: Publication[] = data.publications ?? [];
    const seen = new Set<number>();
    const pubs = raw.filter(p => { if (seen.has(p.comunicaId)) return false; seen.add(p.comunicaId); return true; });
    setPublications(pubs);

    // Verifica vínculos já existentes
    if (pubs.length > 0) {
      const ids = pubs.map(p => p.comunicaId).join(",");
      const lRes = await fetch(`/api/djen-consult/linked?comunicaIds=${ids}`);
      if (lRes.ok) {
        const lData = await lRes.json();
        setLinked(lData.linked ?? {});
      }
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Vínculo por CPF identificado ──────────────────────────────────────────

  function startSelectProcess(comunicaId: number, clienteId: string) {
    const key = linkKey(comunicaId, clienteId);
    setLinkState(prev => ({ ...prev, [key]: { status: "selecting" } }));
  }

  async function vincular(pub: Publication, cliente: ClienteVinculavel, processId: string) {
    const key = linkKey(pub.comunicaId, cliente.id);
    setLinkState(prev => ({ ...prev, [key]: { status: "loading" } }));

    const res = await fetch("/api/djen-consult/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processId,
        clientId: cliente.id,
        rawText: pub.rawText,
        processo: pub.processo,
        dataPublicacao: pub.dataPublicacao,
        siglaTribunal: pub.siglaTribunal,
        comunicaId: pub.comunicaId,
      }),
    });

    const resData = await res.json();

    if (res.ok) {
      setLinkState(prev => ({ ...prev, [key]: { status: "done", resumo: resData.resumo ?? "" } }));
      // Marca como vinculado
      const proc = processos.find(p => p.id === processId);
      setLinked(prev => ({
        ...prev,
        [pub.comunicaId]: {
          processId,
          processNumber: proc?.number ?? null,
          processTitle: proc?.title ?? null,
          client: { id: cliente.id, name: cliente.name, cpf: cliente.cpf },
        },
      }));
    } else {
      setError(resData.error ?? "Erro ao vincular.");
      setLinkState(prev => ({ ...prev, [key]: { status: "idle" } }));
    }
  }

  // ── Vínculo manual (sem CPF identificado) ────────────────────────────────

  async function startManualLink(comunicaId: number) {
    await loadClients();
    setManualLinkState(prev => ({ ...prev, [comunicaId]: { status: "selecting" } }));
  }

  async function vincularManual(pub: Publication) {
    const clientId = manualClient[pub.comunicaId];
    const processId = manualProcess[pub.comunicaId];
    if (!clientId || !processId) return;

    setManualLinkState(prev => ({ ...prev, [pub.comunicaId]: { status: "loading" } }));

    const cliente = allClients?.find(c => c.id === clientId);

    const res = await fetch("/api/djen-consult/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processId,
        clientId,
        rawText: pub.rawText,
        processo: pub.processo,
        dataPublicacao: pub.dataPublicacao,
        siglaTribunal: pub.siglaTribunal,
        comunicaId: pub.comunicaId,
      }),
    });

    const resData = await res.json();

    if (res.ok) {
      setManualLinkState(prev => ({ ...prev, [pub.comunicaId]: { status: "done", resumo: resData.resumo ?? "" } }));
      const proc = processos.find(p => p.id === processId);
      setLinked(prev => ({
        ...prev,
        [pub.comunicaId]: {
          processId,
          processNumber: proc?.number ?? null,
          processTitle: proc?.title ?? null,
          client: cliente ? { id: cliente.id, name: cliente.name, cpf: cliente.cpf } : null,
        },
      }));
    } else {
      setError(resData.error ?? "Erro ao vincular.");
      setManualLinkState(prev => ({ ...prev, [pub.comunicaId]: { status: "idle" } }));
    }
  }

  // ── Atualizar card com resumo ─────────────────────────────────────────────

  async function atualizarCard(pub: Publication, clienteId: string, processId: string) {
    const key = updateCardKey(pub.comunicaId, clienteId);
    setUpdateCardState(prev => ({ ...prev, [key]: { status: "loading" } }));

    const res = await fetch("/api/djen-consult/update-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clienteId,
        processId,
        rawText: pub.rawText,
        processo: pub.processo,
        dataPublicacao: pub.dataPublicacao,
        siglaTribunal: pub.siglaTribunal,
      }),
    });

    const resData = await res.json();

    if (res.ok) {
      setUpdateCardState(prev => ({ ...prev, [key]: { status: "done", resumo: resData.resumo ?? "" } }));
    } else {
      setError(resData.error ?? "Erro ao atualizar card.");
      setUpdateCardState(prev => ({ ...prev, [key]: { status: "idle" } }));
    }
  }

  // ── Helpers de render ─────────────────────────────────────────────────────

  function filteredClients(comunicaId: number) {
    const term = (clientSearch[comunicaId] ?? "").toLowerCase().trim();
    if (!allClients) return [];
    if (!term) return allClients;
    return allClients.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.cpf ?? "").includes(term)
    );
  }

  function processLabel(p: Processo) {
    const num = p.number && p.number !== "(a definir)" ? p.number : "Sem número";
    return p.title ? `${num} · ${p.title}` : num;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Consulta DJEN por OAB</CardTitle>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Pesquise publicações pelo número da OAB e período. Vincule ao cliente/processo e atualize o card com resumo da IA.
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
          <div className="space-y-3 border-t border-gray-100 mt-6 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <p className="text-sm font-semibold text-gray-700">
                {publications.length === 0
                  ? "Nenhuma publicação encontrada no período."
                  : `${publications.length} publicação(ões) encontrada(s)`}
              </p>

              {publications.length > 0 && (
                <div className="relative max-w-xs w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    placeholder="Filtrar por processo ou nome..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              )}
            </div>

            {publications
              .filter(pub => {
                const term = filterText.toLowerCase().trim();
                if (!term) return true;
                return (
                  pub.processo.toLowerCase().includes(term) ||
                  pub.resumo.toLowerCase().includes(term) ||
                  pub.clientesVinculaveis.some(c => c.name.toLowerCase().includes(term)) ||
                  pub.cpfsEncontrados.some(c => c.includes(term))
                );
              })
              .map(pub => {
                const isExpanded = expanded[pub.comunicaId] ?? false;
                const linkedInfo = linked[pub.comunicaId] ?? null;
                const manualState = manualLinkState[pub.comunicaId] ?? { status: "idle" };

                return (
                  <div
                    key={pub.comunicaId}
                    className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                  >
                    {/* Cabeçalho do card */}
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
                          {pub.clientesVinculaveis.length > 0 && (
                            <Badge className="text-[10px] shrink-0 bg-blue-100 text-blue-700 border border-blue-200">
                              {pub.clientesVinculaveis.length} cliente(s) identificado(s)
                            </Badge>
                          )}
                          {linkedInfo && (
                            <Badge className="text-[10px] shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200">
                              Vinculado
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {pub.dataPublicacao}{pub.nomeOrgao ? ` · ${pub.nomeOrgao}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleExpand(pub.comunicaId)}
                        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50/50">
                        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{pub.resumo}</p>

                        {pub.cpfsEncontrados.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1.5">CPFs identificados</p>
                            <div className="flex flex-wrap gap-1.5">
                              {pub.cpfsEncontrados.map(cpf => (
                                <span key={cpf} className="text-[11px] font-mono bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
                                  {cpf}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Clientes identificados por CPF ── */}
                        {pub.clientesVinculaveis.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1.5">
                              Cliente(s) encontrado(s) no sistema
                            </p>
                            <div className="space-y-3">
                              {pub.clientesVinculaveis.map(cliente => {
                                const key = linkKey(pub.comunicaId, cliente.id);
                                const state = linkState[key] ?? { status: "idle" };
                                const procSel = selectedProcess[key] ?? "";
                                const ucKey = updateCardKey(pub.comunicaId, cliente.id);
                                const ucState = updateCardState[ucKey] ?? { status: "idle" };

                                return (
                                  <div
                                    key={cliente.id}
                                    className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 space-y-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                      <div>
                                        <p className="text-xs font-semibold text-gray-800">{cliente.name}</p>
                                        {cliente.cpf && (
                                          <p className="text-[10px] text-gray-400 font-mono">{cliente.cpf}</p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Vincular ao processo */}
                                    {state.status === "done" ? (
                                      <div className="flex items-start gap-2 text-emerald-600">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                          <p className="text-xs font-medium">Vinculado com sucesso</p>
                                          {state.resumo && (
                                            <div className="mt-1 flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-1.5">
                                              <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                              <span className="leading-relaxed">{state.resumo}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : state.status === "selecting" ? (
                                      <div className="space-y-2">
                                        <label className="text-[10px] font-medium text-gray-600">Selecione o processo</label>
                                        <select
                                          value={procSel}
                                          onChange={e => setSelectedProcess(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
                                        >
                                          <option value="">-- Selecione --</option>
                                          {processos.map(p => (
                                            <option key={p.id} value={p.id}>{processLabel(p)}</option>
                                          ))}
                                        </select>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            disabled={!procSel}
                                            onClick={() => vincular(pub, cliente, procSel)}
                                            className="gap-1.5 text-xs flex-1"
                                          >
                                            <Link2 className="h-3 w-3" />
                                            Confirmar vinculação
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setLinkState(prev => ({ ...prev, [key]: { status: "idle" } }))}
                                            className="text-xs"
                                          >
                                            Cancelar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : state.status === "loading" ? (
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Vinculando e processando com IA...
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => startSelectProcess(pub.comunicaId, cliente.id)}
                                        className={cn(
                                          "gap-1.5 text-xs w-full justify-start",
                                          "border border-blue-200 text-blue-700 hover:bg-blue-100"
                                        )}
                                      >
                                        <Link2 className="h-3 w-3" />
                                        Vincular ao processo
                                      </Button>
                                    )}

                                    {/* Atualizar card — aparece quando vinculado (seja agora ou antes) */}
                                    {(state.status === "done" || linkedInfo?.client?.id === cliente.id) && (
                                      <div className="pt-1 border-t border-blue-100">
                                        {ucState.status === "done" ? (
                                          <div className="flex items-start gap-2 text-emerald-600">
                                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                            <div>
                                              <p className="text-[11px] font-medium">Card atualizado</p>
                                              {ucState.resumo && (
                                                <div className="mt-1 flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-1.5">
                                                  <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                                  <span className="leading-relaxed">{ucState.resumo}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : ucState.status === "loading" ? (
                                          <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Gerando resumo com IA...
                                          </div>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                              const pid = state.status === "done"
                                                ? (selectedProcess[key] || linkedInfo?.processId || "")
                                                : (linkedInfo?.processId ?? "");
                                              if (pid) atualizarCard(pub, cliente.id, pid);
                                            }}
                                            className="gap-1.5 text-xs w-full justify-start border border-gray-200 text-gray-600 hover:bg-gray-100"
                                          >
                                            <RefreshCw className="h-3 w-3" />
                                            Atualizar card com resumo
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {pub.clientesVinculaveis.length === 0 && pub.cpfsEncontrados.length > 0 && (
                          <p className="text-[11px] text-gray-400 italic">
                            CPF(s) encontrado(s) na publicação, mas não correspondem a nenhum cliente cadastrado.
                          </p>
                        )}

                        {/* ── Vínculo manual + atualizar card do vínculo já existente ── */}
                        <div className="space-y-3 pt-1 border-t border-gray-200">

                          {/* Se já vinculado anteriormente, mostra info + botão atualizar card */}
                          {linkedInfo && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="text-xs font-semibold text-gray-800">
                                    {linkedInfo.client?.name ?? "Cliente vinculado"}
                                  </p>
                                  <p className="text-[10px] text-gray-400">
                                    {linkedInfo.processNumber && linkedInfo.processNumber !== "(a definir)"
                                      ? linkedInfo.processNumber
                                      : "Sem número"}
                                    {linkedInfo.processTitle ? ` · ${linkedInfo.processTitle}` : ""}
                                  </p>
                                </div>
                              </div>

                              {linkedInfo.client && (() => {
                                const ucKey = updateCardKey(pub.comunicaId, linkedInfo.client!.id);
                                const ucState = updateCardState[ucKey] ?? { status: "idle" };
                                return ucState.status === "done" ? (
                                  <div className="flex items-start gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-[11px] font-medium">Card atualizado</p>
                                      {ucState.resumo && (
                                        <div className="mt-1 flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-1.5">
                                          <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                          <span className="leading-relaxed">{ucState.resumo}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : ucState.status === "loading" ? (
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Gerando resumo com IA...
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => atualizarCard(pub, linkedInfo.client!.id, linkedInfo.processId)}
                                    className="gap-1.5 text-xs w-full justify-start border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                    Atualizar card com resumo
                                  </Button>
                                );
                              })()}
                            </div>
                          )}

                          {/* Vínculo manual */}
                          {manualState.status === "done" ? (
                            <div className="flex items-start gap-2 text-emerald-600">
                              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-medium">Vinculado manualmente com sucesso</p>
                                {manualState.resumo && (
                                  <div className="mt-1 flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-1.5">
                                    <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                    <span className="leading-relaxed">{manualState.resumo}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : manualState.status === "loading" ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Vinculando e processando com IA...
                            </div>
                          ) : manualState.status === "selecting" ? (
                            <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                              <p className="text-[10px] font-semibold text-gray-600">Vincular a um cliente</p>

                              {/* Busca de cliente */}
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                  value={clientSearch[pub.comunicaId] ?? ""}
                                  onChange={e => setClientSearch(prev => ({ ...prev, [pub.comunicaId]: e.target.value }))}
                                  placeholder="Buscar cliente por nome ou CPF..."
                                  className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
                                />
                              </div>

                              {clientsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando clientes...
                                </div>
                              ) : (
                                <select
                                  value={manualClient[pub.comunicaId] ?? ""}
                                  onChange={e => setManualClient(prev => ({ ...prev, [pub.comunicaId]: e.target.value }))}
                                  size={Math.min(5, filteredClients(pub.comunicaId).length + 1)}
                                  className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
                                >
                                  <option value="">-- Selecione o cliente --</option>
                                  {filteredClients(pub.comunicaId).map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}{c.cpf ? ` · ${c.cpf}` : ""}
                                    </option>
                                  ))}
                                </select>
                              )}

                              <select
                                value={manualProcess[pub.comunicaId] ?? ""}
                                onChange={e => setManualProcess(prev => ({ ...prev, [pub.comunicaId]: e.target.value }))}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
                              >
                                <option value="">-- Selecione o processo --</option>
                                {processos.map(p => (
                                  <option key={p.id} value={p.id}>{processLabel(p)}</option>
                                ))}
                              </select>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={!manualClient[pub.comunicaId] || !manualProcess[pub.comunicaId]}
                                  onClick={() => vincularManual(pub)}
                                  className="gap-1.5 text-xs flex-1 bg-violet-600 hover:bg-violet-700"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setManualLinkState(prev => ({ ...prev, [pub.comunicaId]: { status: "idle" } }))}
                                  className="text-xs"
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startManualLink(pub.comunicaId)}
                              className="gap-1.5 text-xs w-full justify-start border border-violet-200 text-violet-700 hover:bg-violet-50"
                            >
                              <UserPlus className="h-3 w-3" />
                              Vincular a um cliente
                            </Button>
                          )}
                        </div>
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
