"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

interface Props {
  organizationId: string;
  clients: { id: string; name: string }[];
}

const LEGAL_AREAS = [
  "Direito Trabalhista", "Direito de Família", "Direito Civil",
  "Direito Criminal", "Direito Previdenciário", "Direito Tributário",
  "Direito Empresarial", "Direito Imobiliário", "Direito do Consumidor",
];

export function NovoProcessoButton({ organizationId, clients }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    number: "", title: "", court: "", legalArea: "", clientId: "", observations: "",
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.number.trim() || !form.clientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar processo");
        return;
      }
      setOpen(false);
      setForm({ number: "", title: "", court: "", legalArea: "", clientId: "", observations: "" });
      window.location.reload();
    } catch {
      setError("Falha na requisição.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Novo Processo
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Novo Processo">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="number">Número do processo *</Label>
            <Input
              id="number" value={form.number} onChange={e => set("number", e.target.value)}
              placeholder="0000000-00.0000.0.00.0000" required
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientId">Cliente *</Label>
            <select
              id="clientId" value={form.clientId} onChange={e => set("clientId", e.target.value)} required
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um cliente...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Título / Assunto</Label>
            <Input id="title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ex: Reclamação Trabalhista" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="court">Tribunal / Vara</Label>
              <Input id="court" value={form.court} onChange={e => set("court", e.target.value)} placeholder="Ex: TRT 2ª Região" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legalArea">Área Jurídica</Label>
              <select
                id="legalArea" value={form.legalArea} onChange={e => set("legalArea", e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {LEGAL_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observations">Observações</Label>
            <textarea
              id="observations" value={form.observations} onChange={e => set("observations", e.target.value)}
              placeholder="Detalhes adicionais do processo..." rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={loading || !form.number.trim() || !form.clientId}>
              {loading ? "Salvando..." : "Criar Processo"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
