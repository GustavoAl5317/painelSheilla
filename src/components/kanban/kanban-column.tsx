"use client";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LeadCard } from "./lead-card";
import type { KanbanStage, Lead, User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type LeadWithRelations = Lead & {
  assignedTo?: Pick<User, "id" | "name" | "avatar"> | null;
  _count?: { conversations: number; tasks: number };
};

type StageWithLeads = KanbanStage & { leads: LeadWithRelations[] };

interface KanbanColumnProps {
  stage: StageWithLeads;
  onDelete?: (stageId: string) => void;
}

export function KanbanColumn({ stage, onDelete }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const isEmpty = stage.leads.length === 0;

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Header da coluna */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold text-gray-700">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-500">
            {stage.leads.length}
          </span>
          {isEmpty && onDelete && (
            <button
              onClick={() => onDelete(stage.id)}
              className="ml-1 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Excluir etapa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2.5 flex-1 rounded-xl p-2.5 min-h-48 transition-colors",
          isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-100/60"
        )}
      >
        <SortableContext items={stage.leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {stage.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {isEmpty && (
          <div className="flex items-center justify-center flex-1 text-xs text-gray-400 py-8">
            Sem leads nesta etapa
          </div>
        )}
      </div>
    </div>
  );
}
