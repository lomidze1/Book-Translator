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
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.getNotifications(
      req.user.id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.notificationService.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    await this.notificationService.markAsRead(req.user.id, id);
    return { success: true };
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req: any) {
    await this.notificationService.markAllAsRead(req.user.id);
    return { success: true };
  }

  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.notificationService.getOrCreatePreferences(req.user.id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Request() req: any,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationService.updatePreferences(req.user.id, dto);
  }

  @Post('push/subscribe')
  async subscribePush(
    @Request() req: any,
    @Body() dto: SubscribePushDto,
  ) {
    return this.notificationService.subscribePush(req.user.id, dto);
  }

  @Delete('push/unsubscribe')
  async unsubscribePush(
    @Request() req: any,
    @Body('endpoint') endpoint: string,
  ) {
    await this.notificationService.unsubscribePush(req.user.id, endpoint);
    return { success: true };
  }
}
