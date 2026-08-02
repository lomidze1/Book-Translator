-- CreateEnum
CREATE TYPE "PreviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "BookPreview" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL DEFAULT 'ka',
    "status" "PreviewStatus" NOT NULL DEFAULT 'PENDING',
    "sourceText" TEXT,
    "content" TEXT,
    "sourceWordCount" INTEGER,
    "chapterNumber" INTEGER,
    "tokensUsed" INTEGER,
    "aiModel" TEXT,
    "editorPass" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookPreview_requestedById_createdAt_idx" ON "BookPreview"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "BookPreview_status_idx" ON "BookPreview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BookPreview_bookId_targetLanguage_key" ON "BookPreview"("bookId", "targetLanguage");

-- AddForeignKey
ALTER TABLE "BookPreview" ADD CONSTRAINT "BookPreview_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookPreview" ADD CONSTRAINT "BookPreview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
