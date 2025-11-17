import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@haulhub/shared';

/**
 * Roles Decorator
 * Specifies which roles are allowed to access a route
 * 
 * @example
 * @Roles(UserRole.Admin)
 * @Roles(UserRole.Dispatcher, UserRole.Admin)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
