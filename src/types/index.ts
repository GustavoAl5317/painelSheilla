import type {
  Organization,
  User,
  Lead,
  Client,
  Process,
  Deadline,
  Task,
  Notification,
  Conversation,
  Message,
  KanbanStage,
} from "@prisma/client";

export type { Organization, User, Lead, Client, Process, Deadline, Task, Notification, Conversation, Message, KanbanStage };

export type LeadWithRelations = Lead & {
  stage?: KanbanStage | null;
  assignedTo?: Pick<User, "id" | "name" | "avatar"> | null;
  conversations?: Conversation[];
  tasks?: Task[];
};

export type ConversationWithRelations = Conversation & {
  lead?: Pick<Lead, "id" | "name" | "phone"> | null;
  client?: Pick<Client, "id" | "name" | "phone"> | null;
  messages: Message[];
};

export type ProcessWithRelations = Process & {
  client: Pick<Client, "id" | "name" | "phone" | "email">;
  assignedTo?: Pick<User, "id" | "name"> | null;
  deadlines?: Deadline[];
};

export type DashboardStats = {
  newLeads: number;
  awaitingData: number;
  waitingResponse: number;
  nearDeadlines: number;
  overdueDeadlines: number;
  conversionRate: number;
  leadsBySource: { source: string; count: number }[];
  leadsByStage: { stage: string; count: number; color: string }[];
};

export type KanbanColumn = KanbanStage & {
  leads: LeadWithRelations[];
};

export type ApiResponse<T> = {
  data?: T;
  error?: string;
  message?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
