"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Briefcase,
  Settings,
  Plug,
  Scale,
  Newspaper,
  CalendarDays,
  ChevronRight,
  KanbanSquare,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "./mobile-nav-context";
import { X } from "lucide-react";

const PRIMARY = "#95304e";

const mainNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Triagem", href: "/leads", icon: Users },
  { label: "CRM", href: "/crm", icon: KanbanSquare },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  { label: "Clientes", href: "/clientes", icon: Briefcase },
  { label: "Processos", href: "/processos", icon: Scale },
  { label: "Consulta DJEN", href: "/djen", icon: Newspaper },
  { label: "Agenda", href: "/agenda", icon: CalendarDays },
  { label: "Prompts", href: "/prompts", icon: BrainCircuit },
];

const bottomNav = [
  { label: "Integrações", href: "/integracoes", icon: Plug },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

function NavItem({
  href, label, icon: Icon, active,
}: {
  href: string; label: string; icon: React.ElementType; active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active ? "text-white shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
      style={active ? { backgroundColor: "rgba(255,255,255,0.18)" } : {}}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-white" : "text-white/50 group-hover:text-white"
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {active && <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" />}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useMobileNav();

  // Fecha o menu mobile ao trocar de rota
  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 md:static md:translate-x-0",
          !isOpen && "-translate-x-full"
        )}
        style={{ backgroundColor: PRIMARY }}
      >
        {/* Cabeçalho do escritório */}
        <div className="flex items-center justify-between px-5 py-6 border-b" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <Scale className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50 leading-none mb-1">
                Sheila Araújo
              </p>
              <p className="text-xs md:text-sm font-bold text-white leading-tight">Advocacia</p>
            </div>
          </div>
          <button onClick={close} className="md:hidden text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

      {/* Nav principal */}
      <nav className="flex flex-1 flex-col overflow-y-auto p-3 gap-0.5">
        <p className="px-3 mb-2 mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Menu
        </p>
        {mainNav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href))
            }
          />
        ))}
      </nav>

      {/* Nav inferior */}
      <div className="p-3 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Sistema
        </p>
        {bottomNav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </div>
    </aside>
    </>
  );
}
