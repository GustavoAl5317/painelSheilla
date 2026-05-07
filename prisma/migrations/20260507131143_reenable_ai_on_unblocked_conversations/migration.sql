-- Reativa a IA em todas as conversas que não estão bloqueadas.
-- Garante que ao subir o deploy, todos os atendimentos tenham IA ativa por padrão.
UPDATE "Conversation"
SET "aiEnabled" = true
WHERE "isBlocked" = false;
