"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Scale, User, MessageSquare, Calendar, AlertCircle } from "lucide-react";
import { cn, isDeadlineOverdue, isDeadlineUrgent } from "@/lib/utils";
import type { CrmCardData, CrmPriority } from "./types";

const PRIORITY_CONFIG: Record<CrmPriority, { label: string; className: string } | null> = {
  NONE: null,
  LOW: { label: "Baixa", className: "bg-blue-50 text-blue-600 border-blue-200" },
  MEDIUM: { label: "Média", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  HIGH: { label: "Alta", className: "bg-orange-50 text-orange-600 border-orange-200" },
  URGENT: { label: "Urgente", className: "bg-red-50 text-red-600 border-red-200" },
};

interface CrmCardItemProps {
  card: CrmCardData;
  isDragging?: boolean;
  onClick: () => void;
}

export function CrmCardItem({ card, isDragging = false, onClick }: CrmCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } =
    useSortable({ id: card.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const priority = card.priority ?? "NONE";
  const priorityConfig = PRIORITY_CONFIG[priority];

  const dueDateObj = card.dueDate ? new Date(card.dueDate) : null;
  const isOverdue = dueDateObj ? isDeadlineOverdue(dueDateObj) : false;
  const isUrgent = dueDateObj ? isDeadlineUrgent(dueDateObj) : false;
  const dueDateClass = isOverdue
    ? "bg-red-50 text-red-600 border-red-200"
    : isUrgent
    ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-gray-50 text-gray-500 border-gray-200";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group rounded-xl bg-white border border-gray-200 p-3.5 shadow-sm cursor-pointer select-none transition-shadow hover:shadow-md hover:border-gray-300",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg ring-2 ring-blue-300"
      )}
    >
      {/* Prioridade + tags */}
      {(priorityConfig || (card.tags && card.tags.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {priorityConfig && (
            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border", priorityConfig.className)}>
              <AlertCircle className="h-2.5 w-2.5" />
              {priorityConfig.label}
            </span>
          )}
          {card.tags?.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-200">
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-2">
        {card.title}
      </p>

      {card.description && (
        <p className="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">
          {card.description}
        </p>
      )}

      {/* Vínculos */}
      <div className="flex flex-col gap-1 mb-2">
        {card.process && (
          <div className="flex items-center gap-1.5">
            <Scale className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="text-xs text-gray-500 truncate">
              {card.process.title ?? card.process.number ?? "Processo"}
            </span>
          </div>
        )}
        {card.client && (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-xs text-gray-500 truncate">{card.client.name}</span>
          </div>
        )}
      </div>

      {/* Footer: data e atividades */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {dueDateObj ? (
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", dueDateClass)}>
            <Calendar className="h-2.5 w-2.5" />
            {dueDateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        ) : (
          <span />
        )}
        {card._count && card._count.activities > 0 && (
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-gray-300" />
            <span className="text-[10px] text-gray-400">{card._count.activities}</span>
          </div>
        )}
      </div>
    </div>
  );
}
