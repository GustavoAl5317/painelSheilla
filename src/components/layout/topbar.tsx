"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Search, User2, Scale, Users, LogOut, CheckCheck } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials, formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MEMBER: "Membro",
  VIEWER: "Leitura",
};

interface TopbarProps {
  title: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string | Date;
}

interface SearchResult {
  clients: { id: string; name: string; phone: string | null; cpf: string | null }[];
  processes: { id: string; number: string; title: string | null; client: { name: string } }[];
  leads: { id: string; name: string; phone: string | null; legalArea: string | null }[];
}

const notifIcon: Record<string, string> = {
  NEW_LEAD: "🟢",
  DJEN_PUBLICATION: "🔵",
  TASK_DUE: "🟡",
  AI_RESPONSE: "🤖",
  TRANSFER_TO_HUMAN: "👤",
};

export function Topbar({ title }: TopbarProps) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Usuário";
  const userRole = ROLE_LABEL[(session?.user as { role?: string } | undefined)?.role ?? ""] ?? "—";

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { 
        if (!cancelled) {
          const unique = (j.data ?? []).filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i);
          setNotifications(unique); 
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults(null); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    if (!res.ok) { setSearchResults({ clients: [], processes: [], leads: [] }); return; }
    setSearchResults(await res.json());
  }, []);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(() => { void doSearch(searchQuery); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, doSearch]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Marca como lidas ao abrir o painel (após 1s para o badge aparecer brevemente)
  useEffect(() => {
    if (!notifOpen) return;
    const hasUnread = notifications.some(n => !n.read);
    if (!hasUnread) return;
    const t = setTimeout(() => { void markAllRead(); }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  const hasResults =
    searchResults &&
    (searchResults.clients.length + searchResults.processes.length + searchResults.leads.length) > 0;

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur-sm px-6 shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Busca global */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2 w-72 focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-sm focus-within:shadow-blue-100/50 transition-all">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Buscar clientes, processos..."
              className="bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none w-full"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="text-gray-300 hover:text-gray-500 shrink-0 text-xs">✕</button>
            )}
          </div>

          {searchOpen && searchQuery.length >= 2 && (
            <div className="absolute top-full mt-2 right-0 w-96 bg-white border border-gray-200/80 rounded-2xl shadow-xl shadow-gray-200/60 z-50 overflow-hidden">
              {!hasResults ? (
                <div className="py-8 text-center">
                  <Search className="h-6 w-6 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Nenhum resultado para &ldquo;{searchQuery}&rdquo;</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {searchResults!.clients.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Clientes</p>
                      {searchResults!.clients.map((c) => (
                        <Link key={c.id} href={`/clientes/${c.id}`} onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/60 transition-colors">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 shrink-0">
                            <Users className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {searchResults!.processes.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Processos</p>
                      {searchResults!.processes.map((p) => (
                        <Link key={p.id} href={`/processos/${p.id}`} onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-purple-50/60 transition-colors">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 shrink-0">
                            <Scale className="h-3.5 w-3.5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate">{p.title ?? p.number}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.number}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {searchResults!.leads.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Triagem</p>
                      {searchResults!.leads.map((l) => (
                        <Link key={l.id} href="/leads" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-green-50/60 transition-colors">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 shrink-0">
                            <User2 className="h-3.5 w-3.5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{l.name}</p>
                            {l.legalArea && <p className="text-xs text-gray-400">{l.legalArea}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notificações */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all",
              notifOpen
                ? "border-[#95304e]/30 bg-[#95304e]/8 text-[#95304e]"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-gray-200/80 rounded-2xl shadow-xl shadow-gray-200/60 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-500" />
                  <p className="text-sm font-semibold text-gray-900">Notificações</p>
                  {unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600 px-1.5">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
                    <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="h-7 w-7 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nenhuma notificação</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={cn("px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50", !n.read && "bg-blue-50/40")}>
                      <span className="text-base mt-0.5 shrink-0">{notifIcon[n.type] ?? "🔔"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-gray-300 mt-1">{formatRelative(new Date(n.createdAt))}</p>
                      </div>
                      {!n.read && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divisor */}
        <div className="h-7 w-px bg-gray-200 mx-1" />

        {/* Avatar + usuário */}
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 ring-2 ring-gray-100">
            <AvatarFallback className="text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #95304e, #6b1f37)" }}>
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate max-w-[130px]">{userName}</p>
            <p className="text-[11px] text-gray-400 leading-tight">{userRole}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sair da conta"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
