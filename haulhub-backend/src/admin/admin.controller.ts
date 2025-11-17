import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  Lorry,
  VerifyLorryDto,
  User,
  VerifyUserDto,
} from '@haulhub/shared';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/dashboard
   * Get admin dashboard summary
   * This endpoint demonstrates role-based access control
   * Only Admin users can access this route
   */
  @Roles(UserRole.Admin)
  @Get('dashboard')
  async getDashboard(@CurrentUser() user: CurrentUserData) {
    return {
      message: 'Admin dashboard',
      adminUser: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
      // Additional dashboard data will be implemented in later tasks
    };
  }

  /**
   * GET /admin/lorries/pending
   * Get all pending lorry verifications
   * Requirements: 12.1
   */
  @Roles(UserRole.Admin)
  @Get('lorries/pending')
  async getPendingLorries(): Promise<Lorry[]> {
    return this.adminService.getPendingLorries();
  }

  /**
   * PATCH /admin/lorries/:id/verify
   * Approve, reject, or request more evidence for a lorry
   * Requirements: 12.2, 12.3, 12.4, 12.5
   */
  @Roles(UserRole.Admin)
  @Patch('lorries/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyLorry(
    @Param('id') lorryId: string,
    @Body() dto: VerifyLorryDto,
  ): Promise<Lorry> {
    return this.adminService.verifyLorry(lorryId, dto);
  }

  /**
   * GET /admin/users/pending
   * Get all pending user verifications
   * Requirements: 13.1
   */
  @Roles(UserRole.Admin)
  @Get('users/pending')
  async getPendingUsers(): Promise<User[]> {
    return this.adminService.getPendingUsers();
  }

  /**
   * PATCH /admin/users/:id/verify
   * Verify or reject a user
   * Requirements: 13.2, 13.3, 13.4, 13.5
   */
  @Roles(UserRole.Admin)
  @Patch('users/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyUser(
    @Param('id') userId: string,
    @Body() dto: VerifyUserDto,
  ): Promise<User> {
    return this.adminService.verifyUser(userId, dto);
  }
}
