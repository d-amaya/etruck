import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Current User Interface
 * Represents the authenticated user extracted from JWT token
 */
export interface CurrentUserData {
  userId: string;
  email: string;
  role: string;
  username: string;
  carrierId?: string;
  nationalId?: string;
}

/**
 * Current User Decorator
 * Extracts the current authenticated user from the request
 * 
 * @example
 * async getProfile(@CurrentUser() user: CurrentUserData) {
 *   return this.usersService.getProfile(user.userId);
 * }
 * 
 * @example
 * // Extract specific property
 * async getProfile(@CurrentUser('userId') userId: string) {
 *   return this.usersService.getProfile(userId);
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Return specific property if requested
    if (data) {
      return user?.[data];
    }

    // Return entire user object
    return user;
  },
);
