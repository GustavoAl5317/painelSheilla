"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SyncResult {
  synced?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  processesLinked?: number;
  tramitacaoProcessesImported?: number;
  errors?: string[];
}

type ResultFormat = "synced" | "created-updated-skipped";

interface Props {
  label: string;
  endpoint: string;
  organizationId: string;
  resultFormat?: ResultFormat;
}

export function SyncButton({ label, endpoint, organizationId, resultFormat = "synced" }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro desconhecido"); return; }
      setResult(data);
    } catch {
      setError("Falha na requisição.");
    } finally {
      setLoading(false);
    }
  }

  const successText = result
    ? resultFormat === "created-updated-skipped"
      ? (() => {
          const parts = [
            `${result.created ?? 0} criado(s)`,
            `${result.updated ?? 0} atualizado(s)`,
            `${result.skipped ?? 0} sem CPF ignorado(s)`,
          ];
          const djen = result.processesLinked ?? 0;
          const tiApi = result.tramitacaoProcessesImported ?? 0;
          if (djen > 0) parts.push(`${djen} processo(s) via DJEN`);
          if (tiApi > 0) parts.push(`${tiApi} processo(s) via Tramitação`);
          return parts.join(", ");
        })()
      : `${result.synced ?? 0} item(ns) sincronizado(s)${result.errors?.length ? `, ${result.errors.length} aviso(s)` : ""}`
    : "";

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <Button size="sm" onClick={handleSync} disabled={loading} className="gap-1.5">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sincronizando..." : label}
      </Button>
      {result && (
        <div className="flex flex-col gap-1.5 max-w-xs text-left">
          <div className="flex items-start gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{successText}</span>
          </div>
          {result.errors && result.errors.length > 0 && (
            <ul className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 list-disc list-inside space-y-0.5">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {result.errors.length > 5 && <li>...e mais {result.errors.length - 5} erro(s)</li>}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
