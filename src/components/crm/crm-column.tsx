"use client";
import { useState, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CrmCardItem } from "./crm-card-item";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Pencil, Check, X, GripVertical } from "lucide-react";
import type { CrmBoardData, CrmCardData } from "./types";

const COLORS = [
  "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4",
  "#10b981", "#ef4444", "#f97316", "#ec4899",
  "#6b7280", "#84cc16",
];

interface CrmColumnProps {
  board: CrmBoardData;
  onDelete: (boardId: string) => void;
  onCardClick: (card: CrmCardData) => void;
  onAddCard: (boardId: string) => void;
  onBoardUpdate: (boardId: string, name: string, color: string) => void;
}

export function CrmColumn({ board, onDelete, onCardClick, onAddCard, onBoardUpdate }: CrmColumnProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(board.name);
  const [editColor, setEditColor] = useState(board.color);
  const editInputRef = useRef<HTMLInputElement>(null);

  // useSortable for column reordering
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isColumnDragging,
  } = useSortable({ id: board.id, data: { type: "board" } });

  // useDroppable for card dropping
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: board.id });

  const isEmpty = board.cards.length === 0;

  const columnStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditName(board.name);
    setEditColor(board.color);
    setEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 30);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function confirmEdit() {
    const name = editName.trim();
    if (!name) return cancelEdit();
    setEditing(false);
    onBoardUpdate(board.id, name, editColor);
  }

  // Combine refs for sortable + droppable on the outer container
  function setRef(el: HTMLDivElement | null) {
    setSortableRef(el);
  }

  return (
    <div
      ref={setRef}
      style={columnStyle}
      className={cn("flex flex-col w-72 shrink-0", isColumnDragging && "opacity-40")}
      {...sortableAttributes}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Drag handle for column */}
          <button
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0 touch-none"
            {...sortableListeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {editing ? (
            <div className="flex flex-col gap-1.5 flex-1">
              <input
                ref={editInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200 w-full"
              />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: editColor === c ? `2px solid ${c}` : "none",
                      outlineOffset: "2px",
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
              <span className="text-sm font-semibold text-gray-700 truncate">{board.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-500">
                {board.cards.length}
              </span>
              <button
                onClick={startEdit}
                className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                title="Editar etapa"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onAddCard(board.id)}
                className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                title="Novo card"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {isEmpty && (
                <button
                  onClick={() => onDelete(board.id)}
                  className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Excluir etapa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button onClick={confirmEdit} className="p-1 rounded text-gray-400 hover:text-green-600">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelEdit} className="p-1 rounded text-gray-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setDroppableRef}
        className={cn(
          "flex flex-col gap-2.5 flex-1 rounded-xl p-2.5 min-h-48 transition-colors",
          isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-100/60"
        )}
      >
        <SortableContext items={board.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {board.cards.map((card) => (
            <CrmCardItem key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>

        {isEmpty && (
          <button
            onClick={() => onAddCard(board.id)}
            className="flex items-center justify-center flex-1 text-xs text-gray-400 py-8 hover:text-blue-500 transition-colors"
          >
            + Novo card
          </button>
        )}
      </div>
    </div>
  );
}
