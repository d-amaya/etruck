import { SetMetadata } from '@nestjs/common';

/**
 * Public Decorator
 * Marks a route as public (bypasses JWT authentication)
 * 
 * @example
 * @Public()
 * @Post('login')
 * async login(@Body() loginDto: LoginDto) {
 *   return this.authService.login(loginDto);
 * }
 */
export const Public = () => SetMetadata('isPublic', true);
