"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

const PRIMARY = "#95304e";
const PRIMARY_LIGHT = "rgba(149,48,78,0.12)";
const PRIMARY_MUTED = "#f5c6d0";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    setError("");
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("E-mail ou senha incorretos.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo — branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-14 text-white"
        style={{ backgroundColor: PRIMARY }}
      >
        {/* Identidade do escritório */}
        <div className="flex flex-col items-center gap-4">
          {/* Escudo decorativo */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <Scale className="h-10 w-10 text-white" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60 mb-1">
              Advocacia e Consultoria Jurídica
            </p>
            <h1 className="text-3xl font-bold tracking-wide">Sheila Araújo</h1>
            <div className="mt-3 h-px w-16 mx-auto" style={{ backgroundColor: PRIMARY_MUTED }} />
          </div>
        </div>

        {/* Frase central */}
        <div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Gerencie seu escritório com inteligência
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: PRIMARY_MUTED }}>
            CRM jurídico completo e atendimento automático pelo WhatsApp em um só lugar.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "Leads atendidos", value: "24/7" },
              { label: "Tempo economizado", value: "8h/dia" },
              { label: "Conversão média", value: "+40%" },
              { label: "Clientes satisfeitos", value: "100%" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl p-4"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm mt-1" style={{ color: PRIMARY_MUTED }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-center" style={{ color: PRIMARY_MUTED }}>
          © 2025 Sheila Araújo Advocacia. Todos os direitos reservados.
        </p>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            {/* Header mobile / desktop sem imagem */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: PRIMARY_LIGHT }}
              >
                <Scale className="h-7 w-7" style={{ color: PRIMARY }} />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.25em] mb-0.5"
                  style={{ color: PRIMARY }}
                >
                  Advocacia e Consultoria Jurídica
                </p>
                <p className="text-xl font-bold text-gray-900">Sheila Araújo</p>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900">Entrar na sua conta</h1>
            <p className="mt-1.5 text-sm text-gray-500">Acesse seu painel de gestão jurídica</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@escritorio.com.br"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full text-white font-semibold"
              style={{ backgroundColor: PRIMARY }}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
