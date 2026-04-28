-- CreateEnum
CREATE TYPE "CaseCardEntrySource" AS ENUM ('COMMENT', 'DJEN', 'PJE', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "Deadline" DROP CONSTRAINT "Deadline_processId_fkey";

-- DropForeignKey
ALTER TABLE "Process" DROP CONSTRAINT "Process_clientId_fkey";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "processNumber" TEXT;

-- AlterTable
ALTER TABLE "Process" ALTER COLUMN "number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ClientCaseCard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "processId" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCaseCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseCardEntry" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" "CaseCardEntrySource" NOT NULL,
    "content" TEXT NOT NULL,
    "shareWithClient" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseCardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientCaseCard_clientId_key" ON "ClientCaseCard"("clientId");

-- CreateIndex
CREATE INDEX "ClientCaseCard_organizationId_idx" ON "ClientCaseCard"("organizationId");

-- CreateIndex
CREATE INDEX "ClientCaseCard_processId_idx" ON "ClientCaseCard"("processId");

-- CreateIndex
CREATE INDEX "CaseCardEntry_cardId_createdAt_idx" ON "CaseCardEntry"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientCaseCard" ADD CONSTRAINT "ClientCaseCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCaseCard" ADD CONSTRAINT "ClientCaseCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCaseCard" ADD CONSTRAINT "ClientCaseCard_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseCardEntry" ADD CONSTRAINT "CaseCardEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ClientCaseCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
