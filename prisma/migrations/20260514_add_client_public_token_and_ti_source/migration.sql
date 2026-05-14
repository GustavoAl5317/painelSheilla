-- Adiciona token público para a página de acompanhamento do cliente
ALTER TABLE "Client" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "Client_publicToken_key" ON "Client"("publicToken");

-- Adiciona source TRAMITACAO_INTELIGENTE ao enum CaseCardEntrySource
ALTER TYPE "CaseCardEntrySource" ADD VALUE 'TRAMITACAO_INTELIGENTE';
