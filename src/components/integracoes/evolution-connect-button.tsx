"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function EvolutionConnectButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/integrations/evolution/status", { cache: "no-store" });
        const data = await res.json();
        if (data?.connected) {
          setConnected(true);
          stopPolling();
        }
      } catch {
        // ignora falhas de polling
      }
    }, 4000);
  }

  async function fetchConnect(withNumber?: string) {
    setLoading(true);
    setError(null);
    setQrcode(null);
    setPairingCode(null);
    try {
      const url = withNumber
        ? `/api/integrations/evolution/connect?number=${encodeURIComponent(withNumber)}`
        : "/api/integrations/evolution/connect";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao conectar com a Evolution API.");
        return;
      }
      setQrcode(data.qrcode ?? null);
      setPairingCode(data.pairingCode ?? null);
      if (data.connectionStatus === "open") {
        setConnected(true);
      } else {
        startPolling();
      }
      if (!data.qrcode && !data.pairingCode && data.connectionStatus !== "open") {
        setError(`A Evolution API não retornou QR code nem código de pareamento. Resposta: ${JSON.stringify(data)}`);
      }
    } catch {
      setError("Falha na requisição.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    setConnected(false);
    setQrcode(null);
    setPairingCode(null);
    setError(null);
    fetchConnect();
  }

  function handleClose() {
    setOpen(false);
    stopPolling();
  }

  useEffect(() => () => stopPolling(), []);

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={handleOpen}>
        <QrCode className="h-3.5 w-3.5" />
        Conectar WhatsApp
      </Button>

      <Modal open={open} onClose={handleClose} title="Conectar WhatsApp via Evolution API">
        <div className="space-y-4">
          {connected ? (
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>WhatsApp conectado com sucesso!</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="break-all">{error}</span>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                </div>
              )}

              {!loading && qrcode && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-gray-500 text-center">
                    Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho e escaneie o código abaixo.
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrcode} alt="QR Code do WhatsApp" className="w-64 h-64 border border-gray-200 rounded-lg" />
                </div>
              )}

              {!loading && pairingCode && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-gray-500 text-center">
                    No WhatsApp do celular: Aparelhos conectados → Conectar com número de telefone → digite o código:
                  </p>
                  <p className="text-2xl font-bold tracking-widest text-gray-900">{pairingCode}</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs text-gray-500">
                  Prefere conectar pelo número de telefone (sem QR code)? Informe o número com DDI/DDD:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="5511999999999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Button size="sm" disabled={loading || !phone.trim()} onClick={() => fetchConnect(phone)}>
                    Gerar código
                  </Button>
                </div>
              </div>

              <Button size="sm" variant="ghost" className="gap-1.5 w-full" disabled={loading} onClick={() => fetchConnect()}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar QR Code
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
