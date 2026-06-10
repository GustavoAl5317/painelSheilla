-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_replyToMessageId_key" ON "Message"("conversationId", "replyToMessageId");
