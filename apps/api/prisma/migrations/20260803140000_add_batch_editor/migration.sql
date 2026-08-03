-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "editorBatchId" TEXT,
ADD COLUMN     "editorBatchStatus" TEXT;

-- AlterTable
ALTER TABLE "TranslatedChapter" ADD COLUMN     "segments" JSONB;
