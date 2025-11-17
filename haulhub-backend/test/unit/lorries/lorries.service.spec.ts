import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { LorriesService } from '../../../src/lorries/lorries.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { LorryVerificationStatus, UserRole } from '@haulhub/shared';

describe('LorriesService', () => {
  let service: LorriesService;

  const mockDynamoDBClient = { send: jest.fn() };
  const mockS3Client = { send: jest.fn() };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LorriesService,
        {
          provide: AwsService,
          useValue: {
            getDynamoDBClient: jest.fn(() => mockDynamoDBClient),
            getS3Client: jest.fn(() => mockS3Client),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            lorriesTableName: 'haulhub-lorries-table-dev',
            s3DocumentsBucketName: 'test-bucket',
          },
        },
      ],
    }).compile();

    service = module.get<LorriesService>(LorriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDynamoDBClient.send.mockReset();
    mockS3Client.send.mockReset();
  });

  describe('registerLorry', () => {
    const registerDto = {
      lorryId: 'ABC-1234',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2020,
    };

    it('should register a lorry successfully', async () => {
      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: null }) // Check existing
        .mockResolvedValueOnce({}); // Put new lorry

      const result = await service.registerLorry('owner-123', registerDto);

      expect(result).toMatchObject({
        lorryId: 'ABC-1234',
        ownerId: 'owner-123',
        verificationStatus: LorryVerificationStatus.Pending,
      });
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException for invalid year (too old)', async () => {
      const invalidDto = { ...registerDto, year: 1800 };

      await expect(service.registerLorry('owner-123', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid year (future)', async () => {
      const invalidDto = { ...registerDto, year: 2030 };

      await expect(service.registerLorry('owner-123', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when lorry already exists', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockLorry });

      await expect(service.registerLorry('owner-123', registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getLorriesByOwner', () => {
    it('should get all lorries for an owner', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Items: [mockLorry],
      });

      const result = await service.getLorriesByOwner('owner-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockLorry);
    });

    it('should return empty array when no lorries found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.getLorriesByOwner('owner-123');

      expect(result).toEqual([]);
    });
  });

  describe('getLorryByIdAndOwner', () => {
    it('should get lorry by ID and owner', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockLorry });

      const result = await service.getLorryByIdAndOwner('ABC-1234', 'owner-123');

      expect(result).toMatchObject(mockLorry);
    });

    it('should return null when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      const result = await service.getLorryByIdAndOwner('ABC-1234', 'owner-123');

      expect(result).toBeNull();
    });
  });

  describe('getLorryById', () => {
    it('should get lorry by ID', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockLorry });

      const result = await service.getLorryById('ABC-1234', 'owner-123');

      expect(result).toMatchObject(mockLorry);
    });

    it('should throw NotFoundException when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(service.getLorryById('ABC-1234', 'owner-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateUploadUrl', () => {
    const uploadDto = {
      fileName: 'registration.pdf',
      fileSize: 1024000,
      contentType: 'application/pdf',
    };

    it('should throw BadRequestException for file size exceeding 10MB', async () => {
      const largeFileDto = { ...uploadDto, fileSize: 11 * 1024 * 1024 };

      await expect(
        service.generateUploadUrl('ABC-1234', 'owner-123', largeFileDto, UserRole.LorryOwner),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(
        service.generateUploadUrl('ABC-1234', 'owner-123', uploadDto, UserRole.LorryOwner),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDocuments', () => {
    it('should throw ForbiddenException when user is not owner or admin', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Items: [{ ownerId: 'other-owner' }],
      });

      await expect(
        service.getDocuments('ABC-1234', 'user-123', UserRole.Driver),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when no documents found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.getDocuments('ABC-1234', 'owner-123', UserRole.Admin);

      expect(result).toEqual([]);
    });
  });
});
