"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Bot, Send, Search, MessageSquare, ChevronLeft, Loader2, UserCheck, ExternalLink, RefreshCcw, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConvertLeadButton } from "@/components/kanban/convert-lead-button";
import { AgendaModalChat } from "@/components/agenda/agenda-modal-chat";
import type { Conversation, Lead, Message as PrismaMessage } from "@prisma/client";

type ConvRow = Conversation & {
  lead: Lead | null;
  client: { id: string; name: string } | null;
  messages: PrismaMessage[];
  isBlocked?: boolean;
  globalName?: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "warning" | "success" | "secondary" | "destructive" }> = {
  OPEN: { label: "Aberta", variant: "default" },
  WAITING_RESPONSE: { label: "Aguardando", variant: "warning" },
  IN_PROGRESS: { label: "Em andamento", variant: "success" },
  RESOLVED: { label: "Resolvida", variant: "secondary" },
  TRANSFERRED_TO_HUMAN: { label: "Com humano", variant: "destructive" },
};

function formatHour(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatListDate(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 24 * 60 * 60 * 1000) return formatHour(date);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// LID (xxxxxxxxxxxx@lid) é identificador opaco do WhatsApp para chats com
// privacidade — não é telefone. Quando temos lead.phone com o número real
// (capturado de body.phone no webhook), usamos ele. Caso contrário, mostramos
// "Contato XXXX" com os últimos 4 dígitos do LID para diferenciar.
function isLidPhone(value: string | null | undefined): boolean {
  return !!value && value.endsWith("@lid");
}

function formatBrPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  // 5511999999999 → +55 11 99999-9999
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return d;
}

function realPhoneFromLead(c: ConvRow): string | null {
  const p = c.lead?.phone;
  if (!p) return null;
  if (isLidPhone(p)) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 15) return null;
  return digits;
}

function displayName(c: ConvRow): string {
  if (c.globalName) return c.globalName;
  const leadName = c.lead?.name;
  if (leadName && !isLidPhone(leadName) && leadName !== c.phoneNumber) {
    const nameDigits = leadName.replace(/\D/g, "");
    // Se lead.name for só o telefone bruto, formata bonito
    if (nameDigits.length >= 10 && nameDigits.length <= 15 && nameDigits === leadName.replace(/\s/g, "").replace(/\D/g, "")) {
      return formatBrPhone(nameDigits);
    }
    return leadName;
  }
  const real = realPhoneFromLead(c);
  if (real) return formatBrPhone(real);
  // Sem número real ainda — mostra os 4 últimos dígitos do LID para diferenciar
  const digits = c.phoneNumber.replace(/@.*$/, "");
  return `Contato ${digits.slice(-4)}`;
}

function displaySubtitle(c: ConvRow): string {
  const real = realPhoneFromLead(c);
  if (real) return formatBrPhone(real);
  if (isLidPhone(c.phoneNumber)) return "Contato privado (WhatsApp)";
  return c.phoneNumber;
}

