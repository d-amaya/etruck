import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../../../../src/auth/guards/roles.guard';
import { UserRole } from '@haulhub/shared';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  describe('canActivate', () => {
    it('should allow access when no roles are required', () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockExecutionContext({ role: UserRole.Dispatcher });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when user has required role', () => {
      mockReflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
      const context = createMockExecutionContext({
        userId: 'user-123',
        role: UserRole.Admin,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', () => {
      mockReflector.getAllAndOverride.mockReturnValue([
        UserRole.Admin,
        UserRole.Dispatcher,
      ]);
      const context = createMockExecutionContext({
        userId: 'user-123',
        role: UserRole.Dispatcher,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      mockReflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
      const context = createMockExecutionContext({
        userId: 'user-123',
        role: UserRole.Dispatcher,
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied. Required roles: Admin'),
      );
    });

    it('should throw ForbiddenException when user role is missing', () => {
      mockReflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
      const context = createMockExecutionContext({
        userId: 'user-123',
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('User role information is missing'),
      );
    });

    it('should throw ForbiddenException when user is not attached to request', () => {
      mockReflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
      const context = createMockExecutionContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('User role information is missing'),
      );
    });

    it('should handle empty roles array', () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);
      const context = createMockExecutionContext({ role: UserRole.Dispatcher });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
