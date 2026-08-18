-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "sourceChars" INTEGER;
