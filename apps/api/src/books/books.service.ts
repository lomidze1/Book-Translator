import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookDto, UpdateBookDto, SearchBooksDto, PaginationDto } from './dto';
import * as crypto from 'crypto';

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
  constructor(private readonly prisma: PrismaService) {}

  // ========================
  // Search (Aggregated)
  // ========================

  async search(dto: SearchBooksDto): Promise<SearchResult> {
    const limit = dto.limit || 10;

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

    // Mark which external books are already in our database
    const external = Array.from(externalMap.values());
    for (const book of external) {
      if (book.isbn) {
        const dbBook = await this.prisma.book.findUnique({
          where: { isbn: book.isbn },
          include: { translations: { where: { status: 'COMPLETED' } } },
        });
        if (dbBook) {
          book.inDatabase = true;
          book.databaseBookId = dbBook.id;
          book.translationAvailable = dbBook.translations.length > 0;
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

      const data = await response.json();
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

      const data = await response.json();
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
    return this.prisma.book.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { author: { contains: query, mode: 'insensitive' } },
          { isbn: { contains: query, mode: 'insensitive' } },
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

  async update(id: string, dto: UpdateBookDto) {
    await this.findOne(id); // throws if not found

    return this.prisma.book.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // throws if not found

    return this.prisma.book.delete({
      where: { id },
    });
  }

  // ========================
  // Helpers
  // ========================

  generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
