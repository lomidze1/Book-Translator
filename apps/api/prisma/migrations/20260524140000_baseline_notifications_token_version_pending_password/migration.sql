-- This migration backfills schema changes that landed in the codebase without
-- their own migration files: the notifications stack (preferences, in-app
-- notifications, web-push subscriptions), JWT token versioning for revoke-on-
-- password-change, the pending-password-change confirmation flow, the FAST/
-- STANDARD translation tier, payment amount precision tightening, and a batch
-- of read-path indexes (bookmark/highlight/note user+book composites, etc.).
-- Squashed into one named migration so fresh deploys converge to the schema
-- the live API actually expects.

-- CreateEnum
CREATE TYPE "TranslationType" AS ENUM ('FAST', 'STANDARD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TRANSLATION_COMPLETED', 'TTS_COMPLETED', 'PAYMENT_RECEIPT', 'SYSTEM');

-- DropIndex
DROP INDEX IF EXISTS "Payment_providerOrderId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Payment_userId_idx";

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "estimatedPrice" DECIMAL(10,2),
ADD COLUMN     "translationType" "TranslationType" NOT NULL DEFAULT 'FAST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingPasswordExpires" TIMESTAMP(3),
ADD COLUMN     "pendingPasswordHash" TEXT,
ADD COLUMN     "pendingPasswordToken" TEXT,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "translationCompleted" BOOLEAN NOT NULL DEFAULT true,
    "ttsCompleted" BOOLEAN NOT NULL DEFAULT true,
    "paymentReceipt" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "AudioChapter_audioBookId_chapterNumber_status_idx" ON "AudioChapter"("audioBookId", "chapterNumber", "status");

-- CreateIndex
CREATE INDEX "AudioChapter_audioBookId_status_idx" ON "AudioChapter"("audioBookId", "status");

-- CreateIndex
CREATE INDEX "Book_language_idx" ON "Book"("language");

-- CreateIndex
CREATE INDEX "Bookmark_userId_bookId_idx" ON "Bookmark"("userId", "bookId");

-- CreateIndex
CREATE INDEX "Highlight_userId_bookId_idx" ON "Highlight"("userId", "bookId");

-- CreateIndex
CREATE INDEX "Note_userId_bookId_idx" ON "Note"("userId", "bookId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_pendingPasswordToken_key" ON "User"("pendingPasswordToken");

-- CreateIndex
CREATE INDEX "User_pendingPasswordToken_pendingPasswordExpires_idx" ON "User"("pendingPasswordToken", "pendingPasswordExpires");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
