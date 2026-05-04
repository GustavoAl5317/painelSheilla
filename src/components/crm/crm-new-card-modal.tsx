"use client";
import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Scale, User } from "lucide-react";
import type { CrmCardData } from "./types";

interface ProcessOption { id: string; number: string | null; title: string | null }
interface ClientOption { id: string; name: string }

interface CrmNewCardModalProps {
  open: boolean;
  boardId: string;
  onClose: () => void;
  onCreated: (card: CrmCardData) => void;
}

export function CrmNewCardModal({ open, boardId, onClose, onCreated }: CrmNewCardModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [processId, setProcessId] = useState("");
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    if (!showLink || processes.length > 0) return;
    fetch("/api/processes?limit=100")
      .then((r) => r.json())
      .then((d) => setProcesses(d.data ?? d))
      .catch(() => {});
    fetch("/api/clients?limit=100")
      .then((r) => r.json())
      .then((d) => setClients(d.data ?? d))
      .catch(() => {});
  }, [showLink]);

  function handleClose() {
    setTitle("");
    setDescription("");
    setProcessId("");
    setClientId("");
    setShowLink(false);
    onClose();
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/crm/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId,
        title: title.trim(),
        description: description.trim() || null,
        processId: processId || null,
        clientId: clientId || null,
      }),
    });
    if (res.ok) {
      const card = await res.json();
      onCreated(card);
      handleClose();
    }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Novo card">
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <Label>Título *</Label>
          <Input
            placeholder="Título do card..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !showLink) handleSubmit(); }}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label>Descrição</Label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[72px]"
            placeholder="Descrição opcional..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Toggle vínculos */}
        <button
          type="button"
          onClick={() => setShowLink((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 w-fit"
        >
          {showLink ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Vincular processo / cliente
        </button>

        {showLink && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-xs">
                <Scale className="h-3 w-3 text-blue-400" />
                Processo
              </Label>
              <select
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                value={processId}
                onChange={(e) => setProcessId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>{p.title ?? p.number ?? p.id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-xs">
                <User className="h-3 w-3 text-emerald-400" />
                Cliente
              </Label>
              <select
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading || !title.trim()}>
            {loading ? "Criando..." : "Criar card"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
