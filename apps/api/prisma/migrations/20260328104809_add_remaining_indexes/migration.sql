-- CreateIndex
CREATE INDEX "AudioChapter_chapterId_idx" ON "AudioChapter"("chapterId");

-- CreateIndex
CREATE INDEX "Chapter_bookId_idx" ON "Chapter"("bookId");

-- CreateIndex
CREATE INDEX "Note_highlightId_idx" ON "Note"("highlightId");

-- CreateIndex
CREATE INDEX "ReadingProgress_bookId_idx" ON "ReadingProgress"("bookId");
