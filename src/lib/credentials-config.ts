// Apenas definições de config — sem imports de Node.js.
// Pode ser importado tanto por Client Components quanto por Server Components.

export type CredentialKey =
  | "ZAPI_INSTANCE"
  | "ZAPI_TOKEN"
  | "ZAPI_CLIENT_TOKEN"
  | "ZAPI_PHONE"
  | "EVOLUTION_API_URL"
  | "EVOLUTION_API_KEY"
  | "EVOLUTION_INSTANCE"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "WEBHOOK_SECRET"
  | "TRAMITACAO_API_KEY"
  | "TRAMITACAO_API_URL"
  | "TRELLO_KEY"
  | "TRELLO_TOKEN"
  | "TRELLO_BOARD_ID"
  | "TRELLO_LIST_ID"
  | "DJEN_OAB"
  | "PJE_LOGIN"
  | "PJE_SENHA";

export interface CredentialMeta {
  key: CredentialKey;
  label: string;
  description: string;
  placeholder: string;
  type: "text" | "password" | "url";
  group: string;
  requiresPlan?: "PRO" | "PREMIUM" | "ENTERPRISE";
  envFallback?: string;
}

export const CREDENTIAL_DEFINITIONS: CredentialMeta[] = [
  {
    key: "ZAPI_INSTANCE",
    label: "Instance ID",
    description: "Identificador único da instância Z-API",
    placeholder: "Ex: 3AXXXXXXXXXX",
    type: "text",
    group: "WhatsApp — Z-API",
    envFallback: "ZAPI_DEFAULT_INSTANCE",
  },
  {
    key: "ZAPI_TOKEN",
    label: "Token",
    description: "Token de autenticação da instância Z-API",
    placeholder: "Ex: abc123def456...",
    type: "password",
    group: "WhatsApp — Z-API",
    envFallback: "ZAPI_DEFAULT_TOKEN",
  },
  {
    key: "ZAPI_CLIENT_TOKEN",
    label: "Client-Token (Security Token)",
    description: "Security Token do painel Z-API (aba Segurança). Obrigatório em contas com segurança ativada.",
    placeholder: "Ex: Fb6a...",
    type: "password",
    group: "WhatsApp — Z-API",
    envFallback: "ZAPI_DEFAULT_CLIENT_TOKEN",
  },
  {
    key: "ZAPI_PHONE",
    label: "Número WhatsApp",
    description: "Número conectado na instância (com DDI, sem +)",
    placeholder: "Ex: 5511999990000",
    type: "text",
    group: "WhatsApp — Z-API",
  },
  {
    key: "EVOLUTION_API_URL",
    label: "URL da API",
    description: "Endereço do servidor Evolution API",
    placeholder: "https://api.seudominio.com",
    type: "url",
    group: "WhatsApp — Evolution API",
    envFallback: "EVOLUTION_API_URL",
  },
  {
    key: "EVOLUTION_API_KEY",
    label: "API Key",
    description: "Chave de autenticação do servidor Evolution",
    placeholder: "Ex: abc123...",
    type: "password",
    group: "WhatsApp — Evolution API",
    envFallback: "EVOLUTION_API_KEY",
  },
  {
    key: "EVOLUTION_INSTANCE",
    label: "Nome da Instância",
    description: "Nome da instância criada no Evolution API",
    placeholder: "Ex: meu-escritorio",
    type: "text",
    group: "WhatsApp — Evolution API",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key",
    description: "Chave própria da OpenAI. Se não configurada, o sistema usa a chave global do servidor.",
    placeholder: "sk-proj-...",
    type: "password",
    group: "Inteligência Artificial",
    envFallback: "OPENAI_API_KEY",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    description: "Chave própria da Anthropic (Claude). Se não configurada, usa a chave global do servidor.",
    placeholder: "sk-ant-...",
    type: "password",
    group: "Inteligência Artificial",
    envFallback: "ANTHROPIC_API_KEY",
  },
  {
    key: "WEBHOOK_SECRET",
    label: "Webhook Secret",
    description: "Token para validar requisições de entrada no webhook WhatsApp",
    placeholder: "Ex: minha-chave-secreta",
    type: "password",
    group: "Segurança",
  },
  {
    key: "TRAMITACAO_API_KEY",
    label: "API Key",
    description: "Chave de autenticação da sua conta na Tramitação Inteligente",
    placeholder: "Bearer token da TI",
    type: "password",
    group: "Tramitação Inteligente",
  },
  {
    key: "TRAMITACAO_API_URL",
    label: "URL da API (opcional)",
    description: "URL base da API da TI. Deixe em branco para usar o padrão.",
    placeholder: "https://planilha.tramitacaointeligente.com.br/api/v1",
    type: "url",
    group: "Tramitação Inteligente",
  },
  {
    key: "DJEN_OAB",
    label: "Número(s) OAB",
    description:
      "Número(s) OAB para monitorar no DJEN. Formato: 397243SP (separe múltiplos por vírgula). Se não houver credencial no banco, use a variável de ambiente DJEN_OAB.",
    placeholder: "Ex: 397243SP,123456RJ",
    type: "text",
    group: "DJEN — Diário da Justiça",
    envFallback: "DJEN_OAB",
  },
  {
    key: "PJE_LOGIN",
    label: "Login PJe",
    description: "CPF ou e-mail de acesso ao portal PJe (usado para buscar publicações autenticadas via comunicaapi.pje.jus.br).",
    placeholder: "Ex: 000.000.000-00 ou email@oab.org.br",
    type: "text",
    group: "DJEN — Diário da Justiça",
    envFallback: "PJE_LOGIN",
  },
  {
    key: "PJE_SENHA",
    label: "Senha PJe",
    description: "Senha de acesso ao portal PJe.",
    placeholder: "Sua senha do PJe",
    type: "password",
    group: "DJEN — Diário da Justiça",
    envFallback: "PJE_SENHA",
  },
  {
    key: "TRELLO_KEY",
    label: "API Key",
    description: "Chave da API Trello (obtida em trello.com/app-key)",
    placeholder: "Trello API Key",
    type: "password",
    group: "Trello",
    envFallback: "TRELLO_KEY",
  },
  {
    key: "TRELLO_TOKEN",
    label: "Token",
    description: "Token de autorização do Trello",
    placeholder: "Trello Token",
    type: "password",
    group: "Trello",
    envFallback: "TRELLO_TOKEN",
  },
  {
    key: "TRELLO_BOARD_ID",
    label: "ID do Board",
    description: "ID do quadro Trello onde os cards serão criados",
    placeholder: "Ex: 5e8f8f8f8f8f8f8f8f8f8f8f",
    type: "text",
    group: "Trello",
    envFallback: "TRELLO_BOARD_ID",
  },
  {
    key: "TRELLO_LIST_ID",
    label: "ID da Lista",
    description: "ID da lista Trello onde novos cards serão inseridos",
    placeholder: "Ex: 5e8f8f8f8f8f8f8f8f8f8f8f",
    type: "text",
    group: "Trello",
    envFallback: "TRELLO_LIST_ID",
  },
];

export const CREDENTIAL_GROUPS = [...new Set(CREDENTIAL_DEFINITIONS.map((c) => c.group))];
