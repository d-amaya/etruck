import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';

/**
 * JWT Authentication Guard
 * Validates Cognito JWT tokens and extracts user information
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    // Extract token from "Bearer <token>" format
    const token = this.extractTokenFromHeader(authHeader);
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      // Validate token and extract user information
      const payload = await this.authService.validateToken(token);

      // Extract role from cognito:groups (users are assigned to role-based groups)
      const groups = payload['cognito:groups'] || [];
      const role = groups.length > 0 ? groups[0] : null;

      // Get additional user details from Cognito using the sub (userId)
      // This ensures we have carrierId and nationalId on every request
      // For carriers, carrierId will be set to userId (self-reference) if it's a placeholder
      const userDetails = await this.authService.getUserDetailsByUsername(payload.sub);

      // Attach user information to request object
      request.user = {
        userId: payload.sub,
        email: userDetails.email,
        role: role,
        username: payload.username || payload['cognito:username'] || userDetails.email,
        carrierId: userDetails.carrierId,
        nationalId: userDetails.nationalId,
      };

      return true;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Access token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid access token');
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }

  private extractTokenFromHeader(authHeader: string): string | null {
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
