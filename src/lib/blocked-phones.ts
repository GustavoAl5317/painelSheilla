export type BlockedEntry = { phone?: string | null } | string | null | undefined;

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isPhoneBlocked(list: unknown, phoneNumber: string): boolean {
  if (!Array.isArray(list)) return false;
  const target = digits(phoneNumber);
  if (!target) return false;
  return list.some((item: BlockedEntry) => {
    const raw = typeof item === "string" ? item : item?.phone;
    const p = digits(raw);
    if (!p) return false;
    if (p === target) return true;
    return p.length >= 8 && target.length >= 8 && (p.endsWith(target) || target.endsWith(p));
  });
}
