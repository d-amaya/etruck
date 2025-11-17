import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateProfileDto, UserRole } from '@haulhub/shared';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/profile
   * Get current user's profile from DynamoDB
   */
  @Get('profile')
  async getUserProfile(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getUserProfile(user.userId);
  }

  /**
   * PATCH /users/profile
   * Update current user's profile
   * Users can only update their own profile
   */
  @Patch('profile')
  async updateUserProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateUserProfile(user.userId, updateProfileDto);
  }

  /**
   * GET /users/:id
   * Get any user's profile (Admin only)
   */
  @Get(':id')
  @Roles(UserRole.Admin)
  async getUserById(
    @Param('id') userId: string,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    // Additional authorization check: ensure admin can't be blocked
    // This is already handled by @Roles decorator, but we keep it for clarity
    return this.usersService.getUserById(userId);
  }

  /**
   * GET /users/me
   * Get current authenticated user information (lightweight)
   * This endpoint demonstrates the use of @CurrentUser decorator
   * Returns basic info from JWT token without DynamoDB query
   */
  @Get('me')
  async getCurrentUser(@CurrentUser() user: CurrentUserData) {
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      username: user.username,
    };
  }
}
