-- DropForeignKey
ALTER TABLE "AudioChapter" DROP CONSTRAINT "AudioChapter_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "TranslatedChapter" DROP CONSTRAINT "TranslatedChapter_chapterId_fkey";

-- AddForeignKey
ALTER TABLE "TranslatedChapter" ADD CONSTRAINT "TranslatedChapter_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioChapter" ADD CONSTRAINT "AudioChapter_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
