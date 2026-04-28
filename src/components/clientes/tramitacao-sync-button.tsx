"use client";

import { useState } from "react";
import { Send, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  clientId: string;
  organizationId: string;
  syncStatus?: string | null;
  tramitacaoCustomerId?: number | null;
  syncTrello?: boolean;
}

export function TramitacaoSyncButton({
  clientId,
  organizationId,
  syncStatus: initialStatus,
  tramitacaoCustomerId: initialTiId,
  syncTrello = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(initialStatus ?? null);
  const [tiId, setTiId] = useState(initialTiId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    total: number;
  } | null>(null);

  const isSynced = status === "Sincronizado";

  async function handleSync() {
    setLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/tramitacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, syncTrello }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro desconhecido");
        setStatus("Erro");
        return;
      }
      setStatus("Sincronizado");
      setTiId(data.tramitacaoCustomerId ?? null);
      if (data.totalTIProcesses !== undefined) {
        setImportResult({
          imported: data.processesImported ?? 0,
          updated: data.processesUpdated ?? 0,
          total: data.totalTIProcesses ?? 0,
        });
        // Recarrega para mostrar os processos novos
        if ((data.processesImported ?? 0) > 0 || (data.processesUpdated ?? 0) > 0) {
          setTimeout(() => window.location.reload(), 1200);
        }
      }
    } catch {
      setError("Falha na requisição.");
      setStatus("Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={isSynced ? "outline" : "default"}
          onClick={handleSync}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : isSynced ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {loading ? "Sincronizando..." : isSynced ? "Sincronizar novamente" : "Enviar para TI"}
        </Button>

        {isSynced && (
          <Badge variant="success" className="gap-1 text-[11px]">
            <CheckCircle2 className="h-3 w-3" /> Sincronizado
          </Badge>
        )}
        {status === "Erro" && !loading && (
          <Badge variant="destructive" className="gap-1 text-[11px]">
            <AlertCircle className="h-3 w-3" /> Erro
          </Badge>
        )}
      </div>

      {importResult && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
          <Download className="h-3 w-3" />
          {importResult.total === 0
            ? "Nenhum processo encontrado na TI."
            : importResult.imported > 0 || importResult.updated > 0
              ? `${importResult.imported > 0 ? `${importResult.imported} processo(s) importado(s)` : ""}${importResult.imported > 0 && importResult.updated > 0 ? ", " : ""}${importResult.updated > 0 ? `${importResult.updated} atualizado(s)` : ""} da Tramitação Inteligente.`
              : `${importResult.total} processo(s) já sincronizado(s).`}
        </div>
      )}

      {isSynced && tiId && (
        <a
          href={`https://planilha.tramitacaointeligente.com.br/clientes/${tiId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Ver na Tramitação Inteligente
        </a>
      )}

      {error && (
        <p className="text-[11px] text-red-600">{error}</p>
      )}
    </div>
  );
}
