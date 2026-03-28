-- CreateIndex
CREATE INDEX "Book_title_idx" ON "Book"("title");

-- CreateIndex
CREATE INDEX "Book_author_idx" ON "Book"("author");

-- CreateIndex
CREATE INDEX "Payment_providerOrderId_idx" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "Translation_bookId_status_idx" ON "Translation"("bookId", "status");

-- CreateIndex
CREATE INDEX "User_passwordResetToken_passwordResetExpires_idx" ON "User"("passwordResetToken", "passwordResetExpires");

-- CreateIndex
CREATE INDEX "User_emailVerificationToken_emailVerificationExpires_idx" ON "User"("emailVerificationToken", "emailVerificationExpires");
