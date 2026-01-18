import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AdminService } from '../../../src/admin/admin.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import {
  LorryVerificationStatus,
  VerificationStatus,
  UserRole,
} from '@haulhub/shared';

describe('AdminService', () => {
  let service: AdminService;

  const mockDynamoDBClient = { send: jest.fn() };

  const mockLorry = {
    lorryId: 'ABC-1234',
    ownerId: 'owner-123',
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2020,
    verificationStatus: LorryVerificationStatus.Pending,
    verificationDocuments: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockUser = {
    userId: 'user-123',
    email: 'test@example.com',
    fullName: 'Test User',
    phoneNumber: '+1234567890',
    role: UserRole.Dispatcher,
    verificationStatus: VerificationStatus.Pending,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
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
            lorriesTableName: 'haulhub-lorries-table-dev',
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDynamoDBClient.send.mockReset();
  });

  describe('getPendingLorries', () => {
    it('should get all pending lorries', async () => {
      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Items: [mockLorry] }) // Pending
        .mockResolvedValueOnce({ Items: [] }); // NeedsMoreEvidence

      const result = await service.getPendingLorries();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockLorry);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
    });

    it('should combine pending and needs more evidence lorries', async () => {
      const needsMoreEvidenceLorry = {
        ...mockLorry,
        lorryId: 'XYZ-5678',
        verificationStatus: LorryVerificationStatus.NeedsMoreEvidence,
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Items: [mockLorry] })
        .mockResolvedValueOnce({ Items: [needsMoreEvidenceLorry] });

      const result = await service.getPendingLorries();

      expect(result).toHaveLength(2);
    });

    it('should throw InternalServerErrorException on error', async () => {
      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(service.getPendingLorries()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('verifyLorry', () => {
    it('should approve a lorry', async () => {
      const verifyDto = { decision: 'Approved' as const };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Items: [mockLorry] }) // Find lorry
        .mockResolvedValueOnce({
          Attributes: { ...mockLorry, verificationStatus: LorryVerificationStatus.Approved },
        }); // Update

      const result = await service.verifyLorry('ABC-1234', verifyDto);

      expect(result.verificationStatus).toBe(LorryVerificationStatus.Approved);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
    });

    it('should reject a lorry with reason', async () => {
      const verifyDto = {
        decision: 'Rejected' as const,
        reason: 'Invalid documents',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Items: [mockLorry] })
        .mockResolvedValueOnce({
          Attributes: {
            ...mockLorry,
            verificationStatus: LorryVerificationStatus.Rejected,
            rejectionReason: 'Invalid documents',
          },
        });

      const result = await service.verifyLorry('ABC-1234', verifyDto);

      expect(result.verificationStatus).toBe(LorryVerificationStatus.Rejected);
    });

    it('should throw BadRequestException for invalid decision', async () => {
      const verifyDto = { decision: 'Invalid' as any };

      await expect(service.verifyLorry('ABC-1234', verifyDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when rejecting without reason', async () => {
      const verifyDto = { decision: 'Rejected' as const };

      await expect(service.verifyLorry('ABC-1234', verifyDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when lorry not found', async () => {
      const verifyDto = { decision: 'Approved' as const };

      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      await expect(service.verifyLorry('ABC-1234', verifyDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPendingUsers', () => {
    it('should get all pending users', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [mockUser] });

      const result = await service.getPendingUsers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockUser);
    });

    it('should return empty array when no pending users', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.getPendingUsers();

      expect(result).toEqual([]);
    });

    it('should throw InternalServerErrorException on error', async () => {
      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(service.getPendingUsers()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('verifyUser', () => {
    it('should verify a user', async () => {
      const verifyDto = { decision: 'Verified' as const };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockUser }) // Get user
        .mockResolvedValueOnce({
          Attributes: { ...mockUser, verificationStatus: VerificationStatus.Verified },
        }); // Update

      const result = await service.verifyUser('user-123', verifyDto);

      expect(result.verificationStatus).toBe(VerificationStatus.Verified);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
    });

    it('should reject a user with reason', async () => {
      const verifyDto = {
        decision: 'Rejected' as const,
        reason: 'Invalid information',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockUser })
        .mockResolvedValueOnce({
          Attributes: {
            ...mockUser,
            verificationStatus: VerificationStatus.Rejected,
            rejectionReason: 'Invalid information',
          },
        });

      const result = await service.verifyUser('user-123', verifyDto);

      expect(result.verificationStatus).toBe(VerificationStatus.Rejected);
    });

    it('should throw BadRequestException for invalid decision', async () => {
      const verifyDto = { decision: 'Invalid' as any };

      await expect(service.verifyUser('user-123', verifyDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when rejecting without reason', async () => {
      const verifyDto = { decision: 'Rejected' as const };

      await expect(service.verifyUser('user-123', verifyDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      const verifyDto = { decision: 'Verified' as const };

      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(service.verifyUser('user-123', verifyDto)).rejects.toThrow(NotFoundException);
    });
  });
});
