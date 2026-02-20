import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';
import { UsersService } from './users.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('entities/resolve')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async resolveEntities(@Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids must be an array');
    }
    if (body.ids.length > 50) {
      throw new BadRequestException('Maximum 50 IDs per request');
    }
    return this.usersService.resolveEntities(body.ids);
  }

  @Get('users/subscriptions')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async getSubscriptions(@CurrentUser() user: any) {
    return this.usersService.getSubscriptions(user.userId);
  }

  @Patch('users/subscriptions')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async updateSubscriptions(
    @CurrentUser() user: any,
    @Body() body: {
      addAdminIds?: string[];
      removeAdminIds?: string[];
      addCarrierIds?: string[];
      removeCarrierIds?: string[];
    },
  ) {
    return this.usersService.updateSubscriptions(user.userId, body);
  }

  @Post('users/placeholder')
  @Roles(UserRole.Dispatcher)
  async createPlaceholder(
    @CurrentUser() user: any,
    @Body() body: { email: string; name: string; role: string },
  ) {
    if (!body.email || !body.name || !body.role) {
      throw new BadRequestException('email, name, and role are required');
    }
    const validRoles = [UserRole.Admin, UserRole.Carrier, UserRole.Driver];
    if (!validRoles.includes(body.role as UserRole)) {
      throw new BadRequestException('role must be Admin, Carrier, or Driver');
    }
    return this.usersService.createPlaceholderUser(
      user.userId,
      body.email,
      body.name,
      body.role as UserRole,
    );
  }
}
