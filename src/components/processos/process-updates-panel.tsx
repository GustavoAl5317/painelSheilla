"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Plus, Loader2, MessageSquare, Send, BellOff, Bell,
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
}

const sourceLabel: Record<string, { label: string; color: string }> = {
  COMMENT: { label: "Advogado", color: "text-blue-600 bg-blue-50" },
  DJEN: { label: "DJEN", color: "text-violet-600 bg-violet-50" },
  PJE: { label: "PJe", color: "text-emerald-600 bg-emerald-50" },
  SYSTEM: { label: "Sistema", color: "text-gray-500 bg-gray-100" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ProcessUpdatesPanel({ processId, processNumber }: Props) {
  const hasNumber = Boolean(processNumber && processNumber !== "(a definir)");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [sendUpdates, setSendUpdates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [shareWithClient, setShareWithClient] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/processes/${processId}/updates`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setSendUpdates(data.sendUpdates ?? true);
    }
    setLoading(false);
  }, [processId]);

  useEffect(() => { load(); }, [load]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base">Atualizações do processo</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {hasNumber && (
                <button
                  onClick={toggleSendUpdates}
                  disabled={toggling}
                  title={sendUpdates ? "Desativar envio ao cliente" : "Ativar envio ao cliente"}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
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
              )}
              {hasNumber && (
                <Button size="sm" variant="ghost" onClick={() => setModalOpen(true)} className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Nova atualização
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {!hasNumber ? (
            <div className="py-6 text-center space-y-1">
              <p className="text-sm text-amber-600 font-medium">Número do processo não vinculado</p>
              <p className="text-xs text-gray-400">
                Edite o processo e adicione o número para ativar o monitoramento e as atualizações.
              </p>
            </div>
          ) : loading ? (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 py-4">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando atualizações...
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              Nenhuma atualização ainda. O DJEN alimentará este campo automaticamente.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const src = sourceLabel[entry.source] ?? { label: entry.source, color: "text-gray-500 bg-gray-100" };
                return (
                  <div key={entry.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", src.color)}>
                        {src.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                      {entry.content}
                    </p>
                    {entry.source === "COMMENT" && (
                      <div className="flex items-center gap-1 mt-2">
                        <MessageSquare className="h-3 w-3 text-gray-300" />
                        <span className="text-[10px] text-gray-400">
                          {entry.shareWithClient ? "Enviado ao cliente via WhatsApp" : "Interno"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setSubmitErr(null); }} title="Nova atualização">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Texto da atualização</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={5}
              placeholder="Descreva a atualização do processo..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shareWithClient}
              onChange={e => setShareWithClient(e.target.checked)}
              className="rounded"
            />
            <Send className="h-3.5 w-3.5 text-green-500" />
            Enviar resumo da atualização ao cliente via WhatsApp (IA)
          </label>

          {submitErr && <p className="text-xs text-red-600">{submitErr}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={submitting || !comment.trim()} onClick={submitComment} className="gap-1.5">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Salvar atualização
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
