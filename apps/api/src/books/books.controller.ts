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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { BooksService } from './books.service';
import { CreateBookDto, UpdateBookDto, SearchBooksDto, PaginationDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FileValidationPipe } from './upload/file-validation.pipe';

@Controller('books')
@UseGuards(JwtAuthGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('search')
  @Public()
  search(@Query() dto: SearchBooksDto) {
    return this.booksService.search(dto);
  }

  @Get()
  @Public()
  findAll(@Query() dto: PaginationDto) {
    return this.booksService.findAll(dto);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.booksService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Post('upload')
  @Public()
  @Throttle({ upload: { ttl: 900000, limit: 5 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @UploadedFile(new FileValidationPipe()) file: Express.Multer.File,
    @CurrentUser() user: { id: string } | undefined,
  ) {
    return this.booksService.handleUpload(file, user?.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.booksService.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.booksService.remove(id, user.id);
  }
}
