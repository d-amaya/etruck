import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../../../src/users/users.controller';
import { UsersService } from '../../../src/users/users.service';
import { UserRole, VerificationStatus } from '@haulhub/shared';
import { CurrentUserData } from '../../../src/auth/decorators/current-user.decorator';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  const mockUsersService = {
    getUserProfile: jest.fn(),
    updateUserProfile: jest.fn(),
    getUserById: jest.fn(),
  };

  const mockUser = {
    userId: 'user-123',
    email: 'test@example.com',
    fullName: 'Test User',
    phoneNumber: '+1234567890',
    role: UserRole.Dispatcher,
    verificationStatus: VerificationStatus.Verified,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockCurrentUser: CurrentUserData = {
    userId: 'user-123',
    email: 'test@example.com',
    role: UserRole.Dispatcher,
    username: 'testuser',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(require('../../../src/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../src/auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService) as jest.Mocked<UsersService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should get current user profile', async () => {
      mockUsersService.getUserProfile.mockResolvedValue(mockUser);

      const result = await controller.getUserProfile(mockCurrentUser);

      expect(result).toEqual(mockUser);
      expect(service.getUserProfile).toHaveBeenCalledWith('user-123');
    });
  });

  describe('updateUserProfile', () => {
    const updateDto = {
      fullName: 'Updated Name',
      phoneNumber: '+9876543210',
    };

    it('should update current user profile', async () => {
      const updatedUser = { ...mockUser, ...updateDto };
      mockUsersService.updateUserProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateUserProfile(mockCurrentUser, updateDto);

      expect(result).toEqual(updatedUser);
      expect(service.updateUserProfile).toHaveBeenCalledWith('user-123', updateDto);
    });
  });

  describe('getUserById', () => {
    it('should get user by ID (admin only)', async () => {
      const adminUser: CurrentUserData = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: UserRole.Admin,
        username: 'admin',
      };

      mockUsersService.getUserById.mockResolvedValue(mockUser);

      const result = await controller.getUserById('user-123', adminUser);

      expect(result).toEqual(mockUser);
      expect(service.getUserById).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user info from JWT token', async () => {
      const result = await controller.getCurrentUser(mockCurrentUser);

      expect(result).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        role: UserRole.Dispatcher,
        username: 'testuser',
      });
      // Should not call service methods
      expect(service.getUserProfile).not.toHaveBeenCalled();
    });
  });
});
