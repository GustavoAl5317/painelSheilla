"use client";

import { useState } from "react";
import { Columns, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  organizationId: string;
  trelloCardUrl?: string | null;
}

export function TrelloSyncButton({ clientId, trelloCardUrl: initialUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trelloUrl, setTrelloUrl] = useState<string | null>(initialUrl ?? null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/trello`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao sincronizar com Trello");
      }
      setTrelloUrl(data.shortUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={loading}
          className={cn(
            "gap-2 text-xs font-semibold h-9 px-4 transition-all",
            trelloUrl ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : trelloUrl ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Columns className="h-4 w-4" />
          )}
          {trelloUrl ? "Atualizar no Trello" : "Enviar para o Trello"}
        </Button>

        {trelloUrl && (
          <a
            href={trelloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            Ver cartão
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      
      {error && (
        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
          <span className="text-base leading-none">⚠️</span> {error}
        </p>
      )}
    </div>
  );
}
