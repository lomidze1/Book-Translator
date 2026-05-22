import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationService.getNotifications(userId, page, limit);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.notificationService.markAsRead(userId, id);
    return { success: true };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationService.markAllAsRead(userId);
    return { success: true };
  }

  @Get('preferences')
  async getPreferences(@CurrentUser('id') userId: string) {
    return this.notificationService.getOrCreatePreferences(userId);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationService.updatePreferences(userId, dto);
  }

  @Post('push/subscribe')
  async subscribePush(
    @CurrentUser('id') userId: string,
    @Body() dto: SubscribePushDto,
  ) {
    return this.notificationService.subscribePush(userId, dto);
  }

  @Delete('push/unsubscribe')
  async unsubscribePush(
    @CurrentUser('id') userId: string,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.notificationService.unsubscribePush(userId, dto.endpoint);
    return { success: true };
  }
}
