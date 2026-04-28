import { pusherServer } from "@/lib/pusher";

const pusherConfigured = !!(
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER
);

export async function emit(orgId: string, event: string, data: unknown) {
  if (!pusherConfigured) return;
  try {
    await pusherServer.trigger(`org-${orgId}`, event, data);
  } catch (err) {
    console.error("[pusher] trigger failed:", err);
  }
}

export function subscribe(_orgId: string, _ctrl: any) {}
export function unsubscribe(_orgId: string, _ctrl: any) {}
