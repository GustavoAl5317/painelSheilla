"use client";

import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Appointment = {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  status: string;
  client: { id: string; name: string } | null;
};

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  clientName?: string;
}

const EMPTY_FORM = { title: "", description: "", date: "", time: "09:00", durationMinutes: "60", notifyClient: true };

export function AgendaModalChat({ open, onClose, clientId, clientName }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [step, setStep] = useState<"calendar" | "form">("calendar");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("calendar");
    setSelectedDay(null);
    setSuccess(false);
    setError(null);
    fetchAppointments();
  }, [open, viewYear, viewMonth]);

  async function fetchAppointments() {
    const from = new Date(viewYear, viewMonth, 1).toISOString();
    const to = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();
    const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
    const j = await res.json();
    setAppointments(j.data ?? []);
  }

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

  function selectDay(day: Date) {
    setSelectedDay(day);
    setForm(f => ({ ...f, date: toLocalDateStr(day) }));
    setStep("form");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.time) return;
    setSaving(true);
    setError(null);

    const dateISO = new Date(`${form.date}T${form.time}:00`).toISOString();
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          date: dateISO,
          durationMinutes: parseInt(form.durationMinutes) || 60,
          clientId: clientId || undefined,
          notifyClient: form.notifyClient,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Erro ao criar agendamento");
        return;
      }
      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); }, 1800);
    } catch {
      setError("Falha na requisição.");
    } finally {
      setSaving(false);
    }
  }

  // Calendário
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calCells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  const appointmentsByDay = new Map<string, number>();
  for (const appt of appointments) {
    const key = toLocalDateStr(new Date(appt.date));
    appointmentsByDay.set(key, (appointmentsByDay.get(key) ?? 0) + 1);
  }

  const selectedDayAppts = selectedDay
    ? appointments.filter(a => isSameDay(new Date(a.date), selectedDay))
    : [];

  return (
    <Modal open={open} onClose={onClose} title="Marcar Agenda" className="max-w-md">
      {success ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CalendarDays className="h-7 w-7 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Agendamento criado!</p>
          {clientName && (
            <p className="text-xs text-gray-400 text-center">
              O cliente {clientName} será notificado por WhatsApp antes do horário.
            </p>
          )}
        </div>
      ) : step === "calendar" ? (
        <div>
          {clientName && (
            <p className="text-xs text-blue-600 font-medium mb-4 bg-blue-50 px-3 py-2 rounded-lg">
              Cliente: {clientName}
            </p>
          )}

          {/* Nav mês */}
          <div className="flex items-center justify-between mb-3">
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
          <div className="grid grid-cols-7 mb-1">
            {DAYS_PT.map(d => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold text-gray-400">
                {d}
              </div>
            ))}
          </div>

          {/* Células */}
          <div className="grid grid-cols-7 gap-0.5">
            {calCells.map((day, i) => {
              if (!day) return <div key={i} className="h-9" />;
              const key = toLocalDateStr(day);
              const count = appointmentsByDay.get(key) ?? 0;
              const isToday = isSameDay(day, today);
              const isPast = day < today && !isToday;
              return (
                <button
                  key={i}
                  disabled={isPast}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "h-9 flex flex-col items-center justify-center rounded-lg transition-all",
                    isPast ? "opacity-30 cursor-not-allowed" : "hover:bg-blue-50 cursor-pointer",
                    isToday && "bg-blue-600/10 font-bold"
                  )}
                >
                  <span className={cn(
                    "text-xs",
                    isToday ? "text-blue-700 font-bold" : "text-gray-700"
                  )}>
                    {day.getDate()}
                  </span>
                  {count > 0 && (
                    <div className="h-1 w-1 rounded-full bg-blue-400 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 text-center mt-4">
            Clique em um dia para agendar
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <button
            type="button"
            onClick={() => setStep("calendar")}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium mb-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar ao calendário
          </button>

          <div className="bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />
            <p className="text-sm font-medium text-blue-700">
              {selectedDay?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>

          {selectedDayAppts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Já agendado neste dia:
              </p>
              {selectedDayAppts.map(a => (
                <div key={a.id} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                  <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">{a.title}</span>
                  <span className="text-[10px] text-amber-500 ml-auto">
                    {new Date(a.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="chat-ag-title">Título *</Label>
            <Input
              id="chat-ag-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Consulta, Audiência, Reunião..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chat-ag-time">Hora *</Label>
              <Input
                id="chat-ag-time"
                type="time"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chat-ag-dur">Duração</Label>
              <select
                id="chat-ag-dur"
                value={form.durationMinutes}
                onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="30">30 min</option>
                <option value="60">1 hora</option>
                <option value="90">1h30</option>
                <option value="120">2 horas</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chat-ag-desc">Observações</Label>
            <textarea
              id="chat-ag-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detalhes do agendamento..."
              rows={2}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {clientId && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.notifyClient}
                onChange={e => setForm(f => ({ ...f, notifyClient: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">Avisar {clientName ?? "cliente"} por WhatsApp</span>
            </label>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !form.title.trim() || !form.time}
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Salvando..." : "Confirmar agendamento"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
