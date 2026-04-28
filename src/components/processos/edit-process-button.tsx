"use client";

import { useState } from "react";
import { Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

interface Props {
  process: {
    id: string;
    number: string | null;
    title: string | null;
    court: string | null;
    legalArea: string | null;
    status: string;
    observations: string | null;
  };
}

const LEGAL_AREAS = [
  "Direito Trabalhista", "Direito de Família", "Direito Civil",
  "Direito Criminal", "Direito Previdenciário", "Direito Tributário",
  "Direito Empresarial", "Direito Imobiliário", "Direito do Consumidor",
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "ARCHIVED", label: "Arquivado" },
  { value: "CONCLUDED", label: "Concluído" },
];

export function EditProcessButton({ process }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    number: process.number === "(a definir)" ? "" : (process.number ?? ""),
    title: process.title ?? "",
    court: process.court ?? "",
    legalArea: process.legalArea ?? "",
    status: process.status,
    observations: process.observations ?? "",
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao atualizar processo");
        return;
      }
      setOpen(false);
      window.location.reload();
    } catch {
      setError("Falha na requisição.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="h-8 w-8 text-gray-400 hover:text-blue-600">
        <Edit2 className="h-4 w-4" />
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar Processo">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="number">Número do processo</Label>
            <Input
              id="number" value={form.number} onChange={e => set("number", e.target.value)}
              placeholder="0000000-00.0000.0.00.0000"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status" value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
