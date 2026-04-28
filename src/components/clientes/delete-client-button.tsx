"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Props {
  clientId: string;
  clientName: string;
}

export function DeleteClientButton({ clientId, clientName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push("/clientes");
        router.refresh();
      } else {
        setError(data.error ?? "Não foi possível excluir.");
        setLoading(false);
      }
    } catch {
      setError("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir cliente
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Excluir cliente">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Tem certeza que deseja excluir <strong>{clientName}</strong>? Todos os processos,
            o cartão de acompanhamento deste cliente serão removidos permanentemente.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir permanentemente"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
