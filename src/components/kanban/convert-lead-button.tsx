"use client";
import { useState, useEffect } from "react";
import { UserCheck, Loader2, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidCpf, normalizeCpfDigits } from "@/lib/utils";

interface Props {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  organizationId: string;
  /** Abre o modal automaticamente (usado quando acionado pelo drag-and-drop) */
  autoOpen?: boolean;
  /** Chamado após conversão bem-sucedida */
  onConverted?: () => void;
  /** Chamado quando o usuário cancela (só relevante com autoOpen) */
  onCancel?: () => void;
}

export function ConvertLeadButton({
  leadId, leadName, leadPhone, leadEmail, organizationId,
  autoOpen = false, onConverted, onCancel,
}: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProcess, setShowProcess] = useState(false);
  const [form, setForm] = useState({
    name: leadName,
    phone: leadPhone ?? "",
    email: leadEmail ?? "",
    cpf: "",
    notes: "",
    processNumber: "",
    processTitle: "",
    processArea: "",
    processCourt: "",
  });

  // Se autoOpen mudar para true depois da montagem (re-render), abre o modal
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const cpfOk = isValidCpf(normalizeCpfDigits(form.cpf));
  const canSubmit = form.name.trim().length > 0 && cpfOk;

  function handleClose() {
    setOpen(false);
    onCancel?.();
  }

  const handleConvert = async () => {
    setError(null);
    if (!canSubmit) {
      setError("Informe o nome e um CPF válido (11 dígitos).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, organizationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setOpen(false);
        onConverted?.();
      } else {
        setError(data.error ?? "Não foi possível converter.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Modo inline no card do kanban (não autoOpen): mostra badge se já convertido
  if (!autoOpen && done) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
        <UserCheck className="h-3 w-3" /> Convertido
      </span>
    );
  }

  return (
    <>
      {/* Botão visível só no modo card normal (não autoOpen) */}
      {!autoOpen && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          title="Converter para cliente"
          className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
        >
          <UserCheck className="h-3 w-3" />
          Converter
        </button>
      )}

      <Modal open={open} onClose={handleClose} title="Converter Lead em Cliente">
        <div className="space-y-4">
          {autoOpen && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
              <UserCheck className="h-4 w-4 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-700 font-medium">
                Arrastado para <strong>Cliente Fechado</strong>. Preencha os dados para converter.
              </p>
            </div>
          )}

          <p className="text-sm text-gray-500">
            {autoOpen
              ? "O CPF é obrigatório. Os demais campos já estão preenchidos com os dados do lead."
              : "Confirme os dados. O CPF é obrigatório para virar cliente."}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF <span className="text-red-500">*</span></Label>
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                className={form.cpf && !cpfOk ? "border-red-300" : undefined}
                autoComplete="off"
                autoFocus={autoOpen}
              />
              {form.cpf && !cpfOk && (
                <p className="text-[11px] text-amber-700">Digite um CPF válido com 11 dígitos.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setShowProcess(v => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4" />
                Vincular processo ao cartão (opcional)
              </span>
              {showProcess ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showProcess && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500">
                  Se informado, o processo já sai vinculado ao cartão e o DJEN/PJe passam a alimentá-lo automaticamente.
                </p>
                <div className="space-y-1.5">
                  <Label>Número do processo</Label>
                  <Input
                    placeholder="0000000-00.0000.0.00.0000"
                    value={form.processNumber}
                    onChange={(e) => setForm((f) => ({ ...f, processNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Título / Tipo (opcional)</Label>
                  <Input
                    placeholder="Ex: Ação trabalhista, Divórcio…"
                    value={form.processTitle}
                    onChange={(e) => setForm((f) => ({ ...f, processTitle: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Área jurídica</Label>
                    <Input
                      placeholder="Trabalhista…"
                      value={form.processArea}
                      onChange={(e) => setForm((f) => ({ ...f, processArea: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tribunal</Label>
                    <Input
                      placeholder="TRT-15, TJSP…"
                      value={form.processCourt}
                      onChange={(e) => setForm((f) => ({ ...f, processCourt: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleConvert} disabled={loading || !canSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Converter para Cliente"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
