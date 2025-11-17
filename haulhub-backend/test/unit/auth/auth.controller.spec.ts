import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import { UserRole } from '@haulhub/shared';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService) as jest.Mocked<AuthService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher,
    };

    it('should register a user successfully', async () => {
      const expectedResult = {
        message: 'User registered successfully. Please check your email for verification.',
        userId: 'user-123',
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expectedResult);
      expect(service.register).toHaveBeenCalledWith(registerDto);
      expect(service.register).toHaveBeenCalledTimes(1);
    });

    it('should pass DTO to service', async () => {
      mockAuthService.register.mockResolvedValue({
        message: 'Success',
        userId: 'user-123',
      });

      await controller.register(registerDto);

      expect(service.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully and return tokens', async () => {
      const expectedResult = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(service.login).toHaveBeenCalledWith(loginDto);
      expect(service.login).toHaveBeenCalledTimes(1);
    });

    it('should pass credentials to service', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 3600,
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User',
      });

      await controller.login(loginDto);

      expect(service.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('refresh', () => {
    const refreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should refresh token successfully', async () => {
      const expectedResult = {
        accessToken: 'new-access-token',
        expiresIn: 3600,
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      mockAuthService.refreshToken.mockResolvedValue(expectedResult);

      const result = await controller.refresh(refreshTokenDto);

      expect(result).toEqual(expectedResult);
      expect(service.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
      expect(service.refreshToken).toHaveBeenCalledTimes(1);
    });

    it('should pass refresh token to service', async () => {
      mockAuthService.refreshToken.mockResolvedValue({
        accessToken: 'new-token',
        expiresIn: 3600,
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User',
      });

      await controller.refresh(refreshTokenDto);

      expect(service.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
    });
  });

  describe('logout', () => {
    it('should logout successfully with valid authorization header', async () => {
      const expectedResult = { message: 'Logged out successfully' };
      mockAuthService.logout.mockResolvedValue(expectedResult);

      const result = await controller.logout('Bearer access-token');

      expect(result).toEqual(expectedResult);
      expect(service.logout).toHaveBeenCalledWith('access-token');
      expect(service.logout).toHaveBeenCalledTimes(1);
    });

    it('should extract token from Bearer format', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'Success' });

      await controller.logout('Bearer my-access-token');

      expect(service.logout).toHaveBeenCalledWith('my-access-token');
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      await expect(controller.logout(undefined)).rejects.toThrow(UnauthorizedException);
      await expect(controller.logout(undefined)).rejects.toThrow(
        'Authorization header is required',
      );
      expect(service.logout).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is empty after Bearer', async () => {
      await expect(controller.logout('Bearer ')).rejects.toThrow(UnauthorizedException);
      await expect(controller.logout('Bearer ')).rejects.toThrow(
        'Invalid authorization header format',
      );
      expect(service.logout).not.toHaveBeenCalled();
    });
  });
});
