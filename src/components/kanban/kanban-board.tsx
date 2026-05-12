"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { LeadCard } from "./lead-card";
import { ConvertLeadButton } from "./convert-lead-button";
import type { KanbanStage, Lead, User } from "@prisma/client";
import { Plus, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LeadWithRelations = Lead & {
  assignedTo?: Pick<User, "id" | "name" | "avatar"> | null;
  _count?: { conversations: number; tasks: number };
};

type StageWithLeads = KanbanStage & { leads: LeadWithRelations[] };

interface KanbanBoardProps {
  initialStages: StageWithLeads[];
  organizationId: string;
}

const COLORS = [
  "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4",
  "#10b981", "#ef4444", "#f97316", "#ec4899",
  "#6b7280", "#84cc16",
];

// slugs que representam "cliente fechado / convertido"
const CONVERT_SLUGS = ["cliente-fechado", "cliente_fechado", "fechado", "convertido", "closed", "won"];

export function KanbanBoard({ initialStages, organizationId }: KanbanBoardProps) {
  const [stages, setStages] = useState(initialStages);
  const [activeLead, setActiveLead] = useState<LeadWithRelations | null>(null);
  const [search, setSearch] = useState("");

  // Modal de conversão disparado pelo drag
  const [convertTarget, setConvertTarget] = useState<{
    lead: LeadWithRelations;
    stageId: string;
  } | null>(null);

  // Nova etapa
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(COLORS[0]);
  const newStageInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  // Busca em `stages` (fonte da verdade), não em filteredStages
  const findLeadById = useCallback(
    (id: string) => {
      for (const stage of stages) {
        const lead = stage.leads.find((l) => l.id === id);
        if (lead) return { lead, stage };
      }
      return null;
    },
    [stages]
  );

  function handleDragStart(event: DragStartEvent) {
    const result = findLeadById(event.active.id as string);
    setActiveLead(result?.lead ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveLead(null);
    if (!over) return;

    const leadId = active.id as string;
    const result = findLeadById(leadId);
    if (!result) return;

    const { lead, stage: currentStage } = result;

    // Resolve o ID do over: pode ser um stageId ou um leadId (solto sobre outro card)
    let targetStageId = over.id as string;
    if (!stages.some((s) => s.id === targetStageId)) {
      const found = stages.find((s) => s.leads.some((l) => l.id === targetStageId));
      if (!found) return;
      targetStageId = found.id;
    }

    // Mesma coluna — não faz nada, mas não precisa atualizar estado
    if (currentStage.id === targetStageId) return;

    const targetStage = stages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    // Se é coluna de "cliente fechado", abre modal de conversão
    // sem mover o card nem salvar no banco ainda
    const isConvertStage = CONVERT_SLUGS.includes(targetStage.slug.toLowerCase());
    if (isConvertStage) {
      setConvertTarget({ lead, stageId: targetStageId });
      return;
    }

    // Atualização optimista
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === currentStage.id) {
          return { ...stage, leads: stage.leads.filter((l) => l.id !== leadId) };
        }
        if (stage.id === targetStageId) {
          return { ...stage, leads: [{ ...lead, stageId: targetStageId }, ...stage.leads] };
        }
        return stage;
      })
    );

    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: targetStageId }),
    });
  }

  // Chamado pelo ConvertLeadButton quando a conversão é concluída com sucesso
  function handleConvertDone() {
    if (!convertTarget) return;
    const { lead, stageId } = convertTarget;
    // Move o card para a coluna de destino e marca como convertido
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.leads.some((l) => l.id === lead.id)) {
          return { ...stage, leads: stage.leads.filter((l) => l.id !== lead.id) };
        }
        if (stage.id === stageId) {
          return {
            ...stage,
            leads: [{ ...lead, stageId, status: "CONVERTED" as const, clientId: "done" }, ...stage.leads],
          };
        }
        return stage;
      })
    );
    setConvertTarget(null);
  }

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;

    const tempId = `temp_${Date.now()}`;
    const optimistic: StageWithLeads = {
      id: tempId,
      name,
      slug: tempId,
      color: newStageColor,
      order: stages.length + 1,
      isDefault: false,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
      leads: [],
    };

    setStages((prev) => [...prev, optimistic]);
    setAddingStage(false);
    setNewStageName("");
    setNewStageColor(COLORS[0]);

    try {
      const res = await fetch("/api/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name, color: newStageColor }),
      });
      if (res.ok) {
        const created = await res.json();
        setStages((prev) =>
          prev.map((s) => (s.id === tempId ? { ...created, leads: [] } : s))
        );
      }
    } catch {
      // silently keep optimistic state in demo mode
    }
  }

  async function handleDeleteStage(stageId: string) {
    setStages((prev) => prev.filter((s) => s.id !== stageId));
    try {
      await fetch(`/api/stages/${stageId}`, { method: "DELETE" });
    } catch {
      // silently keep optimistic state in demo mode
    }
  }

  function handleStartAdding() {
    setAddingStage(true);
    setTimeout(() => newStageInputRef.current?.focus(), 50);
  }

  const filteredStages = stages.map((stage) => ({
    ...stage,
    leads: search
      ? stage.leads.filter(
          (l) =>
            l.name.toLowerCase().includes(search.toLowerCase()) ||
            l.phone?.includes(search) ||
            l.email?.toLowerCase().includes(search.toLowerCase()) ||
            l.legalArea?.toLowerCase().includes(search.toLowerCase())
        )
      : stage.leads,
  }));

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar lead..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Novo Lead
        </Button>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto scrollbar-thin">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 p-4 sm:gap-4 sm:p-6 h-full min-w-max items-start">
            {filteredStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                onDelete={handleDeleteStage}
              />
            ))}

            {/* Adicionar etapa */}
            {addingStage ? (
              <div className="flex flex-col w-72 shrink-0 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 gap-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nova etapa</p>
                <Input
                  ref={newStageInputRef}
                  placeholder="Nome da etapa..."
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddStage();
                    if (e.key === "Escape") { setAddingStage(false); setNewStageName(""); }
                  }}
                />
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Cor</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewStageColor(c)}
                        className="h-5 w-5 rounded-full transition-transform hover:scale-110 ring-offset-1"
                        style={{
                          backgroundColor: c,
                          outline: newStageColor === c ? `2px solid ${c}` : "none",
                          outlineOffset: "2px",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddStage} disabled={!newStageName.trim()} className="flex-1 gap-1">
                    <Check className="h-3.5 w-3.5" /> Criar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingStage(false); setNewStageName(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartAdding}
                className="flex items-center gap-2 w-72 shrink-0 h-12 rounded-xl border border-dashed border-gray-300 px-4 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nova etapa
              </button>
            )}
          </div>

          <DragOverlay>
            {activeLead && <LeadCard lead={activeLead} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modal de conversão disparado pelo drag */}
      {convertTarget && (
        <ConvertLeadButton
          leadId={convertTarget.lead.id}
          leadName={convertTarget.lead.name}
          leadPhone={convertTarget.lead.phone}
          leadEmail={convertTarget.lead.email}
          organizationId={organizationId}
          autoOpen
          onConverted={handleConvertDone}
          onCancel={() => setConvertTarget(null)}
        />
      )}
    </div>
  );
}
