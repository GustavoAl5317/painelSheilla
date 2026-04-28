"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  LayoutList, Loader2, Save, MessageSquare, Send,
  Search, Bell, BellOff, Plus, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  source: "COMMENT" | "DJEN" | "PJE" | "SYSTEM";
  content: string;
  shareWithClient: boolean;
  createdAt: string;
};

interface Props {
  processId: string;
  processNumber: string | null;
  clientId: string | null;
  lastDjenSearchAt: string | null;
}

const sourceStyle: Record<string, { label: string; color: string }> = {
  COMMENT: { label: "Advogado", color: "text-blue-600 bg-blue-50" },
  DJEN:    { label: "DJEN",     color: "text-violet-600 bg-violet-50" },
  PJE:     { label: "PJe",      color: "text-emerald-600 bg-emerald-50" },
  SYSTEM:  { label: "Sistema",  color: "text-gray-500 bg-gray-100" },
};

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ProcessCrmCard({ processId, processNumber, clientId, lastDjenSearchAt }: Props) {
  const hasNumber = Boolean(processNumber && processNumber !== "(a definir)");

  /* ── estado de entradas ── */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sendUpdates, setSendUpdates] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);

  /* ── estado de busca DJEN ── */
  const [searching, setSearching] = useState(false);
  const [djenMsg, setDjenMsg] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(null);
  const [lastSearch, setLastSearch] = useState<string | null>(lastDjenSearchAt);

  /* ── estado de comentário ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [shareWithClient, setShareWithClient] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  /* ── toggle envio ── */
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoadingEntries(true);
    const res = await fetch(`/api/processes/${processId}/updates`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setSendUpdates(data.sendUpdates ?? true);
    }
    setLoadingEntries(false);
  }, [processId]);

  useEffect(() => { load(); }, [load]);

  async function searchDjen() {
    setSearching(true);
    setDjenMsg(null);
    try {
      const res = await fetch(`/api/processes/${processId}/djen-search`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDjenMsg({ type: "err", text: data.error ?? "Erro ao pesquisar no DJEN." });
        return;
      }
      setDjenMsg({
        type: data.newCount > 0 ? "ok" : "warn",
        text: data.message,
      });
      setLastSearch(new Date().toISOString());
      if (data.newCount > 0) await load();
    } finally {
      setSearching(false);
    }
  }

  async function toggleSendUpdates() {
    setToggling(true);
    const next = !sendUpdates;
    await fetch(`/api/processes/${processId}/updates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendUpdates: next }),
    });
    setSendUpdates(next);
    setToggling(false);
  }

  async function submitComment() {
    if (!comment.trim()) return;
    setSubmitting(true);
    setSubmitErr(null);
    const res = await fetch(`/api/processes/${processId}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: comment.trim(), shareWithClient }),
    });
    if (!res.ok) {
      const data = await res.json();
      setSubmitErr(data.error ?? "Erro ao salvar");
      setSubmitting(false);
      return;
    }
    setComment("");
    setShareWithClient(false);
    setModalOpen(false);
    setSubmitting(false);
    await load();
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-base">Card do processo</CardTitle>
              {!clientId && (
                <Badge variant="secondary" className="text-[10px]">Sem cliente vinculado</Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* toggle envio ao cliente */}
              <button
                onClick={toggleSendUpdates}
                disabled={toggling || !hasNumber}
                title={sendUpdates ? "Desativar envio ao cliente" : "Ativar envio ao cliente"}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40",
                  sendUpdates
                    ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                )}
              >
                {toggling
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : sendUpdates
                    ? <Bell className="h-3 w-3" />
                    : <BellOff className="h-3 w-3" />}
                {sendUpdates ? "Envio ativo" : "Envio pausado"}
              </button>

              {/* nova anotação */}
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(true)} className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Anotação
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">

          {/* ── Botão Pesquisar no DJEN ── */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-violet-800">Pesquisar no DJEN</p>
                {lastSearch ? (
                  <p className="text-[11px] text-violet-500 mt-0.5">
                    Última busca: {fmtDt(lastSearch)}
                  </p>
                ) : (
                  <p className="text-[11px] text-violet-400 mt-0.5">Nenhuma busca realizada ainda</p>
                )}
              </div>
              <Button
                size="sm"
                onClick={searchDjen}
                disabled={searching || !hasNumber}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              >
                {searching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Search className="h-3.5 w-3.5" />}
                {searching ? "Pesquisando..." : "Pesquisar"}
              </Button>
            </div>

            {!hasNumber && (
              <p className="text-xs text-amber-600 font-medium">
                Defina o número do processo para habilitar a busca no DJEN.
              </p>
            )}

            {djenMsg && (
              <div className={cn(
                "rounded-lg px-3 py-2 text-xs font-medium flex items-start gap-2",
                djenMsg.type === "ok"   && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                djenMsg.type === "warn" && "bg-amber-50 text-amber-700 border border-amber-200",
                djenMsg.type === "err"  && "bg-red-50 text-red-700 border border-red-200",
              )}>
                <RefreshCw className="h-3 w-3 mt-0.5 shrink-0" />
                {djenMsg.text}
              </div>
            )}
          </div>

          {/* ── Timeline de atualizações ── */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Histórico de atualizações</p>

            {loadingEntries ? (
              <p className="text-xs text-gray-400 flex items-center gap-1.5 py-4">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
              </p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Nenhuma atualização ainda. Use o botão acima para buscar no DJEN ou adicione uma anotação.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {entries.map(e => {
                  const src = sourceStyle[e.source] ?? { label: e.source, color: "text-gray-500 bg-gray-100" };
                  return (
                    <div key={e.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", src.color)}>
                          {src.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{fmtDt(e.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                        {e.content}
                      </p>
                      {e.source === "COMMENT" && (
                        <div className="flex items-center gap-1 mt-2">
                          <MessageSquare className="h-3 w-3 text-gray-300" />
                          <span className="text-[10px] text-gray-400">
                            {e.shareWithClient ? "Enviado ao cliente via WhatsApp" : "Interno"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Modal de nova anotação ── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSubmitErr(null); }}
        title="Nova anotação"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Anotação</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={5}
              placeholder="Descreva a atualização, decisão, orientação..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
            />
          </div>

          {clientId && (
            <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shareWithClient}
                onChange={e => setShareWithClient(e.target.checked)}
                className="rounded"
              />
              <Send className="h-3.5 w-3.5 text-green-500" />
              Enviar resumo ao cliente via WhatsApp (IA)
            </label>
          )}

          {submitErr && <p className="text-xs text-red-600">{submitErr}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={submitting || !comment.trim()}
              onClick={submitComment}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
