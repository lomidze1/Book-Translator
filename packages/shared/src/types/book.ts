export type FileFormat = 'PDF' | 'EPUB' | 'TXT' | 'DOCX';

export interface Book {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  isbn: string | null;
  coverUrl: string | null;
  language: string;
  pageCount: number | null;
  fileUrl: string | null;
  fileHash: string | null;
  format: FileFormat | null;
  googleBooksId: string | null;
  openLibraryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserBookType = 'UPLOADED' | 'PURCHASED_ORIGINAL' | 'PURCHASED_TRANSLATION';

export interface UserBook {
  id: string;
  userId: string;
  bookId: string;
  type: UserBookType;
  createdAt: Date;
}
