import { pusherServer } from "@/lib/pusher";

export async function emit(orgId: string, event: string, data: unknown) {
  try {
    await pusherServer.trigger(`org-${orgId}`, event, data);
  } catch (err) {
    console.error("[pusher] trigger failed:", err);
  }
}

export function subscribe(_orgId: string, _ctrl: any) {}
export function unsubscribe(_orgId: string, _ctrl: any) {}
