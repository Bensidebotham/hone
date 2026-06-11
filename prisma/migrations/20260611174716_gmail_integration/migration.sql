-- CreateEnum
CREATE TYPE "EmailOutcome" AS ENUM ('auto_applied', 'suggested', 'accepted', 'dismissed');

-- AlterEnum
ALTER TYPE "AppEventType" ADD VALUE 'email_detected';

-- CreateTable
CREATE TABLE "GmailConnection" (
    "userId" TEXT NOT NULL,
    "historyId" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "EmailInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "snippet" TEXT,
    "kind" TEXT NOT NULL,
    "suggestedStatus" "AppStatus",
    "applicationId" TEXT,
    "company" TEXT,
    "title" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "outcome" "EmailOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailInsight_messageId_key" ON "EmailInsight"("messageId");

-- CreateIndex
CREATE INDEX "EmailInsight_userId_outcome_idx" ON "EmailInsight"("userId", "outcome");

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailInsight" ADD CONSTRAINT "EmailInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailInsight" ADD CONSTRAINT "EmailInsight_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
