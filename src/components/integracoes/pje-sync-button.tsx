"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SyncResult {
  processed: number;
  deadlinesCreated: number;
  notificationsCreated: number;
  errors: string[];
}

interface Props {
  organizationId: string;
}

export function PJeSyncButton({ organizationId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/pje/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail ?? data.error ?? "Erro desconhecido");
        return;
      }

      setResult(data);
    } catch {
      setError("Falha na requisição. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <Button
        size="sm"
        onClick={handleSync}
        disabled={loading}
        className="gap-1.5"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sincronizando..." : "Sincronizar agora"}
      </Button>

      {result && (
        <div className="flex items-start gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 max-w-xs">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {result.processed} comunicação(ões) processada(s) —{" "}
            {result.deadlinesCreated > 0 && <span>Sincronização concluída</span>}
            {result.errors.length > 0 && `, ${result.errors.length} erro(s)`}
          </span>
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
