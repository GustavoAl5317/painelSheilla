"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CalendarDays, Clock, User, Trash2, Pencil, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Appointment = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  durationMinutes: number;
  status: "SCHEDULED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  notifyClient: boolean;
  reminderSent: boolean;
  client: { id: string; name: string; phone: string | null } | null;
  process: { id: string; number: string | null; title: string | null } | null;
  createdBy: { id: string; name: string } | null;
};

type Client = { id: string; name: string; phone: string | null };

const STATUS_CONFIG = {
  SCHEDULED: { label: "Agendado", color: "bg-blue-100 text-blue-700" },
  CONFIRMED: { label: "Confirmado", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Cancelado", color: "bg-red-100 text-red-700" },
  COMPLETED: { label: "Concluído", color: "bg-gray-100 text-gray-600" },
};

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTimePT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const EMPTY_FORM = {
  title: "", description: "", date: "", time: "09:00",
  durationMinutes: "60", clientId: "", processId: "", notifyClient: true,
};

export function AgendaShell({ initialClients }: { initialClients: Client[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(viewYear, viewMonth, 1).toISOString();
      const to = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
      const j = await res.json();
      setAppointments(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }

  function openCreate(day?: Date) {
    setEditTarget(null);
    const d = day ?? today;
    setForm({
      ...EMPTY_FORM,
      date: toLocalDateStr(d),
    });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(appt: Appointment) {
    setEditTarget(appt);
    const d = new Date(appt.date);
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    setForm({
      title: appt.title,
      description: appt.description ?? "",
      date: toLocalDateStr(d),
      time: `${hours}:${mins}`,
      durationMinutes: String(appt.durationMinutes),
      clientId: appt.client?.id ?? "",
      processId: appt.process?.id ?? "",
      notifyClient: appt.notifyClient,
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.time) return;
    setSaving(true);
    setError(null);

    const dateISO = new Date(`${form.date}T${form.time}:00`).toISOString();
    const payload = {
      title: form.title,
      description: form.description || undefined,
      date: dateISO,
      durationMinutes: parseInt(form.durationMinutes) || 60,
      clientId: form.clientId || undefined,
      processId: form.processId || undefined,
      notifyClient: form.notifyClient,
    };

    try {
      const url = editTarget ? `/api/appointments/${editTarget.id}` : "/api/appointments";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Erro ao salvar");
        return;
      }
      setModalOpen(false);
      fetchAppointments();
    } catch {
      setError("Falha na requisição.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este agendamento?")) return;
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    fetchAppointments();
  }

  async function handleStatusChange(id: string, status: Appointment["status"]) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchAppointments();
  }

  // Calendário
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calCells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  const appointmentsByDay = new Map<string, Appointment[]>();
  for (const appt of appointments) {
    const key = toLocalDateStr(new Date(appt.date));
    if (!appointmentsByDay.has(key)) appointmentsByDay.set(key, []);
    appointmentsByDay.get(key)!.push(appt);
  }

  const selectedDayStr = selectedDay ? toLocalDateStr(selectedDay) : null;
  const selectedAppts = selectedDayStr ? (appointmentsByDay.get(selectedDayStr) ?? []) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
            <CalendarDays className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {appointments.filter(a => a.status === "SCHEDULED" || a.status === "CONFIRMED").length} agendamento(s) neste mês
            </p>
            <p className="text-xs text-gray-400">Gerencie sua agenda</p>
          </div>
        </div>
        <Button size="sm" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" /> Novo Agendamento
        </Button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
        {/* Calendário */}
        <div className="lg:w-96 shrink-0 bg-white border-r border-gray-100 flex flex-col">
          {/* Nav mês */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="h-4 w-4 text-gray-500" />
            </button>
            <p className="text-sm font-semibold text-gray-900">
              {MONTHS_PT[viewMonth]} {viewYear}
            </p>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS_PT.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-semibold text-gray-400 uppercase">
                {d}
              </div>
            ))}
          </div>

          {/* Células */}
          <div className="grid grid-cols-7 flex-1">
            {calCells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[52px]" />;
              const key = toLocalDateStr(day);
              const dayAppts = appointmentsByDay.get(key) ?? [];
              const isToday = isSameDay(day, today);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "min-h-[52px] flex flex-col items-center pt-1.5 pb-1 gap-0.5 border border-transparent transition-all hover:bg-gray-50",
                    isSelected && "bg-blue-50 border-blue-200 rounded-lg",
                    isToday && !isSelected && "bg-blue-600/5"
                  )}
                >
                  <span className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday && "bg-blue-600 text-white",
                    !isToday && "text-gray-700"
                  )}>
                    {day.getDate()}
                  </span>
                  {dayAppts.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap justify-center px-0.5">
                      {dayAppts.slice(0, 3).map((a, ai) => (
                        <div
                          key={ai}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            a.status === "CANCELLED" ? "bg-red-400" :
                            a.status === "COMPLETED" ? "bg-gray-400" :
                            a.status === "CONFIRMED" ? "bg-green-400" : "bg-blue-400"
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel lateral direito */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 lg:p-6">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando agendamentos...</p>
          ) : selectedDay ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-900">
                  {selectedDay.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </p>
                <Button size="sm" variant="outline" onClick={() => openCreate(selectedDay)}>
                  <Plus className="h-3.5 w-3.5" /> Agendar neste dia
                </Button>
              </div>
              {selectedAppts.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarDays className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Nenhum agendamento neste dia</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedAppts
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(appt => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
                Próximos agendamentos
              </p>
              {appointments.filter(a =>
                new Date(a.date) >= today &&
                (a.status === "SCHEDULED" || a.status === "CONFIRMED")
              ).length === 0 ? (
                <div className="text-center py-16">
                  <CalendarDays className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-sm text-gray-400">Nenhum agendamento próximo</p>
                  <p className="text-xs text-gray-300 mt-1">Clique em um dia ou em "Novo Agendamento"</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments
                    .filter(a =>
                      new Date(a.date) >= today &&
                      (a.status === "SCHEDULED" || a.status === "CONFIRMED")
                    )
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(appt => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? "Editar Agendamento" : "Novo Agendamento"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ag-title">Título *</Label>
            <Input
              id="ag-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Consulta inicial, Audiência..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ag-date">Data *</Label>
              <Input
                id="ag-date"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-time">Hora *</Label>
              <Input
                id="ag-time"
                type="time"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-duration">Duração (minutos)</Label>
            <select
              id="ag-duration"
              value={form.durationMinutes}
              onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="30">30 min</option>
              <option value="60">1 hora</option>
              <option value="90">1h30</option>
              <option value="120">2 horas</option>
              <option value="180">3 horas</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-client">Cliente</Label>
            <select
              id="ag-client"
              value={form.clientId}
              onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sem cliente</option>
              {initialClients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-desc">Descrição / Observações</Label>
            <textarea
              id="ag-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detalhes do agendamento..."
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.notifyClient}
              onChange={e => setForm(f => ({ ...f, notifyClient: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Notificar cliente por WhatsApp (lembrete automático)</span>
          </label>

          {editTarget && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2 flex-wrap">
                {(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({ ...f }))}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                      STATUS_CONFIG[s].color
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={saving || !form.title.trim() || !form.date || !form.time}>
              {saving ? "Salvando..." : editTarget ? "Salvar alterações" : "Criar agendamento"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AppointmentCard({
  appt, onEdit, onDelete, onStatusChange,
}: {
  appt: Appointment;
  onEdit: (a: Appointment) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: Appointment["status"]) => void;
}) {
  const cfg = STATUS_CONFIG[appt.status];
  const isPast = new Date(appt.date) < new Date() && appt.status === "SCHEDULED";

  return (
    <div className={cn(
      "bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all",
      isPast && "border-amber-200"
    )}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{appt.title}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {formatDateTimePT(appt.date)}
            </span>
            <span className="text-xs text-gray-400">{appt.durationMinutes} min</span>
          </div>
        </div>
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0", cfg.color)}>
          {cfg.label}
        </span>
      </div>

      {appt.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2">{appt.description}</p>
      )}

      {appt.client && (
        <div className="flex items-center gap-1.5 mb-2">
          <User className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-600 font-medium">{appt.client.name}</span>
          {appt.notifyClient && (
            <Bell className="h-3 w-3 text-blue-400" />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
        {appt.status === "SCHEDULED" && (
          <button
            onClick={() => onStatusChange(appt.id, "CONFIRMED")}
            className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-700 font-medium transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
          </button>
        )}
        {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && (
          <>
            <button
              onClick={() => onStatusChange(appt.id, "COMPLETED")}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
            </button>
            <button
              onClick={() => onStatusChange(appt.id, "CANCELLED")}
              className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancelar
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onEdit(appt)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(appt.id)}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
