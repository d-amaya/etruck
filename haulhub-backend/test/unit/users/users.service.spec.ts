import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from '../../../src/users/users.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { UserRole, VerificationStatus } from '@haulhub/shared';

describe('UsersService', () => {
  let service: UsersService;
  let awsService: jest.Mocked<AwsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockDynamoDBClient = {
    send: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: AwsService,
          useValue: {
            getDynamoDBClient: jest.fn(() => mockDynamoDBClient),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            usersTableName: 'haulhub-users-table-dev',
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    awsService = module.get(AwsService) as jest.Mocked<AwsService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDynamoDBClient.send.mockReset();
  });

  describe('getUserProfile', () => {
    it('should get user profile successfully', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: mockUser,
      });

      const result = await service.getUserProfile('user-123');

      expect(result).toEqual(mockUser);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(service.getUserProfile('user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on DynamoDB error', async () => {
      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(service.getUserProfile('user-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      const updateDto = {
        fullName: 'Updated Name',
        phoneNumber: '+9876543210',
      };

      const updatedUser = { ...mockUser, ...updateDto };

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: updatedUser,
      });

      const result = await service.updateUserProfile('user-123', updateDto);

      expect(result).toMatchObject(updateDto);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should update only fullName when provided', async () => {
      const updateDto = { fullName: 'New Name' };
      const updatedUser = { ...mockUser, fullName: 'New Name' };

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: updatedUser,
      });

      const result = await service.updateUserProfile('user-123', updateDto);

      expect(result.fullName).toBe('New Name');
    });

    it('should update only phoneNumber when provided', async () => {
      const updateDto = { phoneNumber: '+9999999999' };
      const updatedUser = { ...mockUser, phoneNumber: '+9999999999' };

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: updatedUser,
      });

      const result = await service.updateUserProfile('user-123', updateDto);

      expect(result.phoneNumber).toBe('+9999999999');
    });

    it('should return existing profile when no fields to update', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: mockUser,
      });

      const result = await service.updateUserProfile('user-123', {});

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found during update', async () => {
      const updateDto = { fullName: 'New Name' };

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: null,
      });

      await expect(service.updateUserProfile('user-123', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on DynamoDB error', async () => {
      const updateDto = { fullName: 'New Name' };

      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(service.updateUserProfile('user-123', updateDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getUserById', () => {
    it('should get user by ID (admin function)', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: mockUser,
      });

      const result = await service.getUserById('user-123');

      expect(result).toEqual(mockUser);
    });
  });
});
