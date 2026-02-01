import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../../../src/auth/guards/jwt-auth.guard';
import { AuthService } from '../../../../src/auth/auth.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: AuthService;
  let reflector: Reflector;

  const mockAuthService = {
    validateToken: jest.fn(),
    getUserDetailsByUsername: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    authService = module.get<AuthService>(AuthService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (authHeader?: string): ExecutionContext => {
    const mockRequest = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  describe('canActivate', () => {
    it('should allow access to public routes', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockExecutionContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockAuthService.validateToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authorization header is missing'),
      );
    });

    it('should throw UnauthorizedException when authorization header format is invalid', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockExecutionContext('InvalidFormat');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });

    it('should validate token and attach user to request', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:groups': ['Dispatcher'],
        'cognito:username': 'testuser',
      };
      mockAuthService.validateToken.mockResolvedValue(mockPayload);
      mockAuthService.getUserDetailsByUsername.mockResolvedValue({
        email: 'test@example.com',
        carrierId: 'carrier-123',
        nationalId: 'NAT-123',
      });

      const context = createMockExecutionContext('Bearer valid-token');
      const request = context.switchToHttp().getRequest();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockAuthService.validateToken).toHaveBeenCalledWith('valid-token');
      expect(mockAuthService.getUserDetailsByUsername).toHaveBeenCalledWith('user-123');
      expect(request.user).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Dispatcher',
        username: 'testuser',
        carrierId: 'carrier-123',
        nationalId: 'NAT-123',
      });
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      mockAuthService.validateToken.mockRejectedValue(error);

      const context = createMockExecutionContext('Bearer expired-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Access token has expired'),
      );
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      mockAuthService.validateToken.mockRejectedValue(error);

      const context = createMockExecutionContext('Bearer invalid-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('should throw generic UnauthorizedException for other errors', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.validateToken.mockRejectedValue(new Error('Unknown error'));

      const context = createMockExecutionContext('Bearer token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Token validation failed'),
      );
    });
  });
});
