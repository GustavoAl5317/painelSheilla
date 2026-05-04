"use client";
import { useState } from "react";
import { Plus, Bot, Star, StarOff, Pencil, Trash2, Lock, Check, X, Copy, BrainCircuit, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromptsPageProps {
  initialTemplates: PromptTemplate[];
}

const EMPTY_FORM = { name: "", description: "", content: "" };

const PRIORITY_COLORS: Record<string, string> = {
  system: "bg-blue-50 border-blue-200 text-blue-700",
  custom: "bg-purple-50 border-purple-200 text-purple-700",
};

export function PromptsPage({ initialTemplates }: PromptsPageProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PromptTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<PromptTemplate | null>(initialTemplates[0] ?? null);
  const [copied, setCopied] = useState(false);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(t: PromptTemplate) {
    setEditTarget(t);
    setForm({ name: t.name, description: t.description ?? "", content: t.content });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);

    if (editTarget) {
      const res = await fetch(`/api/prompts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, content: form.content }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (selected?.id === updated.id) setSelected(updated);
        toast.success("Modelo atualizado");
        closeModal();
      }
    } else {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, content: form.content }),
      });
      if (res.ok) {
        const created = await res.json();
        setTemplates((prev) => [...prev, created]);
        setSelected(created);
        toast.success("Modelo criado");
        closeModal();
      }
    }
    setSaving(false);
  }

  async function handleSetDefault(id: string) {
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) => ({ ...t, isDefault: t.id === id })));
      toast.success("Modelo padrão definido");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    setDeleting(id);
    const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    if (res.ok) {
      const next = templates.filter((t) => t.id !== id);
      setTemplates(next);
      if (selected?.id === id) setSelected(next[0] ?? null);
      toast.success("Modelo excluído");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao excluir");
    }
    setDeleting(null);
  }

  async function handleCopy() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const systemTemplates = templates.filter((t) => t.isSystem);
  const customTemplates = templates.filter((t) => !t.isSystem);

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Modelos de Prompt</h1>
            <p className="text-xs text-gray-500">Configure como a IA deve se comportar nas conversas</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Novo modelo
        </Button>
      </div>

      {/* Layout dois painéis */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: "calc(100vh - 220px)" }}>
        {/* Painel esquerdo — lista */}
        <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
          {/* Seção: Sistema */}
          {systemTemplates.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 px-2 mb-2">
                <Lock className="h-3 w-3 text-gray-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Sistema</span>
              </div>
              <div className="space-y-1">
                {systemTemplates.map((t) => (
                  <TemplateListItem
                    key={t.id}
                    template={t}
                    active={selected?.id === t.id}
                    onClick={() => setSelected(t)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Seção: Personalizados */}
          <div>
            <div className="flex items-center gap-1.5 px-2 mb-2">
              <Bot className="h-3 w-3 text-gray-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Personalizados</span>
            </div>
            {customTemplates.length === 0 ? (
              <button
                onClick={openCreate}
                className="w-full flex items-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar modelo personalizado
              </button>
            ) : (
              <div className="space-y-1">
                {customTemplates.map((t) => (
                  <TemplateListItem
                    key={t.id}
                    template={t}
                    active={selected?.id === t.id}
                    onClick={() => setSelected(t)}
                    onDelete={() => handleDelete(t.id)}
                    deleting={deleting === t.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-100 shrink-0" />

        {/* Painel direito — detalhe */}
        {selected ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header do detalhe */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-start gap-3 min-w-0">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  selected.isSystem ? "bg-blue-100" : "bg-purple-100"
                )}>
                  {selected.isSystem
                    ? <Bot className="h-5 w-5 text-blue-600" />
                    : <Pencil className="h-5 w-5 text-purple-600" />
                  }
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900 leading-tight">{selected.name}</h2>
                    {selected.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                        Em uso
                      </span>
                    )}
                    {selected.isSystem && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                        <Lock className="h-2.5 w-2.5" />
                        Sistema
                      </span>
                    )}
                  </div>
                  {selected.description && (
                    <p className="text-sm text-gray-500 mt-0.5 leading-snug">{selected.description}</p>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!selected.isDefault && (
                  <button
                    onClick={() => handleSetDefault(selected.id)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-amber-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                  >
                    <StarOff className="h-3.5 w-3.5" />
                    Usar como padrão
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
                <button
                  onClick={() => openEdit(selected)}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                {!selected.isSystem && (
                  <button
                    onClick={() => handleDelete(selected.id)}
                    disabled={deleting === selected.id}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-red-500 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo do prompt */}
            <div className="flex-1 overflow-y-auto mt-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Conteúdo do prompt</span>
                  <span className="text-[11px] text-gray-400">{selected.content.length} caracteres</span>
                </div>
                <pre className="p-4 text-sm text-gray-700 font-mono whitespace-pre-wrap break-words leading-relaxed">
                  {selected.content}
                </pre>
              </div>

              {/* Dica */}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                <BrainCircuit className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Use <code className="bg-blue-100 px-1 rounded font-mono">[TRANSFERIR_PARA_HUMANO]</code> no prompt para acionar transferência automática ao advogado quando o cliente solicitar.
                  {selected.isDefault
                    ? " Este é o modelo atualmente em uso pelo assistente."
                    : " Para ativar este modelo, clique em \"Usar como padrão\"."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="space-y-2">
              <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-gray-100">
                <BrainCircuit className="h-7 w-7 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">Selecione um modelo</p>
              <p className="text-xs text-gray-400">Escolha um modelo à esquerda para ver os detalhes</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editTarget ? "Editar modelo" : "Novo modelo de prompt"}
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              placeholder="Ex: Atendimento Trabalhista"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Input
              placeholder="Descreva quando usar este modelo..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conteúdo do prompt *</Label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[260px] leading-relaxed"
              placeholder="Você é um assistente jurídico..."
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
            <p className="text-[11px] text-gray-400">
              Use <code className="bg-gray-100 px-1 rounded">[TRANSFERIR_PARA_HUMANO]</code> para acionar transferência ao advogado.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={closeModal}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}>
              {saving ? "Salvando..." : editTarget ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Item da lista ─────────────────────────────────────────────────────────────

interface TemplateListItemProps {
  template: PromptTemplate;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

function TemplateListItem({ template: t, active, onClick, onDelete, deleting }: TemplateListItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group cursor-pointer",
        active
          ? "bg-gray-900 text-white shadow-sm"
          : "hover:bg-gray-100 text-gray-700"
      )}
    >
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        active
          ? "bg-white/15"
          : t.isSystem ? "bg-blue-100" : "bg-purple-100"
      )}>
        {t.isSystem
          ? <Bot className={cn("h-3.5 w-3.5", active ? "text-white" : "text-blue-600")} />
          : <Pencil className={cn("h-3.5 w-3.5", active ? "text-white" : "text-purple-600")} />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-medium truncate", active ? "text-white" : "text-gray-800")}>
            {t.name}
          </span>
          {t.isDefault && (
            <Star className={cn("h-3 w-3 shrink-0", active ? "text-amber-300 fill-amber-300" : "text-amber-500 fill-amber-400")} />
          )}
        </div>
        {t.description && (
          <p className={cn("text-[11px] truncate mt-0.5", active ? "text-white/60" : "text-gray-400")}>
            {t.description}
          </p>
        )}
      </div>

      {active
        ? <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" />
        : onDelete
          ? <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={deleting}
              className="h-6 w-6 shrink-0 hidden group-hover:flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {deleting ? <X className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          : <Lock className="h-3 w-3 text-white/30 shrink-0 hidden group-hover:block" />
      }
    </div>
  );
}
