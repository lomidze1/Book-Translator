-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'RETRANSLATING', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "TranslationFeedback" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startPosition" INTEGER NOT NULL,
    "endPosition" INTEGER NOT NULL,
    "selectedText" TEXT NOT NULL,
    "comment" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationFeedback_translationId_idx" ON "TranslationFeedback"("translationId");
CREATE INDEX "TranslationFeedback_userId_idx" ON "TranslationFeedback"("userId");
CREATE INDEX "TranslationFeedback_status_idx" ON "TranslationFeedback"("status");
CREATE INDEX "TranslationFeedback_translationId_chapterId_idx" ON "TranslationFeedback"("translationId", "chapterId");

-- AddForeignKey
ALTER TABLE "TranslationFeedback" ADD CONSTRAINT "TranslationFeedback_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslationFeedback" ADD CONSTRAINT "TranslationFeedback_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslationFeedback" ADD CONSTRAINT "TranslationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
