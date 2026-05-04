"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CrmColumn } from "./crm-column";
import { CrmCardItem } from "./crm-card-item";
import { CrmCardModal } from "./crm-card-modal";
import { CrmNewCardModal } from "./crm-new-card-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, X, Search, Filter, SlidersHorizontal } from "lucide-react";
import { pusherClient } from "@/lib/pusher-client";
import { toast } from "sonner";
import type { CrmBoardData, CrmCardData, CrmPriority } from "./types";

const COLORS = [
  "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4",
  "#10b981", "#ef4444", "#f97316", "#ec4899",
  "#6b7280", "#84cc16",
];

interface Filters {
  priority: CrmPriority | "";
  dueDateMode: "" | "overdue" | "today" | "week";
  search: string;
}

interface SearchResult extends CrmCardData {
  board: { id: string; name: string; color: string };
}

interface CrmBoardProps {
  initialBoards: CrmBoardData[];
  organizationId: string;
}

export function CrmBoard({ initialBoards, organizationId }: CrmBoardProps) {
  const [boards, setBoards] = useState(initialBoards);
  const [activeCard, setActiveCard] = useState<CrmCardData | null>(null);
  const [activeBoard, setActiveBoard] = useState<CrmBoardData | null>(null);

  const [selectedCard, setSelectedCard] = useState<CrmCardData | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [newCardBoardId, setNewCardBoardId] = useState<string | null>(null);

  // Nova etapa
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardColor, setNewBoardColor] = useState(COLORS[0]);
  const newBoardInputRef = useRef<HTMLInputElement>(null);

  // Filtros
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ priority: "", dueDateMode: "", search: "" });

  // Busca global
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Pusher subscriptions
  useEffect(() => {
    const channel = pusherClient.subscribe(`org-${organizationId}`);

    channel.bind("crm:card-moved", (data: { cardId: string; fromBoardId: string; toBoardId: string; cardTitle: string; movedBy: string }) => {
      setBoards((prev) => {
        const card = prev.flatMap((b) => b.cards).find((c) => c.id === data.cardId);
        if (!card) return prev;
        return prev.map((board) => {
          if (board.id === data.fromBoardId) return { ...board, cards: board.cards.filter((c) => c.id !== data.cardId) };
          if (board.id === data.toBoardId) return { ...board, cards: [{ ...card, boardId: data.toBoardId }, ...board.cards] };
          return board;
        });
      });
      toast.info(`"${data.cardTitle}" movido por ${data.movedBy}`);
    });

    channel.bind("crm:activity-added", (data: { cardId: string; cardTitle: string; userName: string }) => {
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          cards: board.cards.map((c) =>
            c.id === data.cardId
              ? { ...c, _count: { activities: (c._count?.activities ?? 0) + 1 } }
              : c
          ),
        }))
      );
      toast.info(`Novo comentário em "${data.cardTitle}" por ${data.userName}`);
    });

    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(`org-${organizationId}`);
    };
  }, [organizationId]);

  // Busca global com debounce
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!globalSearch.trim() || globalSearch.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(globalSearch)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setShowSearchResults(true);
      }
    }, 300);
  }, [globalSearch]);

  // Fechar dropdown de busca ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const findCardById = useCallback(
    (id: string) => {
      for (const board of boards) {
        const card = board.cards.find((c) => c.id === id);
        if (card) return { card, board };
      }
      return null;
    },
    [boards]
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    // Check if dragging a board column
    if (active.data.current?.type === "board") {
      const board = boards.find((b) => b.id === active.id);
      setActiveBoard(board ?? null);
      return;
    }
    const result = findCardById(active.id as string);
    setActiveCard(result?.card ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    setActiveBoard(null);
    if (!over) return;

    // Column reorder
    if (active.data.current?.type === "board") {
      const oldIndex = boards.findIndex((b) => b.id === active.id);
      const newIndex = boards.findIndex((b) => b.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(boards, oldIndex, newIndex);
        setBoards(reordered);
        await fetch("/api/crm/boards/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds: reordered.map((b) => b.id) }),
        });
      }
      return;
    }

    // Card move
    const cardId = active.id as string;
    const result = findCardById(cardId);
    if (!result) return;

    const { card, board: currentBoard } = result;

    let targetBoardId = over.id as string;
    if (!boards.some((b) => b.id === targetBoardId)) {
      const found = boards.find((b) => b.cards.some((c) => c.id === targetBoardId));
      if (!found) return;
      targetBoardId = found.id;
    }

    if (currentBoard.id === targetBoardId) return;

    setBoards((prev) =>
      prev.map((board) => {
        if (board.id === currentBoard.id) return { ...board, cards: board.cards.filter((c) => c.id !== cardId) };
        if (board.id === targetBoardId) return { ...board, cards: [{ ...card, boardId: targetBoardId }, ...board.cards] };
        return board;
      })
    );

    await fetch(`/api/crm/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId: targetBoardId }),
    });
  }

  async function handleAddBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    const tempId = `temp_${Date.now()}`;
    const optimistic: CrmBoardData = { id: tempId, name, slug: tempId, color: newBoardColor, order: boards.length + 1, organizationId, cards: [] };
    setBoards((prev) => [...prev, optimistic]);
    setAddingBoard(false);
    setNewBoardName("");
    setNewBoardColor(COLORS[0]);
    const res = await fetch("/api/crm/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, color: newBoardColor }),
    });
    if (res.ok) {
      const created = await res.json();
      setBoards((prev) => prev.map((b) => (b.id === tempId ? { ...created, cards: [] } : b)));
    }
  }

  async function handleDeleteBoard(boardId: string) {
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    await fetch(`/api/crm/boards/${boardId}`, { method: "DELETE" });
  }

  async function handleBoardUpdate(boardId: string, name: string, color: string) {
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name, color } : b)));
    await fetch(`/api/crm/boards/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
  }

  function handleCardClick(card: CrmCardData) {
    setSelectedCard(card);
    setCardModalOpen(true);
  }

  function handleCardUpdate(updated: CrmCardData) {
    setBoards((prev) =>
      prev.map((board) => ({
        ...board,
        cards: board.cards.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      }))
    );
    setSelectedCard(updated);
  }

  function handleCardDelete(cardId: string) {
    setBoards((prev) => prev.map((board) => ({ ...board, cards: board.cards.filter((c) => c.id !== cardId) })));
    setCardModalOpen(false);
    setSelectedCard(null);
  }

  function handleCardCreated(card: CrmCardData) {
    setBoards((prev) =>
      prev.map((board) => (board.id === card.boardId ? { ...board, cards: [...board.cards, card] } : board))
    );
  }

  // Filtragem client-side
  const filteredBoards = boards.map((board) => ({
    ...board,
    cards: board.cards.filter((card) => {
      if (filters.priority && card.priority !== filters.priority) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!card.title.toLowerCase().includes(q) && !(card.description ?? "").toLowerCase().includes(q)) return false;
      }
      if (filters.dueDateMode) {
        if (!card.dueDate) return false;
        const due = new Date(card.dueDate);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const inWeek = new Date(today);
        inWeek.setDate(today.getDate() + 7);
        if (filters.dueDateMode === "overdue" && due >= today) return false;
        if (filters.dueDateMode === "today" && due.toDateString() !== today.toDateString()) return false;
        if (filters.dueDateMode === "week" && (due < today || due > inWeek)) return false;
      }
      return true;
    }),
  }));

  const hasFilters = !!(filters.priority || filters.dueDateMode || filters.search);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        {/* Busca global */}
        <div className="relative flex-1 max-w-xs" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cards..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {searchResults.map((card) => (
                <button
                  key={card.id}
                  onClick={() => {
                    handleCardClick(card);
                    setShowSearchResults(false);
                    setGlobalSearch("");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: card.board.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{card.title}</p>
                    <p className="text-xs text-gray-400 truncate">{card.board.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {showSearchResults && globalSearch.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3">
              <p className="text-sm text-gray-400 text-center">Nenhum card encontrado</p>
            </div>
          )}
        </div>

        {/* Toggle filtros */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            hasFilters || showFilters
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {hasFilters && (
            <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white font-bold">
              {[filters.priority, filters.dueDateMode, filters.search].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilters && (
        <div className="flex items-center gap-4 px-6 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Filtrar por:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Prioridade</label>
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as CrmPriority | "" }))}
            >
              <option value="">Todas</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
              <option value="NONE">Sem prioridade</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Vencimento</label>
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={filters.dueDateMode}
              onChange={(e) => setFilters((f) => ({ ...f, dueDateMode: e.target.value as Filters["dueDateMode"] }))}
            >
              <option value="">Todos</option>
              <option value="overdue">Vencidos</option>
              <option value="today">Hoje</option>
              <option value="week">Próximos 7 dias</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Título</label>
            <input
              type="text"
              placeholder="Filtrar por texto..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 w-36"
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => setFilters({ priority: "", dueDateMode: "", search: "" })}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-6 h-full min-w-max items-start">
            <SortableContext items={boards.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
              {filteredBoards.map((board) => (
                <CrmColumn
                  key={board.id}
                  board={board}
                  onDelete={handleDeleteBoard}
                  onCardClick={handleCardClick}
                  onAddCard={(boardId) => setNewCardBoardId(boardId)}
                  onBoardUpdate={handleBoardUpdate}
                />
              ))}
            </SortableContext>

            {/* Adicionar etapa */}
            {addingBoard ? (
              <div className="flex flex-col w-72 shrink-0 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 gap-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nova etapa</p>
                <Input
                  ref={newBoardInputRef}
                  placeholder="Nome da etapa..."
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddBoard();
                    if (e.key === "Escape") { setAddingBoard(false); setNewBoardName(""); }
                  }}
                />
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Cor</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewBoardColor(c)}
                        className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                        style={{ backgroundColor: c, outline: newBoardColor === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddBoard} disabled={!newBoardName.trim()} className="flex-1 gap-1">
                    <Check className="h-3.5 w-3.5" /> Criar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingBoard(false); setNewBoardName(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingBoard(true); setTimeout(() => newBoardInputRef.current?.focus(), 50); }}
                className="flex items-center gap-2 w-72 shrink-0 h-12 rounded-xl border border-dashed border-gray-300 px-4 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nova etapa
              </button>
            )}
          </div>

          <DragOverlay>
            {activeCard && <CrmCardItem card={activeCard} isDragging onClick={() => {}} />}
            {activeBoard && (
              <div className="w-72 bg-white rounded-xl border-2 border-blue-300 shadow-xl opacity-90 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeBoard.color }} />
                  <span className="text-sm font-semibold text-gray-700">{activeBoard.name}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <CrmCardModal
        card={selectedCard}
        open={cardModalOpen}
        onClose={() => { setCardModalOpen(false); setSelectedCard(null); }}
        onUpdate={handleCardUpdate}
        onDelete={handleCardDelete}
      />

      {newCardBoardId && (
        <CrmNewCardModal
          open={!!newCardBoardId}
          boardId={newCardBoardId}
          onClose={() => setNewCardBoardId(null)}
          onCreated={handleCardCreated}
        />
      )}
    </div>
  );
}
