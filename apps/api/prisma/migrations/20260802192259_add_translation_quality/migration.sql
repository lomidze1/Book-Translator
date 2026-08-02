-- AlterTable
ALTER TABLE "TranslatedChapter" ADD COLUMN     "qualityReport" JSONB;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "qualityReport" JSONB,
ADD COLUMN     "qualityScore" DOUBLE PRECISION;
