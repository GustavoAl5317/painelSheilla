"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

interface Props {
  organizationId: string;
  createdById: string;
}

export function NovaTarefaButton({ organizationId, createdById }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", priority: "MEDIUM", dueDate: "",
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          createdById,
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar tarefa");
        return;
      }
      setOpen(false);
      setForm({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
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
        <Plus className="h-4 w-4" /> Nova Tarefa
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova Tarefa">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ex: Protocolar recurso" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <textarea
              id="description" value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Detalhes da tarefa..." rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="priority">Prioridade</Label>
              <select
                id="priority" value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Vencimento</Label>
              <Input id="dueDate" type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={loading || !form.title.trim()}>
              {loading ? "Salvando..." : "Criar Tarefa"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
