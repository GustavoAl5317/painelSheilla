"use client";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Scale, User, Trash2, Link2, X, Pencil, Check, Tag, Calendar, AlertCircle } from "lucide-react";
import { formatDateTime, cn } from "@/lib/utils";
import type { CrmCardData, CrmActivity, CrmPriority } from "./types";

interface ProcessOption { id: string; number: string | null; title: string | null }
interface ClientOption { id: string; name: string }

interface CrmCardModalProps {
  card: CrmCardData | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: CrmCardData) => void;
  onDelete: (cardId: string) => void;
}

const PRIORITY_OPTIONS: { value: CrmPriority; label: string }[] = [
  { value: "NONE", label: "Sem prioridade" },
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

export function CrmCardModal({ card, open, onClose, onUpdate, onDelete }: CrmCardModalProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<CrmPriority>("NONE");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [newActivity, setNewActivity] = useState("");
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingActivityContent, setEditingActivityContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [showLinkPanel, setShowLinkPanel] = useState(false);

  const activityEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description ?? "");
    setDueDate(card.dueDate ? card.dueDate.split("T")[0] : "");
    setPriority(card.priority ?? "NONE");
    setTags(card.tags ?? []);
    setSelectedProcessId(card.processId ?? "");
    setSelectedClientId(card.clientId ?? "");
    setShowLinkPanel(false);
    setEditingActivityId(null);

    fetch(`/api/crm/cards/${card.id}/activities`)
      .then((r) => r.json())
      .then(setActivities)
      .catch(() => {});
  }, [card]);

  useEffect(() => {
    if (!showLinkPanel) return;
    fetch("/api/processes?limit=100")
      .then((r) => r.json())
      .then((d) => setProcesses(d.data ?? d))
      .catch(() => {});
    fetch("/api/clients?limit=100")
      .then((r) => r.json())
      .then((d) => setClients(d.data ?? d))
      .catch(() => {});
  }, [showLinkPanel]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities]);

  if (!card) return null;

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  async function handleSave() {
    if (!card) return;
    setSaving(true);
    const res = await fetch(`/api/crm/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || card.title,
        description: description.trim() || null,
        processId: selectedProcessId || null,
        clientId: selectedClientId || null,
        dueDate: dueDate || null,
        priority,
        tags,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
    }
    setSaving(false);
  }

  async function handleAddActivity() {
    if (!card || !newActivity.trim()) return;
    setSubmittingActivity(true);
    const res = await fetch(`/api/crm/cards/${card.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newActivity.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setActivities((prev) => [...prev, created]);
      setNewActivity("");
    }
    setSubmittingActivity(false);
  }

  async function handleEditActivity(activityId: string) {
    if (!card || !editingActivityContent.trim()) return;
    const res = await fetch(`/api/crm/cards/${card.id}/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editingActivityContent.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActivities((prev) => prev.map((a) => (a.id === activityId ? updated : a)));
    }
    setEditingActivityId(null);
    setEditingActivityContent("");
  }

  async function handleDeleteActivity(activityId: string) {
    if (!card) return;
    const res = await fetch(`/api/crm/cards/${card.id}/activities/${activityId}`, { method: "DELETE" });
    if (res.ok) setActivities((prev) => prev.filter((a) => a.id !== activityId));
  }

  async function handleDelete() {
    if (!card || !confirm("Excluir este card?")) return;
    await fetch(`/api/crm/cards/${card.id}`, { method: "DELETE" });
    onDelete(card.id);
    onClose();
  }

  const linkedProcess = processes.find((p) => p.id === selectedProcessId) ?? card.process;
  const linkedClient = clients.find((c) => c.id === selectedClientId) ?? card.client;

  return (
    <Modal open={open} onClose={onClose} title="Card" className="max-w-2xl">
      <div className="flex flex-col gap-5">
        {/* Título */}
        <div className="space-y-1">
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {/* Descrição */}
        <div className="space-y-1">
          <Label>Descrição</Label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[72px]"
            placeholder="Adicione uma descrição..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Prioridade + Data */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-gray-400" />
              Prioridade
            </Label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              value={priority}
              onChange={(e) => setPriority(e.target.value as CrmPriority)}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              Vencimento
            </Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-gray-400" />
            Etiquetas
          </Label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  {tag}
                  <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} className="hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nova etiqueta... (Enter para adicionar)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="text-sm"
            />
            <Button size="sm" variant="ghost" onClick={addTag} disabled={!tagInput.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Vínculos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Vínculos</Label>
            <button
              onClick={() => setShowLinkPanel((v) => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Link2 className="h-3.5 w-3.5" />
              {showLinkPanel ? "Fechar" : "Vincular"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(selectedProcessId || card.processId) && (
              <Badge variant="secondary" className="gap-1.5 pr-1.5">
                <Scale className="h-3 w-3 text-blue-500" />
                <span className="text-xs">
                  {linkedProcess ? (linkedProcess.title ?? linkedProcess.number ?? "Processo") : "Processo vinculado"}
                </span>
                <button onClick={() => setSelectedProcessId("")} className="ml-0.5 text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {(selectedClientId || card.clientId) && (
              <Badge variant="secondary" className="gap-1.5 pr-1.5">
                <User className="h-3 w-3 text-emerald-500" />
                <span className="text-xs">
                  {linkedClient ? linkedClient.name : "Cliente vinculado"}
                </span>
                <button onClick={() => setSelectedClientId("")} className="ml-0.5 text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {!selectedProcessId && !card.processId && !selectedClientId && !card.clientId && (
              <p className="text-xs text-gray-400 italic">Nenhum vínculo</p>
            )}
          </div>

          {showLinkPanel && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="space-y-1">
                <Label className="text-xs">Processo</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                  value={selectedProcessId}
                  onChange={(e) => setSelectedProcessId(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.title ?? p.number ?? p.id}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <Button size="sm" onClick={handleSave} disabled={saving} className="w-fit">
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>

        <hr className="border-gray-100" />

        {/* Atividades */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Atividades & Comentários
          </p>

          <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
            {activities.length === 0 && (
              <p className="text-xs text-gray-400 italic">Nenhuma atividade ainda.</p>
            )}
            {activities.map((a) => (
              <div key={a.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 group/activity">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {editingActivityId === a.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]"
                          value={editingActivityContent}
                          onChange={(e) => setEditingActivityContent(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => handleEditActivity(a.id)} disabled={!editingActivityContent.trim()} className="h-7 text-xs">
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingActivityId(null)} className="h-7 text-xs">
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {a.user && (
                        <span className="text-[10px] font-medium text-gray-600">{a.user.name}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{formatDateTime(new Date(a.createdAt))}</span>
                    </div>
                  </div>
                  {currentUserId && a.userId === currentUserId && editingActivityId !== a.id && (
                    <div className={cn("flex gap-1 shrink-0 opacity-0 group-hover/activity:opacity-100 transition-opacity")}>
                      <button
                        onClick={() => { setEditingActivityId(a.id); setEditingActivityContent(a.content); }}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteActivity(a.id)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                        title="Excluir"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={activityEndRef} />
          </div>

          <div className="flex gap-2">
            <textarea
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]"
              placeholder="Adicione uma atividade ou comentário..."
              value={newActivity}
              onChange={(e) => setNewActivity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddActivity();
              }}
            />
            <Button
              size="sm"
              onClick={handleAddActivity}
              disabled={submittingActivity || !newActivity.trim()}
              className="self-end"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-400">Ctrl+Enter para enviar</p>
        </div>

        <div className="pt-2 border-t border-gray-100 flex justify-end">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir card
          </button>
        </div>
      </div>
    </Modal>
  );
}
