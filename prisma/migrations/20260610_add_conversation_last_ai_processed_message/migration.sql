-- Guarda o id da última mensagem de cliente já processada pela IA, usado
-- como trava atômica para evitar respostas duplicadas em webhooks paralelos.
ALTER TABLE "Conversation" ADD COLUMN "lastAiProcessedMessageId" TEXT;
