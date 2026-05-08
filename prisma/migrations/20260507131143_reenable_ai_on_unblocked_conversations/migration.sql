-- Reativa a IA em todas as conversas (sem WHERE em isBlocked pois a coluna pode não existir ainda no shadow DB).
-- isBlocked = false é o estado padrão, então UPDATE sem filtro é equivalente e seguro.
UPDATE "Conversation"
SET "aiEnabled" = true;
