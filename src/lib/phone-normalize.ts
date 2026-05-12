/**
 * Normaliza números brasileiros para o formato 55DDXXXXXXXXX (12-13 dígitos, só dígitos).
 *
 * Regras:
 * - Contatos com @lid (privacidade WhatsApp) são mantidos como estão — os dígitos
 *   antes do @lid NÃO são o telefone real, então prefixar 55 produziria um número
 *   inválido. O envio continua usando o id LID original.
 * - Strings que não parecem telefone brasileiro (depois de remover não-dígitos)
 *   são retornadas como dígitos puros, sem o prefixo 55.
 */
export function normalizeBrazilianPhone(input: string | null | undefined): string {
  if (!input) return "";
  if (input.includes("@lid")) return input;

  const digits = input.replace(/\D/g, "");
  if (!digits) return "";

  // Já tem código de país BR (12-13 dígitos: 55 + DDD + 8/9)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Sem código de país: DDD (2) + número (8 ou 9) = 10 ou 11 dígitos
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}
