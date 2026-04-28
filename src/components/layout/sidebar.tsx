"use client";
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
  CheckSquare,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY = "#95304e";

const mainNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads / Kanban", href: "/leads", icon: Users },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  { label: "Clientes", href: "/clientes", icon: Briefcase },
  { label: "Processos", href: "/processos", icon: Scale },
  { label: "Consulta DJEN", href: "/djen", icon: Newspaper },
  { label: "Tarefas", href: "/tarefas", icon: CheckSquare },
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

  return (
    <aside
      className="flex h-screen w-64 shrink-0 flex-col"
      style={{ backgroundColor: PRIMARY }}
    >
      {/* Cabeçalho do escritório */}
      <div className="flex flex-col items-center gap-2 px-5 py-6 border-b" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <Scale className="h-6 w-6 text-white" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50 leading-none mb-1">
            Advocacia e Consultoria
          </p>
          <p className="text-sm font-bold text-white leading-tight">Sheila Araújo</p>
        </div>
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
  );
}
