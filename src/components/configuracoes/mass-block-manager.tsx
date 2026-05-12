"use client";

import { useState, useEffect } from "react";
import { X, Plus, Ban, Loader2, Save, UserX, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeBrazilianPhone } from "@/lib/phone-normalize";

type BlockedContact = {
  phone: string;
  name?: string;
};

export function MassBlockManager() {
  const [blockedContacts, setBlockedContacts] = useState<BlockedContact[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ai-config")
      .then((r) => r.json())
      .then((j) => {
        const rawBlocked = j.data?.blockedNumbers;
        if (rawBlocked) {
          try {
            const parsed = typeof rawBlocked === "string" 
              ? JSON.parse(rawBlocked) 
              : rawBlocked;
            setBlockedContacts(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            console.error("Error parsing blockedNumbers:", e);
            setBlockedContacts([]);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const addContact = () => {
    const cleanPhone = normalizeBrazilianPhone(newPhone);
    if (!cleanPhone) {
      toast.error("O número de telefone é obrigatório.");
      return;
    }
    if (blockedContacts.find((c) => c.phone === cleanPhone)) {
      toast.error("Este número já está na lista.");
      return;
    }
    setBlockedContacts([...blockedContacts, { phone: cleanPhone, name: newName.trim() || undefined }]);
    setNewPhone("");
    setNewName("");
  };

  const removeContact = (phone: string) => {
    setBlockedContacts(blockedContacts.filter((c) => c.phone !== phone));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedNumbers: blockedContacts }),
      });
      if (res.ok) {
        toast.success("Lista de bloqueio atualizada!");
      } else {
        toast.error("Erro ao salvar.");
      }
    } catch {
      toast.error("Falha na conexão.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-300" />
        <p className="mt-2 text-sm text-gray-400">Carregando configurações...</p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-red-100 shadow-sm overflow-hidden">
      <div className="h-1 bg-red-500 w-full" />
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <UserX className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Bloqueio em Massa (IA)</CardTitle>
            <CardDescription className="text-xs">
              Pessoas nesta lista não serão criadas como leads e a IA não responderá.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="5511999998888"
                className="pl-9 h-10 bg-white border-gray-200 focus:ring-red-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Nome (Opcional)</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Dr. Fulano (Sócio)"
                className="pl-9 h-10 bg-white border-gray-200 focus:ring-red-500"
              />
            </div>
          </div>
          <div className="flex items-end pb-0.5">
            <Button onClick={addContact} variant="default" className="bg-gray-900 hover:bg-black h-10 px-4">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Contatos Bloqueados ({blockedContacts.length})
            </h4>
          </div>
          
          <div className={cn(
            "rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-[300px] overflow-y-auto",
            blockedContacts.length === 0 && "bg-gray-50 border-dashed p-8 text-center"
          )}>
            {blockedContacts.length === 0 ? (
              <div className="space-y-2">
                <Ban className="h-8 w-8 text-gray-200 mx-auto" />
                <p className="text-sm text-gray-400">Nenhum contato na lista negra.</p>
              </div>
            ) : (
              blockedContacts.map((contact) => (
                <div key={contact.phone} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold text-xs shrink-0">
                      {contact.name ? contact.name[0].toUpperCase() : <Phone className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {contact.name || "Sem nome"}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        {contact.phone}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeContact(contact.phone)}
                    className="h-8 w-8 text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 italic max-w-[200px]">
            * Lembre-se de clicar em salvar para aplicar as alterações.
          </p>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white min-w-[140px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Lista
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
