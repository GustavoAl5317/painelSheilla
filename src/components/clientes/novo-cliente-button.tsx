"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { isValidCpf, normalizeCpfDigits } from "@/lib/utils";

interface Props { organizationId: string; }

export function NovoClienteButton({ organizationId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", cpf: "", address: "", notes: "" });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const cpfOk = isValidCpf(normalizeCpfDigits(form.cpf));
  const canSubmit = form.name.trim().length > 0 && cpfOk;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Informe o nome e um CPF válido (11 dígitos).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar cliente");
        return;
      }
      setOpen(false);
      setForm({ name: "", phone: "", email: "", cpf: "", address: "", notes: "" });
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
        <Plus className="h-4 w-4" /> Novo Cliente
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Novo Cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo *</Label>
            <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: João da Silva" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF (obrigatório)</Label>
              <Input
                id="cpf"
                value={form.cpf}
                onChange={e => set("cpf", e.target.value)}
                placeholder="000.000.000-00"
                className={form.cpf && !cpfOk ? "border-red-300" : undefined}
                autoComplete="off"
              />
              {form.cpf && !cpfOk && (
                <p className="text-[11px] text-amber-700">Digite um CPF válido com 11 dígitos.</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="cliente@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={form.address} onChange={e => set("address", e.target.value)} placeholder="Rua, número — Cidade/UF" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Anotações sobre o cliente..."
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={loading || !canSubmit}>
              {loading ? "Salvando..." : "Criar Cliente"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
