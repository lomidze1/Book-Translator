import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AdminListQueryDto,
  AdminPaymentsQueryDto,
  AdminTranslationsQueryDto,
  UpdateUserRoleDto,
} from './dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Post('users/:id/verify-email')
  verifyUserEmail(@Param('id') id: string) {
    return this.adminService.verifyUserEmail(id);
  }

  @Get('translations')
  listTranslations(@Query() query: AdminTranslationsQueryDto) {
    return this.adminService.listTranslations(query);
  }

  @Post('translations/:id/retry')
  retryTranslation(@Param('id') id: string) {
    return this.adminService.retryTranslation(id);
  }

  @Get('payments')
  listPayments(@Query() query: AdminPaymentsQueryDto) {
    return this.adminService.listPayments(query);
  }
}
