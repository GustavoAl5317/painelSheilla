import Pusher from "pusher";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PusherServer = (Pusher as any).default ?? Pusher;

export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
}) as Pusher;
