"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Check, X, Loader2, Shield, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CREDENTIAL_DEFINITIONS, CREDENTIAL_GROUPS, type CredentialKey } from "@/lib/credentials-config";
import { cn } from "@/lib/utils";

type ConfiguredMap = Record<string, { configured: boolean; updatedAt?: Date }>;

interface CredentialsManagerProps {
  orgPlan: string;
}

export function CredentialsManager({ orgPlan }: CredentialsManagerProps) {
  const [configured, setConfigured] = useState<ConfiguredMap>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "WhatsApp — Z-API": true,
  });
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);

  const planOrder: Record<string, number> = { STARTER: 0, PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };

  function isUnlocked(requiresPlan?: string) {
    if (!requiresPlan) return true;
    return (planOrder[orgPlan] ?? 0) >= (planOrder[requiresPlan] ?? 99);
  }

  useEffect(() => {
    fetch("/api/credentials", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        setDbAvailable(true);
        const map: ConfiguredMap = {};
        for (const item of res.data ?? []) {
          map[item.key] = { configured: true, updatedAt: item.updatedAt };
        }
        setConfigured(map);
      })
      .catch(() => {
        setDbAvailable(false);
      });
  }, []);

  function toggleGroup(group: string) {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }

  async function handleSave(key: CredentialKey) {
    const value = values[key]?.trim();
    if (!value) {
      setErrors((p) => ({ ...p, [key]: "Informe o valor antes de salvar." }));
      return;
    }
    setErrors((p) => ({ ...p, [key]: "" }));
    setSaving((p) => ({ ...p, [key]: true }));

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) throw new Error();

      setConfigured((p) => ({ ...p, [key]: { configured: true, updatedAt: new Date() } }));
      setValues((p) => ({ ...p, [key]: "" }));
      setSaved((p) => ({ ...p, [key]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2500);
    } catch {
      setErrors((p) => ({ ...p, [key]: "Erro ao salvar. Verifique a conexão com o banco." }));
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleRemove(key: CredentialKey) {
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await fetch(`/api/credentials/${key}`, { method: "DELETE", credentials: "include" });
      setConfigured((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    } catch {
      setErrors((p) => ({ ...p, [key]: "Erro ao remover." }));
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <div className="space-y-3">
      {/* Banner sem banco */}
      {dbAvailable === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Banco de dados não conectado</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Configure o <code className="font-mono bg-amber-100 px-1 rounded">DATABASE_URL</code> no{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">.env</code> para salvar credenciais. A visualização abaixo é uma prévia.
            </p>
          </div>
        </div>
      )}

      {/* Grupos de credenciais */}
      {CREDENTIAL_GROUPS.map((group) => {
        const defs = CREDENTIAL_DEFINITIONS.filter((d) => d.group === group);
        const isOpen = openGroups[group] ?? false;
        const configuredCount = defs.filter((d) => configured[d.key]?.configured).length;

        return (
          <div key={group} className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Header do grupo */}
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
                  <Shield className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{group}</p>
                  <p className="text-xs text-gray-400">
                    {configuredCount}/{defs.length} variável(is) configurada(s)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {configuredCount > 0 && (
                  <Badge variant="success">{configuredCount} ativa(s)</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Campos */}
            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50/50 divide-y divide-gray-100">
                {defs.map((def) => {
                  const unlocked = isUnlocked(def.requiresPlan);
                  const isConfigured = configured[def.key]?.configured;
                  const isLoading = saving[def.key];
                  const isSaved = saved[def.key];
                  const error = errors[def.key];
                  const isHidden = !visible[def.key];

                  return (
                    <div key={def.key} className={cn("p-4", !unlocked && "opacity-50 pointer-events-none")}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs font-semibold text-gray-700">{def.label}</Label>
                            {def.requiresPlan && (
                              <Badge variant="secondary" className="text-[10px] py-0">{def.requiresPlan}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{def.description}</p>
                        </div>
                        {isConfigured && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            <span className="text-xs text-green-600 font-medium">Configurada</span>
                          </div>
                        )}
                      </div>

                      {isConfigured ? (
                        // Variável já configurada — mostra opção de sobrescrever ou remover
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-2 h-9 rounded-lg border border-green-200 bg-green-50 px-3">
                            <span className="text-xs text-green-600 font-mono">••••••••••••</span>
                            <span className="text-xs text-gray-400 ml-auto">
                              Salva {configured[def.key]?.updatedAt
                                ? new Intl.DateTimeFormat("pt-BR").format(new Date(configured[def.key].updatedAt!))
                                : ""}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-xs shrink-0"
                            onClick={() => setConfigured((p) => {
                              const next = { ...p };
                              delete next[def.key];
                              return next;
                            })}
                          >
                            Alterar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => handleRemove(def.key)}
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      ) : (
                        // Novo valor para configurar
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={def.type === "password" && isHidden ? "password" : "text"}
                              placeholder={def.placeholder}
                              value={values[def.key] ?? ""}
                              onChange={(e) => {
                                setValues((p) => ({ ...p, [def.key]: e.target.value }));
                                setErrors((p) => ({ ...p, [def.key]: "" }));
                              }}
                              className={cn(
                                "h-9 text-sm pr-9",
                                error && "border-red-300 focus-visible:ring-red-400"
                              )}
                            />
                            {def.type === "password" && (
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setVisible((p) => ({ ...p, [def.key]: !p[def.key] }))}
                              >
                                {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="h-9 shrink-0"
                            onClick={() => handleSave(def.key)}
                            disabled={isLoading || !values[def.key]?.trim()}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isSaved ? (
                              <Check className="h-3.5 w-3.5 text-white" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                        </div>
                      )}

                      {error && (
                        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
                        </p>
                      )}

                      {/* Fallback de env */}
                      {def.envFallback && !isConfigured && (
                        <p className="text-[11px] text-gray-400 mt-1.5">
                          Fallback global:{" "}
                          <code className="font-mono bg-gray-100 px-1 rounded">{def.envFallback}</code>{" "}
                          — se não configurada aqui, o sistema usará o valor do servidor.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
