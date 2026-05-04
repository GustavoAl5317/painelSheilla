export type CrmPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface CrmActivity {
  id: string;
  cardId: string;
  userId?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string } | null;
}

export interface CrmCardData {
  id: string;
  title: string;
  description?: string | null;
  boardId: string;
  organizationId: string;
  order: number;
  dueDate?: string | null;
  priority?: CrmPriority;
  tags?: string[];
  processId?: string | null;
  clientId?: string | null;
  process?: { id: string; number: string | null; title: string | null } | null;
  client?: { id: string; name: string; phone?: string | null } | null;
  activities?: CrmActivity[];
  _count?: { activities: number };
  createdAt: string;
  updatedAt: string;
}

export interface CrmBoardData {
  id: string;
  name: string;
  slug: string;
  color: string;
  order: number;
  organizationId: string;
  cards: CrmCardData[];
}
