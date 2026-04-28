import { TrelloAdapter } from "./trello-adapter";
import { BitrixAdapter } from "./bitrix-adapter";
import type { CRMAdapter } from "./crm-adapter";
import { IntegrationType } from "@prisma/client";

export function getCRMAdapter(type: IntegrationType, config: Record<string, string>): CRMAdapter | null {
  switch (type) {
    case IntegrationType.TRELLO:
      return new TrelloAdapter({
        apiKey: config.apiKey,
        token: config.token,
        boardId: config.boardId,
        listId: config.listId,
      });
    case IntegrationType.BITRIX:
      return new BitrixAdapter({ webhookUrl: config.webhookUrl });
    default:
      return null;
  }
}

export { TrelloAdapter, BitrixAdapter };
export type { CRMAdapter };
