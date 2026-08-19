import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { clampPagination } from '../common/pagination';
import {
  SaveProgressDto,
  CreateBookmarkDto,
  CreateHighlightDto,
  CreateNoteDto,
  UpdateHighlightDto,
  UpdateNoteDto,
} from './dto';

@Injectable()
export class ReaderService {
  private readonly logger = new Logger(ReaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ========================
  // Reading Progress
  // ========================

  async saveProgress(userId: string, dto: SaveProgressDto) {
    await this.validateBookAccess(userId, dto.bookId);

    return this.prisma.readingProgress.upsert({
      where: {
        userId_bookId: { userId, bookId: dto.bookId },
      },
      update: {
        currentChapter: dto.currentChapter,
        currentPosition: dto.currentPosition,
        percentage: dto.percentage,
        lastReadAt: new Date(),
      },
      create: {
        userId,
        bookId: dto.bookId,
        currentChapter: dto.currentChapter,
        currentPosition: dto.currentPosition,
        percentage: dto.percentage,
      },
    });
  }

  async getProgress(userId: string, bookId: string) {
    return this.prisma.readingProgress.findUnique({
      where: {
        userId_bookId: { userId, bookId },
      },
    });
  }

  // ========================
  // Bookmarks
  // ========================

  async createBookmark(userId: string, dto: CreateBookmarkDto) {
    await this.validateBookAccess(userId, dto.bookId);

    try {
      return await this.prisma.bookmark.create({
        data: {
          userId,
          bookId: dto.bookId,
          chapterNumber: dto.chapterNumber,
          position: dto.position,
          label: dto.label,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('ეს bookmark უკვე არსებობს');
      }
      throw error;
    }
  }

  async getBookmarks(userId: string, bookId: string, page = 1, limit = 100) {
    const { skip, take } = clampPagination(page, limit);
    return this.prisma.bookmark.findMany({
      where: { userId, bookId },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    });
  }

  async deleteBookmark(userId: string, id: string) {
    await this.assertOwnership(
      () => this.prisma.bookmark.findUnique({ where: { id } }),
      userId,
      'Bookmark ვერ მოიძებნა',
      'არ გაქვთ ამ bookmark-ის წაშლის უფლება',
    );
    return this.prisma.bookmark.delete({ where: { id } });
  }

  // ========================
  // Highlights
  // ========================

  async createHighlight(userId: string, dto: CreateHighlightDto) {
    await this.validateBookAccess(userId, dto.bookId);

    if (dto.startPosition >= dto.endPosition) {
      throw new BadRequestException('startPosition უნდა იყოს endPosition-ზე ნაკლები');
    }

    return this.prisma.highlight.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapterNumber: dto.chapterNumber,
        startPosition: dto.startPosition,
        endPosition: dto.endPosition,
        selectedText: dto.selectedText,
        color: dto.color || 'yellow',
      },
    });
  }

  async getHighlights(userId: string, bookId: string, page = 1, limit = 100) {
    const { skip, take } = clampPagination(page, limit);
    return this.prisma.highlight.findMany({
      where: { userId, bookId },
      include: { notes: true },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    });
  }

  async updateHighlight(userId: string, id: string, dto: UpdateHighlightDto) {
    await this.assertOwnership(
      () => this.prisma.highlight.findUnique({ where: { id } }),
      userId,
      'Highlight ვერ მოიძებნა',
      'არ გაქვთ ამ highlight-ის რედაქტირების უფლება',
    );
    return this.prisma.highlight.update({
      where: { id },
      data: { color: dto.color },
    });
  }

  async deleteHighlight(userId: string, id: string) {
    await this.assertOwnership(
      () => this.prisma.highlight.findUnique({ where: { id } }),
      userId,
      'Highlight ვერ მოიძებნა',
      'არ გაქვთ ამ highlight-ის წაშლის უფლება',
    );
    return this.prisma.highlight.delete({ where: { id } });
  }

  // ========================
  // Notes
  // ========================

  async createNote(userId: string, dto: CreateNoteDto) {
    await this.validateBookAccess(userId, dto.bookId);

    if (dto.highlightId) {
      const highlight = await this.assertOwnership(
        () => this.prisma.highlight.findUnique({ where: { id: dto.highlightId } }),
        userId,
        'Highlight ვერ მოიძებნა',
        'არ გაქვთ ამ highlight-ზე შენიშვნის დამატების უფლება',
      );

      // The highlight must be anchored in the same book as the note.
      if (highlight.bookId !== dto.bookId) {
        throw new BadRequestException('Highlight სხვა წიგნს ეკუთვნის');
      }
    }

    return this.prisma.note.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapterNumber: dto.chapterNumber,
        highlightId: dto.highlightId,
        content: dto.content,
      },
    });
  }

  async getNotes(userId: string, bookId: string, page = 1, limit = 100) {
    const { skip, take } = clampPagination(page, limit);
    return this.prisma.note.findMany({
      where: { userId, bookId },
      include: { highlight: true },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    });
  }

  async updateNote(userId: string, id: string, dto: UpdateNoteDto) {
    await this.assertOwnership(
      () => this.prisma.note.findUnique({ where: { id } }),
      userId,
      'შენიშვნა ვერ მოიძებნა',
      'არ გაქვთ ამ შენიშვნის რედაქტირების უფლება',
    );
    return this.prisma.note.update({
      where: { id },
      data: { content: dto.content },
    });
  }

  async deleteNote(userId: string, id: string) {
    await this.assertOwnership(
      () => this.prisma.note.findUnique({ where: { id } }),
      userId,
      'შენიშვნა ვერ მოიძებნა',
      'არ გაქვთ ამ შენიშვნის წაშლის უფლება',
    );
    return this.prisma.note.delete({ where: { id } });
  }

  // ========================
  // Helpers
  // ========================

  /**
   * Load an owned entity or throw. Centralizes the repetitive
   *   findUnique → NotFound → ForbiddenIfNotOwner
   * pattern used by every mutation on bookmarks/highlights/notes.
   */
  private async assertOwnership<T extends { userId: string }>(
    finder: () => Promise<T | null>,
    userId: string,
    notFoundMessage: string,
    forbiddenMessage: string,
  ): Promise<T> {
    const entity = await finder();
    if (!entity) throw new NotFoundException(notFoundMessage);
    if (entity.userId !== userId) throw new ForbiddenException(forbiddenMessage);
    return entity;
  }

  /**
   * The book must exist AND the user must have a UserBook relation to it
   * (uploaded or purchased) — otherwise any authenticated user could
   * annotate arbitrary bookIds.
   */
  private async validateBookAccess(userId: string, bookId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true },
    });

    if (!book) {
      throw new NotFoundException('წიგნი ვერ მოიძებნა');
    }

    const userBook = await this.prisma.userBook.findFirst({
      where: { userId, bookId },
      select: { id: true },
    });

    if (!userBook) {
      throw new ForbiddenException('ამ წიგნზე წვდომა არ გაქვთ');
    }
  }
}
