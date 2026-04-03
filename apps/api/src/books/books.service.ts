import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ParsingService } from '../parsing/parsing.service';
import { CreateBookDto, UpdateBookDto, SearchBooksDto, PaginationDto } from './dto';
import * as crypto from 'crypto';

const MIME_EXTENSION_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface ExternalBookResult {
  source: 'google' | 'openlibrary';
  title: string;
  author?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  language?: string;
  pageCount?: number;
  googleBooksId?: string;
  openLibraryId?: string;
  buyLinks?: { name: string; url: string }[];
  inDatabase?: boolean;
  translationAvailable?: boolean;
  databaseBookId?: string;
}

export interface SearchResult {
  external: ExternalBookResult[];
  database: any[];
  total: number;
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly parsing: ParsingService,
  ) {}

  // ========================
  // Search (Aggregated)
  // ========================

  async search(dto: SearchBooksDto): Promise<SearchResult> {
    const limit = Math.min(dto.limit || 10, 50);

    // Run all searches in parallel
    const [googleResults, openLibraryResults, dbResults] = await Promise.all([
      this.searchGoogleBooks(dto.q, limit),
      this.searchOpenLibrary(dto.q, limit),
      this.searchDatabase(dto.q),
    ]);

    // Merge and deduplicate external results by ISBN
    const externalMap = new Map<string, ExternalBookResult>();

    for (const book of googleResults) {
      const key = book.isbn || `google:${book.googleBooksId}`;
      externalMap.set(key, book);
    }

    for (const book of openLibraryResults) {
      const key = book.isbn || `ol:${book.openLibraryId}`;
      if (!externalMap.has(key)) {
        externalMap.set(key, book);
      }
    }

    // Mark which external books are already in our database (batch query)
    const external = Array.from(externalMap.values());
    const isbnList = external.map(b => b.isbn).filter((isbn): isbn is string => !!isbn);

    if (isbnList.length > 0) {
      const dbBooks = await this.prisma.book.findMany({
        where: { isbn: { in: isbnList } },
        include: { translations: { where: { status: 'COMPLETED' } } },
      });
      const bookMap = new Map(dbBooks.map(b => [b.isbn, b]));

      for (const book of external) {
        if (book.isbn) {
          const dbBook = bookMap.get(book.isbn);
          if (dbBook) {
            book.inDatabase = true;
            book.databaseBookId = dbBook.id;
            book.translationAvailable = dbBook.translations.length > 0;
          }
        }
      }
    }

    return {
      external: external.slice(0, limit),
      database: dbResults,
      total: external.length + dbResults.length,
    };
  }

  // ========================
  // Google Books API
  // ========================

  async searchGoogleBooks(query: string, limit: number): Promise<ExternalBookResult[]> {
    try {
      const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${limit}&langRestrict=en${apiKey ? `&key=${apiKey}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) return [];

      const data: any = await response.json();
      if (!data.items) return [];

      return data.items.map((item: any) => {
        const info = item.volumeInfo || {};
        const isbn = info.industryIdentifiers?.find(
          (id: any) => id.type === 'ISBN_13' || id.type === 'ISBN_10',
        )?.identifier;

        return {
          source: 'google' as const,
          title: info.title || 'Unknown',
          author: info.authors?.join(', '),
          description: info.description?.substring(0, 500),
          isbn,
          coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:'),
          language: info.language,
          pageCount: info.pageCount,
          googleBooksId: item.id,
          buyLinks: info.canonicalVolumeLink
            ? [{ name: 'Google Books', url: info.canonicalVolumeLink }]
            : [],
        };
      });
    } catch {
      return [];
    }
  }

  // ========================
  // Open Library API
  // ========================

  async searchOpenLibrary(query: string, limit: number): Promise<ExternalBookResult[]> {
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&language=eng`;

      const response = await fetch(url);
      if (!response.ok) return [];

      const data: any = await response.json();
      if (!data.docs) return [];

      return data.docs.map((doc: any) => {
        const coverId = doc.cover_i;
        return {
          source: 'openlibrary' as const,
          title: doc.title || 'Unknown',
          author: doc.author_name?.join(', '),
          description: doc.first_sentence?.join(' ')?.substring(0, 500),
          isbn: doc.isbn?.[0],
          coverUrl: coverId
            ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
            : undefined,
          language: 'en',
          pageCount: doc.number_of_pages_median,
          openLibraryId: doc.key,
          buyLinks: [],
        };
      });
    } catch {
      return [];
    }
  }

  // ========================
  // Database Search
  // ========================

  async searchDatabase(query: string) {
    // Sanitize and limit query length
    const sanitized = query.replace(/[%_\\]/g, '\\$&').slice(0, 200);

    return this.prisma.book.findMany({
      where: {
        OR: [
          { title: { contains: sanitized, mode: 'insensitive' } },
          { author: { contains: sanitized, mode: 'insensitive' } },
          { isbn: { contains: sanitized, mode: 'insensitive' } },
        ],
      },
      include: {
        translations: {
          where: { status: 'COMPLETED' },
          select: { id: true, targetLanguage: true },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================
  // CRUD
  // ========================

  async create(dto: CreateBookDto, fileHash?: string) {
    // Duplicate check by fileHash
    if (fileHash) {
      const existing = await this.prisma.book.findUnique({
        where: { fileHash },
      });
      if (existing) {
        throw new ConflictException({
          message: 'This book already exists in the database',
          bookId: existing.id,
          title: existing.title,
        });
      }
    }

    // Duplicate check by ISBN
    if (dto.isbn) {
      const existing = await this.prisma.book.findUnique({
        where: { isbn: dto.isbn },
      });
      if (existing) {
        throw new ConflictException({
          message: 'A book with this ISBN already exists',
          bookId: existing.id,
          title: existing.title,
        });
      }
    }

    return this.prisma.book.create({
      data: {
        ...dto,
        language: dto.language || 'en',
        fileHash,
      },
    });
  }

  async findAll(dto: PaginationDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        skip,
        take: limit,
        orderBy: { [dto.sortBy || 'createdAt']: dto.order || 'desc' },
        include: {
          translations: {
            select: { id: true, status: true, targetLanguage: true },
          },
          _count: { select: { userBooks: true } },
        },
      }),
      this.prisma.book.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        translations: {
          select: {
            id: true,
            status: true,
            targetLanguage: true,
            progress: true,
            completedAt: true,
          },
        },
        chapters: {
          select: { id: true, number: true, title: true, wordCount: true },
          orderBy: { number: 'asc' },
        },
        _count: { select: { userBooks: true } },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    return book;
  }

  async update(id: string, dto: UpdateBookDto, userId: string) {
    await this.findOne(id); // throws if not found
    await this.verifyOwnership(id, userId);

    return this.prisma.book.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id); // throws if not found
    await this.verifyOwnership(id, userId);

    return this.prisma.book.delete({
      where: { id },
    });
  }

  private async verifyOwnership(bookId: string, userId: string): Promise<void> {
    const userBook = await this.prisma.userBook.findFirst({
      where: { bookId, userId },
    });
    if (!userBook) {
      throw new ForbiddenException('ამ წიგნის რედაქტირების უფლება არ გაქვს');
    }
  }

  // ========================
  // File Upload
  // ========================

  async handleUpload(file: Express.Multer.File, userId?: string) {
    const fileHash = this.generateFileHash(file.buffer);

    // Check duplicate
    const existing = await this.prisma.book.findUnique({
      where: { fileHash },
      include: { translations: { where: { status: 'COMPLETED' } } },
    });

    if (existing) {
      return {
        duplicate: true,
        book: { id: existing.id },
        translationAvailable: existing.translations.length > 0,
        message: existing.translations.length > 0
          ? 'DUPLICATE_TRANSLATED'
          : 'DUPLICATE_EXISTS',
      };
    }

    // Detect format from extension
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    const formatMap: Record<string, string> = {
      '.pdf': 'PDF',
      '.epub': 'EPUB',
      '.txt': 'TXT',
      '.docx': 'DOCX',
    };

    // Sanitize filename for title: strip HTML, path traversal, special chars
    const sanitizedName = file.originalname
      .replace(/\.[^.]+$/, '')        // Remove extension
      .replace(/[<>"'&/\\]/g, '')     // Strip HTML/path chars
      .replace(/\.\./g, '')           // Strip path traversal
      .replace(/[_-]/g, ' ')          // Replace separators with spaces
      .trim() || 'Untitled';

    // Server-derived Content-Type (don't trust client MIME)
    const contentType = MIME_EXTENSION_MAP[ext] || 'application/octet-stream';

    // Create book record first to get ID
    const book = await this.prisma.book.create({
      data: {
        title: sanitizedName,
        originalFormat: formatMap[ext] as any || 'PDF',
        fileHash,
        fileSize: file.size,
        language: 'en',
      },
    });

    try {
      // Upload to S3 with server-derived Content-Type
      const s3Key = this.s3.generateBookKey(book.id, file.originalname);
      await this.s3.upload(s3Key, file.buffer, contentType);

      // Update book with S3 URL and optionally create UserBook
      const operations = [
        this.prisma.book.update({
          where: { id: book.id },
          data: { originalFileUrl: s3Key },
        }),
      ];

      if (userId) {
        operations.push(
          this.prisma.userBook.create({
            data: {
              userId,
              bookId: book.id,
              type: 'UPLOADED',
            },
          }) as any,
        );
      }

      await this.prisma.$transaction(operations);

      // Parse file to calculate pageCount (non-blocking — don't fail upload if parsing fails)
      try {
        const parsed = await this.parsing.parse(file.buffer, formatMap[ext] || 'PDF');
        const totalWords = parsed.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
        const pageCount = Math.max(1, Math.ceil(totalWords / 250));
        await this.prisma.book.update({
          where: { id: book.id },
          data: { pageCount },
        });
        this.logger.log(`Book ${book.id}: parsed ${parsed.chapters.length} chapters, ${totalWords} words, ~${pageCount} pages`);
      } catch (parseErr) {
        this.logger.warn(`Could not parse book for page count: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
      }
    } catch (error) {
      // Rollback: delete orphaned book record if S3 upload or DB fails
      await this.prisma.book.delete({ where: { id: book.id } }).catch(() => {});
      throw error;
    }

    return {
      duplicate: false,
      book,
      message: 'UPLOAD_SUCCESS',
    };
  }

  // ========================
  // Helpers
  // ========================

  generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
