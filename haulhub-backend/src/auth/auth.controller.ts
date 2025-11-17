import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { AuthResponse, RefreshAuthResponse } from './interfaces/auth-response.interface';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Register a new user with role assignment
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<{ message: string; userId: string }> {
    return this.authService.register(registerDto);
  }

  /**
   * POST /auth/login
   * Authenticate user and return access and refresh tokens
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshAuthResponse> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  /**
   * POST /auth/logout
   * Invalidate user session and tokens
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authorization?: string): Promise<{ message: string }> {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    // Extract token from "Bearer <token>" format
    const token = authorization.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    return this.authService.logout(token);
  }
}
