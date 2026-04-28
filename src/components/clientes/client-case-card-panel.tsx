"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LayoutList, Loader2, Save, MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

type Entry = {
  id: string;
  source: string;
  content: string;
  shareWithClient: boolean;
  createdAt: string;
};

interface Props {
  clientId: string;
  initialProcessNumber?: string | null;
  initialNotes?: string | null;
}

const sourceLabel: Record<string, string> = {
  COMMENT: "Comentário",
  DJEN: "DJEN",
  PJE: "PJe",
  SYSTEM: "Sistema",
};

export function ClientCaseCardPanel({ clientId, initialProcessNumber, initialNotes }: Props) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [processNumber, setProcessNumber] = useState(initialProcessNumber ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [shareWithClient, setShareWithClient] = useState(false);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const loadEntries = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/case-card`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.card?.entries ?? []);
    }
    setLoadingEntries(false);
  }, [clientId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function save() {
    setSaving(true);
    setErr(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processNumber, notes, shareWithClient }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Erro ao salvar");
        return;
      }
      setSuccess(true);
      setShareWithClient(false);
      await loadEntries();
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-violet-500" />
          <CardTitle className="text-base">Card do processo</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="space-y-1.5">
          <Label>Número do processo</Label>
          <input
            type="text"
            value={processNumber}
            onChange={e => setProcessNumber(e.target.value)}
            placeholder="Ex: 1234567-89.2024.8.26.0100"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
          <p className="text-xs text-gray-400">Ao salvar, o processo será monitorado automaticamente pelo DJEN.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Informações do advogado</Label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder="Status do caso, orientações, observações..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shareWithClient}
            onChange={e => setShareWithClient(e.target.checked)}
          />
          <MessageSquare className="h-3.5 w-3.5 text-green-500" />
          Notificar cliente por WhatsApp com resumo das informações acima (via IA)
        </label>

        <Button onClick={save} disabled={saving} size="sm" className="gap-1.5 w-full">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>

        {success && <p className="text-sm text-emerald-600">Salvo com sucesso.</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}

        {/* Linha do tempo */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Histórico de atualizações</p>
          {loadingEntries ? (
            <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Carregando...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma atualização ainda.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {entries.map(e => (
                <div key={e.id} className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400 mb-1">
                    <span className="font-medium text-violet-600">{sourceLabel[e.source] ?? e.source}</span>
                    <span>{formatDateTime(e.createdAt)}</span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap break-words text-[13px]">{e.content}</p>
                  {e.source === "COMMENT" && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {e.shareWithClient ? "Enviado ao cliente" : "Interno"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
