"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Hash } from "lucide-react";

export function OperatorKeywordForm({ initialKeyword }: { initialKeyword?: string | null }) {
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/ai-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorKeyword: keyword.trim() || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">Palavra-chave para assumir atendimento</p>
        <p className="text-xs text-gray-400 mb-2">
          Use <span className="font-mono bg-gray-100 px-1 rounded">#</span> para pausar a IA e <span className="font-mono bg-gray-100 px-1 rounded">.</span> para reativar. Outras mensagens são enviadas normalmente sem afetar a IA.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: minha-interação"
              className="flex w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="shrink-0"
            style={{ backgroundColor: "#95304e" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? "Salvo!" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 space-y-1">
        <p className="text-xs font-semibold text-indigo-700">Comandos disponíveis no WhatsApp</p>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-indigo-600"><span className="font-mono font-bold">#</span> — Pausa a IA</p>
          <p className="text-xs text-indigo-600"><span className="font-mono font-bold">.</span> — Reativa a IA (não enviado ao cliente)</p>
          <p className="text-xs text-indigo-600">Outras mensagens são enviadas normalmente sem alterar a IA.</p>
          {keyword.trim() && (
            <p className="text-xs text-indigo-600">
              <span className="font-mono font-bold">{keyword.trim()}</span> — Para a IA (sua palavra-chave)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
