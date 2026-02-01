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

  const mockTruck = {
    PK: 'TRUCK#truck-123',
    SK: 'METADATA',
    GSI1PK: 'CARRIER#carrier-123',
    GSI1SK: 'TRUCK#truck-123',
    GSI2PK: 'OWNER#owner-123',
    GSI2SK: 'TRUCK#truck-123',
    truckId: 'truck-123',
    truckOwnerId: 'owner-123',
    carrierId: 'carrier-123',
    plate: 'ABC-1234',
    brand: 'Freightliner',
    year: 2020,
    vin: 'VIN123456789',
    color: 'White',
    isActive: true,
  };

  const mockLorry = {
    lorryId: 'truck-123',
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
            lorriesTableName: 'eTrucky-Trucks',
            trailersTableName: 'eTrucky-Trailers',
            usersTableName: 'eTrucky-Users',
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
      const mockUser = {
        PK: 'USER#owner-123',
        SK: 'METADATA',
        userId: 'owner-123',
        carrierId: 'carrier-123',
        role: UserRole.LorryOwner,
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: null }) // Check existing truck
        .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
        .mockResolvedValueOnce({}); // Put new truck

      const result = await service.registerLorry('owner-123', registerDto, 'carrier-123');

      expect(result).toMatchObject({
        lorryId: expect.any(String),
        ownerId: 'owner-123',
        verificationStatus: LorryVerificationStatus.Pending,
      });
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
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
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTruck });

      await expect(service.registerLorry('owner-123', registerDto, 'carrier-123')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getLorriesByOwner', () => {
    it('should get all lorries for an owner', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Items: [mockTruck],
      });

      const result = await service.getLorriesByOwner('owner-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        truckId: 'truck-123',
        truckOwnerId: 'owner-123',
        brand: 'Freightliner',
      });
    });

    it('should return empty array when no lorries found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.getLorriesByOwner('owner-123');

      expect(result).toEqual([]);
    });
  });

  describe('getLorryByIdAndOwner', () => {
    it('should get lorry by ID and owner', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTruck });

      const result = await service.getLorryByIdAndOwner('truck-123', 'owner-123');

      expect(result).toMatchObject({
        truckId: 'truck-123',
        truckOwnerId: 'owner-123',
      });
    });

    it('should return null when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      const result = await service.getLorryByIdAndOwner('truck-123', 'owner-123');

      expect(result).toBeNull();
    });
  });

  describe('getLorryById', () => {
    it('should get lorry by ID', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTruck });

      const result = await service.getLorryById('truck-123', 'owner-123');

      expect(result).toMatchObject({
        truckId: 'truck-123',
        truckOwnerId: 'owner-123',
      });
    });

    it('should throw NotFoundException when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(service.getLorryById('truck-123', 'owner-123')).rejects.toThrow(
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
        service.generateUploadUrl('truck-123', 'owner-123', largeFileDto, UserRole.LorryOwner),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when lorry not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(
        service.generateUploadUrl('truck-123', 'owner-123', uploadDto, UserRole.LorryOwner),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDocuments', () => {
    it('should throw ForbiddenException when user is not owner or admin', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Items: [{ ownerId: 'other-owner', truckOwnerId: 'other-owner' }],
      });

      await expect(
        service.getDocuments('truck-123', 'user-123', UserRole.Driver),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when no documents found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.getDocuments('truck-123', 'owner-123', UserRole.Admin);

      expect(result).toEqual([]);
    });
  });

  describe('Trailer Operations', () => {
    const mockTrailer = {
      PK: 'TRAILER#trailer-123',
      SK: 'METADATA',
      GSI1PK: 'CARRIER#carrier-123',
      GSI1SK: 'TRAILER#trailer-123',
      trailerId: 'trailer-123',
      carrierId: 'carrier-123',
      plate: 'TRL-456',
      brand: 'Great Dane',
      year: 2021,
      vin: 'TRLVIN123456',
      color: 'Silver',
      reefer: 'Thermo King',
      isActive: true,
    };

    describe('getTrailersByCarrier', () => {
      it('should get all trailers for a carrier', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrailer],
        });

        const result = await service.getTrailersByCarrier('carrier-123');

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          trailerId: 'trailer-123',
          carrierId: 'carrier-123',
          plate: 'TRL-456',
          brand: 'Great Dane',
        });
      });

      it('should return empty array when no trailers found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

        const result = await service.getTrailersByCarrier('carrier-123');

        expect(result).toEqual([]);
      });
    });

    describe('getTrailerById', () => {
      it('should get trailer by ID', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTrailer });

        const result = await service.getTrailerById('trailer-123');

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          carrierId: 'carrier-123',
          plate: 'TRL-456',
        });
      });

      it('should throw NotFoundException when trailer not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(service.getTrailerById('trailer-123')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('createTrailer', () => {
      const trailerData = {
        carrierId: 'carrier-123',
        plate: 'TRL-789',
        brand: 'Utility',
        year: 2022,
        vin: 'NEWVIN123456',
        color: 'White',
        reefer: null,
      };

      it('should create a trailer successfully', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({});

        const result = await service.createTrailer(trailerData);

        expect(result).toMatchObject({
          trailerId: expect.any(String),
          carrierId: 'carrier-123',
          plate: 'TRL-789',
          brand: 'Utility',
          isActive: true,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
      });

      it('should throw BadRequestException for invalid year (too old)', async () => {
        const invalidData = { ...trailerData, year: 1800 };

        await expect(service.createTrailer(invalidData)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for invalid year (future)', async () => {
        const currentYear = new Date().getFullYear();
        const invalidData = { ...trailerData, year: currentYear + 2 };

        await expect(service.createTrailer(invalidData)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('updateTrailer', () => {
      it('should update trailer successfully', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerById
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, plate: 'TRL-999' } }); // update

        const result = await service.updateTrailer('trailer-123', { plate: 'TRL-999' });

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          plate: 'TRL-999',
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });

      it('should throw NotFoundException when trailer not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.updateTrailer('trailer-123', { plate: 'TRL-999' }),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('deleteTrailer', () => {
      it('should soft delete trailer by setting isActive to false', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerById
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, isActive: false } }); // update

        await service.deleteTrailer('trailer-123');

        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Carrier Validation', () => {
    describe('registerLorry with carrier validation', () => {
      const registerDto = {
        lorryId: 'ABC-1234',
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2020,
      };

      it('should validate carrier membership when carrierId is provided', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'carrier-123',
          role: UserRole.LorryOwner,
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: null }) // Check truck doesn't exist
          .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
          .mockResolvedValueOnce({}); // Put new truck

        const result = await service.registerLorry('owner-123', registerDto, 'carrier-123');

        expect(result).toMatchObject({
          ownerId: 'owner-123',
          verificationStatus: LorryVerificationStatus.Pending,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
      });

      it('should throw ForbiddenException when owner does not belong to carrier', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'different-carrier',
          role: UserRole.LorryOwner,
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: null }) // Check truck doesn't exist
          .mockResolvedValueOnce({ Item: mockUser }); // Validate carrier membership

        await expect(
          service.registerLorry('owner-123', registerDto, 'carrier-123'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when owner user not found', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: null }) // Check truck doesn't exist
          .mockResolvedValueOnce({ Item: null }); // User not found

        await expect(
          service.registerLorry('owner-123', registerDto, 'carrier-123'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('getTrucksByCarrier', () => {
      it('should get all trucks for a carrier', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTruck],
        });

        const result = await service.getTrucksByCarrier('carrier-123');

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          truckId: 'truck-123',
          truckOwnerId: 'owner-123',
        });
      });

      it('should return empty array when no trucks found for carrier', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [] });

        const result = await service.getTrucksByCarrier('carrier-123');

        expect(result).toEqual([]);
      });
    });
  });
});
