import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ReaderService } from './reader.service';
import {
  SaveProgressDto,
  CreateBookmarkDto,
  CreateHighlightDto,
  CreateNoteDto,
  UpdateHighlightDto,
  UpdateNoteDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reader')
@UseGuards(JwtAuthGuard)
export class ReaderController {
  constructor(private readonly readerService: ReaderService) {}

  // ========================
  // Reading Progress
  // ========================

  @Post('progress')
  saveProgress(
    @CurrentUser() user: { id: string },
    @Body() dto: SaveProgressDto,
  ) {
    return this.readerService.saveProgress(user.id, dto);
  }

  @Get('progress/:bookId')
  getProgress(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
  ) {
    return this.readerService.getProgress(user.id, bookId);
  }

  // ========================
  // Bookmarks
  // ========================

  @Post('bookmarks')
  createBookmark(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBookmarkDto,
  ) {
    return this.readerService.createBookmark(user.id, dto);
  }

  @Get('bookmarks/:bookId')
  getBookmarks(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.readerService.getBookmarks(user.id, bookId, page, limit);
  }

  @Delete('bookmarks/:id')
  deleteBookmark(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.readerService.deleteBookmark(user.id, id);
  }

  // ========================
  // Highlights
  // ========================

  @Post('highlights')
  createHighlight(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateHighlightDto,
  ) {
    return this.readerService.createHighlight(user.id, dto);
  }

  @Get('highlights/:bookId')
  getHighlights(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.readerService.getHighlights(user.id, bookId, page, limit);
  }

  @Patch('highlights/:id')
  updateHighlight(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.readerService.updateHighlight(user.id, id, dto);
  }

  @Delete('highlights/:id')
  deleteHighlight(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.readerService.deleteHighlight(user.id, id);
  }

  // ========================
  // Notes
  // ========================

  @Post('notes')
  createNote(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNoteDto,
  ) {
    return this.readerService.createNote(user.id, dto);
  }

  @Get('notes/:bookId')
  getNotes(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.readerService.getNotes(user.id, bookId, page, limit);
  }

  @Patch('notes/:id')
  updateNote(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.readerService.updateNote(user.id, id, dto);
  }

  @Delete('notes/:id')
  deleteNote(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.readerService.deleteNote(user.id, id);
  }
}
