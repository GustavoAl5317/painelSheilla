import { Topbar } from "@/components/layout/topbar";
import { ChatShell } from "@/components/conversas/chat-shell";

export default function ConversasPage() {
  return (
    <div className="flex flex-col h-full">
      <Topbar title="Conversas WhatsApp" />
      <div className="flex-1 overflow-hidden">
        <ChatShell />
      </div>
    </div>
  );
}
