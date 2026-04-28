/**
 * Emitter simplificado (SSE desativado a pedido do usuário).
 * O sistema agora utiliza atualização manual via botão no painel.
 */
export async function emit(_orgId: string, _event: string, _data: unknown) {
  // No-op
}

export function subscribe(_orgId: string, _ctrl: any) {}
export function unsubscribe(_orgId: string, _ctrl: any) {}
