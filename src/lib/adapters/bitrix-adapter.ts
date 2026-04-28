import type { CRMAdapter, CRMLeadPayload, CRMTaskPayload, CRMCommentPayload } from "./crm-adapter";

interface BitrixConfig {
  webhookUrl: string; // Ex: https://seudominio.bitrix24.com.br/rest/1/token/
}

// Mock do Bitrix24 — substitua pelos endpoints reais quando ativar.
export class BitrixAdapter implements CRMAdapter {
  name = "Bitrix24";
  private config: BitrixConfig;

  constructor(config: BitrixConfig) {
    this.config = config;
  }

  async createLead(lead: CRMLeadPayload) {
    console.log(`[BitrixAdapter] Criando lead no Bitrix: ${lead.name}`);
    // POST {webhookUrl}crm.lead.add
    // body: { fields: { TITLE, PHONE, EMAIL, COMMENTS, SOURCE_ID } }
    return { externalId: `bitrix_${lead.id}` };
  }

  async updateLead(externalId: string, lead: Partial<CRMLeadPayload>) {
    console.log(`[BitrixAdapter] Atualizando lead ${externalId}:`, lead);
    // POST {webhookUrl}crm.lead.update?id={externalId}
  }

  async createTask(task: CRMTaskPayload) {
    console.log(`[BitrixAdapter] Criando tarefa: ${task.title}`);
    // POST {webhookUrl}tasks.task.add
    return { externalId: `bitrix_task_${task.id}` };
  }

  async addComment(comment: CRMCommentPayload) {
    console.log(`[BitrixAdapter] Adicionando comentário em ${comment.entityId}`);
    // POST {webhookUrl}crm.timeline.comment.add
  }

  async syncStatus(externalId: string) {
    console.log(`[BitrixAdapter] Sincronizando status de ${externalId}`);
    // POST {webhookUrl}crm.lead.get?id={externalId}
    return { status: "IN_PROCESS" };
  }
}