export function ChatShell() {
  const [list, setList] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [togglingAi, setTogglingAi] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [agendaOpen, setAgendaOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const togglingBlockRef = useRef(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/conversations", { credentials: "include" });
      const j = r.ok ? await r.json() : { data: [], organizationId: "" };
      const unique = (j.data ?? []).filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i);
      setList(unique);
      if (j.organizationId) setOrgId(j.organizationId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // Função para atualizar apenas as mensagens da conversa selecionada
  const refreshMessages = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, { credentials: "include" });
      if (!res.ok) return;
      const j = await res.json();
      const messages = j.data as PrismaMessage[];
      setList(prev => prev.map(c => c.id === selectedId ? { ...c, messages } : c));
    } catch (err) {
      console.error("Erro ao atualizar mensagens:", err);
    }
  };

  // Mantém refs atualizadas para uso dentro dos closures de polling
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { togglingBlockRef.current = togglingBlock; }, [togglingBlock]);

  // Polling automático: atualiza lista de conversas a cada 5s e mensagens da conversa aberta a cada 3s
  useEffect(() => {
    const pollConversations = async () => {
      try {
        const r = await fetch("/api/conversations", { credentials: "include" });
        if (!r.ok) return;
        const j = await r.json();
        const fresh: ConvRow[] = (j.data ?? []).filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.id === v.id) === i);
        if (j.organizationId) setOrgId(j.organizationId);
        setList((prev) => {
          return fresh.map((c) => {
            const existing = prev.find((p) => p.id === c.id);
            if (!existing) return c;
            return {
              ...c,
              // Mantém as mensagens do estado local — o pollMessages cuida disso separadamente
              messages: existing.messages,
              // Preserva isBlocked local enquanto toggle está em progresso para evitar flickering
              isBlocked: togglingBlockRef.current && c.id === selectedIdRef.current ? existing.isBlocked : c.isBlocked,
            };
          });
        });
      } catch {}
    };

    const pollMessages = async () => {
      const id = selectedIdRef.current;
      if (!id) return;
      try {
        const res = await fetch(`/api/conversations/${id}/messages`, { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        const seen = new Set<string>();
        const messages = (j.data as PrismaMessage[])
          .map((m) => ({ ...m, createdAt: new Date(m.createdAt) }))
          .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
        setList((prev) => prev.map((c) => c.id === id ? { ...c, messages } : c));
      } catch {}
    };

    const convTimer = setInterval(pollConversations, 5000);
    const msgTimer = setInterval(pollMessages, 3000);

    return () => {
      clearInterval(convTimer);
      clearInterval(msgTimer);
    };
  }, []);

  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? null, [list, selectedId]);

  // Zera unread ao abrir a conversa
  useEffect(() => {
    if (!selectedId) return;
    setList(prev => prev.map(c => c.id === selectedId ? { ...c, unreadCount: 0 } : c));
    fetch(`/api/conversations/${selectedId}/read`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [selectedId]);

  const filtered = list.filter((c) => {
    const name = displayName(c).toLowerCase();
    return name.includes(search.toLowerCase()) || c.phoneNumber.includes(search);
  });

  async function setConversationAiEnabled(enabled: boolean) {
    if (!selectedId) return;
    setTogglingAi(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/ai`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) return;
      const j: { aiEnabled: boolean } = await res.json();
      setList((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, aiEnabled: j.aiEnabled } : c))
      );
    } finally {
      setTogglingAi(false);
    }
  }

  async function setConversationBlocked(blocked: boolean) {
    if (!selectedId) return;
    if (blocked && !confirm("Bloquear este contato? A IA não responderá e as mensagens serão ignoradas.")) return;
    
    setTogglingBlock(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/block`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked }),
      });
      if (!res.ok) return;
      const j: { isBlocked: boolean; aiEnabled: boolean } = await res.json();
      setList((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, isBlocked: j.isBlocked, aiEnabled: j.aiEnabled } : c))
      );
    } finally {
      setTogglingBlock(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages?.length, selectedId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(typeof body.error === "string" ? body.error : "Não foi possível enviar.");
        return;
      }
      const newMsg = body.data as PrismaMessage;
      setInput("");
      setList((prev) =>
        prev.map((c) => {
          if (c.id !== selectedId) return c;
          const created = new Date(newMsg.createdAt);
          const already = c.messages?.some((m) => m.id === newMsg.id);
          if (already) return c;
          return {
            ...c,
            messages: [...(c.messages ?? []), { ...newMsg, createdAt: created }],
            lastMessageAt: created,
          };
        })
      );
    } catch {
      setSendError("Falha na rede. Tente de novo.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">Carregando conversas…</div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className={cn("w-full md:w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white", selectedId && "hidden md:flex")}
      >
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-9 rounded-lg bg-gray-100 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-400 hover:text-blue-600"
            onClick={fetchConversations}
            title="Atualizar lista"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">Nenhuma conversa no banco ainda.</p>
          )}
          {filtered.map((c) => {
            const name = displayName(c);
            const lastMsg = c.messages?.at(-1);
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                  active && "bg-blue-50 hover:bg-blue-50",
                  c.isBlocked && "opacity-60"
                )}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold",
                  c.isBlocked ? "bg-gray-400" : "bg-green-500"
                )}>
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p
                      className={cn(
                        "text-sm truncate text-gray-900",
                        c.unreadCount > 0 ? "font-bold" : "font-semibold"
                      )}
                    >
                      {name} {c.isBlocked && "(Bloqueado)"}
                    </p>
                    {c.lastMessageAt && (
                      <span
                        className={cn(
                          "text-[11px] ml-2 shrink-0",
                          c.unreadCount > 0 ? "text-green-600 font-medium" : "text-gray-400"
                        )}
                      >
                        {formatListDate(new Date(c.lastMessageAt))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs text-gray-400 truncate flex-1 flex items-center gap-1.5 min-w-0">
                      {c.aiEnabled && !c.isBlocked && (
                        <Bot className="h-3 w-3 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate">{lastMsg?.content ?? c.phoneNumber}</span>
                    </p>
                    {c.unreadCount > 0 && !c.isBlocked && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white px-1.5 shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {!selectedId ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <MessageSquare className="h-8 w-8 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">Selecione uma conversa para abrir o chat</p>
        </div>
      ) : (
        selected && (
          <div className="flex-1 flex flex-col min-w-0 bg-[#f0f2f5]">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button type="button" className="md:hidden text-gray-400 shrink-0" onClick={() => setSelectedId(null)}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold",
                  selected.isBlocked ? "bg-gray-400" : "bg-green-500"
                )}>
                  {initials(displayName(selected))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                      {displayName(selected)}
                      {selected.isBlocked && <span className="ml-2 text-red-500 font-bold text-xs">(BLOQUEADO)</span>}
                    </p>
                    <Badge variant={STATUS_CONFIG[selected.status]?.variant ?? "secondary"} className="text-[10px] py-0">
                      {STATUS_CONFIG[selected.status]?.label ?? selected.status}
                    </Badge>
                    {selected.lead?.legalArea && (
                      <span className="text-[11px] text-blue-500 font-medium">{selected.lead.legalArea}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{displaySubtitle(selected)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                {/* Conversão de lead → cliente */}
                {selected.lead && !selected.client && selected.lead.status !== "CONVERTED" && orgId && (
                  <ConvertLeadButton
                    leadId={selected.lead.id}
                    leadName={selected.lead.name}
                    leadPhone={selected.lead.phone}
                    leadEmail={selected.lead.email}
                    organizationId={orgId}
                  />
                )}
                {selected.client && (
                  <Link
                    href={`/clientes/${selected.client.id}`}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors shrink-0"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {selected.client.name}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] font-semibold gap-1.5 shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => setAgendaOpen(true)}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Marcar Agenda</span>
                </Button>

                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-blue-600"
                    onClick={refreshMessages}
                    title="Atualizar mensagens"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-2 min-w-0 opacity-80">
                    <Bot className={cn("h-4 w-4 shrink-0", selected.aiEnabled ? "text-blue-600" : "text-gray-400")} />
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-bold text-gray-800 uppercase leading-none">IA</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={selected.aiEnabled}
                    disabled={togglingAi || selected.isBlocked}
                    onClick={() => void setConversationAiEnabled(!selected.aiEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-30",
                      selected.aiEnabled ? "bg-blue-600" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
                        selected.aiEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <Button
                  variant={selected.isBlocked ? "outline" : "destructive"}
                  size="sm"
                  className="h-8 text-[10px] md:text-[11px] font-bold uppercase px-2 md:px-3"
                  disabled={togglingBlock}
                  onClick={() => void setConversationBlocked(!selected.isBlocked)}
                >
                  <span className="hidden sm:inline">{selected.isBlocked ? "Desbloquear" : "Bloquear Contato"}</span>
                  <span className="sm:hidden">{selected.isBlocked ? "Ativar" : "Bloquear"}</span>
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(selected.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.direction === "INBOUND" ? "bg-white text-gray-800 shadow-sm" : "bg-blue-600 text-white ml-auto"
                  )}
                >
                  <div>
                    {m.isAI && (
                      <span className="text-[10px] opacity-70 flex items-center gap-0.5 mb-0.5">
                        <Bot className="h-3 w-3" /> IA
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className="text-[10px] opacity-60 mt-1">{formatHour(new Date(m.createdAt))}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <footer className="p-2 sm:p-3 bg-gray-100 border-t border-gray-200">
              {selected.isBlocked ? (
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-center">
                  <p className="text-xs text-red-600 font-medium italic">
                    Este contato está bloqueado. Desbloqueie para enviar mensagens.
                  </p>
                </div>
              ) : (
                <>
                  {sendError && (
                    <p className="text-[11px] text-red-600 mb-2 text-center">{sendError}</p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder="Digite a mensagem…"
                      rows={1}
                      disabled={sending}
                      className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] max-h-32 disabled:opacity-60"
                    />
                    <Button
                      size="icon"
                      className="shrink-0 h-11 w-11"
                      onClick={() => void sendMessage()}
                      type="button"
                      disabled={sending || !input.trim()}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </footer>
          </div>
        )
      )}
      <AgendaModalChat
        open={agendaOpen}
        onClose={() => setAgendaOpen(false)}
        clientId={selected?.client?.id}
        clientName={selected?.client?.name}
      />
    </div>
  );
}
