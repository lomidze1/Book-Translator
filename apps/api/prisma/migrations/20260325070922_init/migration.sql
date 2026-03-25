-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "AudioBook_bookId_idx" ON "AudioBook"("bookId");

-- CreateIndex
CREATE INDEX "AudioBook_translationId_idx" ON "AudioBook"("translationId");

-- CreateIndex
CREATE INDEX "AudioBook_status_idx" ON "AudioBook"("status");

-- CreateIndex
CREATE INDEX "AudioChapter_audioBookId_idx" ON "AudioChapter"("audioBookId");

-- CreateIndex
CREATE INDEX "AudioChapter_status_idx" ON "AudioChapter"("status");

-- CreateIndex
CREATE INDEX "Book_googleBooksId_idx" ON "Book"("googleBooksId");

-- CreateIndex
CREATE INDEX "Book_openLibraryId_idx" ON "Book"("openLibraryId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_idx" ON "Bookmark"("userId");

-- CreateIndex
CREATE INDEX "Bookmark_bookId_idx" ON "Bookmark"("bookId");

-- CreateIndex
CREATE INDEX "Highlight_userId_idx" ON "Highlight"("userId");

-- CreateIndex
CREATE INDEX "Highlight_bookId_idx" ON "Highlight"("bookId");

-- CreateIndex
CREATE INDEX "Note_userId_idx" ON "Note"("userId");

-- CreateIndex
CREATE INDEX "Note_bookId_idx" ON "Note"("bookId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_idx" ON "ReadingProgress"("userId");

-- CreateIndex
CREATE INDEX "TranslatedChapter_translationId_idx" ON "TranslatedChapter"("translationId");

-- CreateIndex
CREATE INDEX "TranslatedChapter_chapterId_idx" ON "TranslatedChapter"("chapterId");

-- CreateIndex
CREATE INDEX "Translation_bookId_idx" ON "Translation"("bookId");

-- CreateIndex
CREATE INDEX "Translation_status_idx" ON "Translation"("status");

-- CreateIndex
CREATE INDEX "UserBook_userId_idx" ON "UserBook"("userId");

-- CreateIndex
CREATE INDEX "UserBook_bookId_idx" ON "UserBook"("bookId");
