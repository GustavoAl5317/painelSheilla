// Interface base que todos os adapters de CRM externo devem implementar.
// Cada integração (Trello, Bitrix, HubSpot...) é um módulo opcional por organização.

export interface CRMLeadPayload {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  legalArea?: string;
  caseSummary?: string;
  stage?: string;
  assignedTo?: string;
}

export interface CRMTaskPayload {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  assignedTo?: string;
  relatedLeadId?: string;
}

export interface CRMCommentPayload {
  entityId: string;
  author: string;
  content: string;
  createdAt: Date;
}

export interface CRMAdapter {
  name: string;

  createLead(lead: CRMLeadPayload): Promise<{ externalId: string }>;
  updateLead(externalId: string, lead: Partial<CRMLeadPayload>): Promise<void>;
  createTask(task: CRMTaskPayload): Promise<{ externalId: string }>;
  addComment(comment: CRMCommentPayload): Promise<void>;
  syncStatus(externalId: string): Promise<{ status: string } | null>;
}
