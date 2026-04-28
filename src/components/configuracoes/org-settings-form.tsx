"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Clock, MessageSquare, Save, CheckCircle2, Loader2 } from "lucide-react";

interface OrgData {
  name: string;
  email: string;
  phone: string | null;
  primaryColor: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  defaultGreeting: string | null;
}

export function OrgSettingsForm({ initial }: { initial: OrgData }) {
  const [form, setForm] = useState({
    name: initial.name,
    email: initial.email,
    phone: initial.phone ?? "",
    primaryColor: initial.primaryColor,
    businessHoursStart: initial.businessHoursStart,
    businessHoursEnd: initial.businessHoursEnd,
    defaultGreeting: initial.defaultGreeting ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      setError(data.error ?? "Erro ao salvar.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Dados do escritório */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
              <Building2 className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-sm">Dados do escritório</CardTitle>
              <CardDescription className="text-xs">Informações exibidas para seus clientes</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do escritório</Label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail de contato</Label>
              <Input
                value={form.email}
                type="email"
                onChange={e => set("email", e.target.value)}
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor principal</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={e => set("primaryColor", e.target.value)}
                  className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <Input
                  value={form.primaryColor}
                  onChange={e => set("primaryColor", e.target.value)}
                  className="font-mono text-sm h-9"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Horário */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-sm">Horário de atendimento</CardTitle>
              <CardDescription className="text-xs">A IA só responde dentro deste horário</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <Input
                type="time"
                value={form.businessHoursStart}
                onChange={e => set("businessHoursStart", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Término</Label>
              <Input
                type="time"
                value={form.businessHoursEnd}
                onChange={e => set("businessHoursEnd", e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mensagens padrão */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
              <MessageSquare className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-sm">Mensagens padrão</CardTitle>
              <CardDescription className="text-xs">Enviada quando um lead entra em contato</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs">Saudação inicial</Label>
            <textarea
              value={form.defaultGreeting}
              onChange={e => set("defaultGreeting", e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#95304e]/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Botão salvar */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Salvo com sucesso
          </div>
        )}
        <Button
          onClick={save}
          disabled={saving}
          className="gap-2 text-white font-semibold"
          style={{ backgroundColor: "#95304e" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
