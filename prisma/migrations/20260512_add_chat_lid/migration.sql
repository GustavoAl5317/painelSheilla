-- Adiciona chatLid para guardar o identificador LID (privacidade do WhatsApp)
-- separado do número real de telefone.
ALTER TABLE "Conversation" ADD COLUMN "chatLid" TEXT;

-- Backfill: se phoneNumber atualmente contém '@lid', move para chatLid e
-- limpa phoneNumber (será preenchido com o número real assim que o webhook
-- receber a próxima mensagem do contato).
UPDATE "Conversation"
SET "chatLid" = "phoneNumber",
    "phoneNumber" = ''
WHERE "phoneNumber" LIKE '%@lid';

-- Conversas LID ficam com phoneNumber='' até receber a próxima mensagem.
-- Para não violar o unique (organizationId, phoneNumber) quando houver
-- múltiplas conversas LID na mesma org, usamos cuid temporário.
UPDATE "Conversation"
SET "phoneNumber" = 'lid:' || id
WHERE "phoneNumber" = '' AND "chatLid" IS NOT NULL;

CREATE UNIQUE INDEX "Conversation_organizationId_chatLid_key"
  ON "Conversation"("organizationId", "chatLid");
