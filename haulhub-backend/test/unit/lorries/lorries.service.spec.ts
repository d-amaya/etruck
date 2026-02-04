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
      const trailerDto = {
        plate: 'TRL-789',
        brand: 'Utility',
        year: 2022,
        vin: 'NEWVIN123456',
        color: 'White',
        reefer: null,
      };

      it('should create a trailer successfully', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Items: [] }) // Check VIN uniqueness
          .mockResolvedValueOnce({ Items: [] }) // Check plate uniqueness
          .mockResolvedValueOnce({}); // Put new trailer

        const result = await service.createTrailer('carrier-123', trailerDto);

        expect(result).toMatchObject({
          trailerId: expect.any(String),
          carrierId: 'carrier-123',
          plate: 'TRL-789',
          brand: 'Utility',
          year: 2022,
          vin: 'NEWVIN123456',
          color: 'White',
          reefer: null,
          isActive: true,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
      });

      it('should create a trailer with reefer unit', async () => {
        const trailerWithReefer = { ...trailerDto, reefer: 'Thermo King' };
        
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Items: [] }) // Check VIN uniqueness
          .mockResolvedValueOnce({ Items: [] }) // Check plate uniqueness
          .mockResolvedValueOnce({}); // Put new trailer

        const result = await service.createTrailer('carrier-123', trailerWithReefer);

        expect(result).toMatchObject({
          reefer: 'Thermo King',
        });
      });

      it('should throw BadRequestException for invalid year (too old)', async () => {
        const invalidDto = { ...trailerDto, year: 1800 };

        await expect(service.createTrailer('carrier-123', invalidDto)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for invalid year (future)', async () => {
        const currentYear = new Date().getFullYear();
        const invalidDto = { ...trailerDto, year: currentYear + 2 };

        await expect(service.createTrailer('carrier-123', invalidDto)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException when VIN already exists', async () => {
        const existingTrailer = {
          trailerId: 'existing-trailer',
          vin: 'NEWVIN123456',
        };

        mockDynamoDBClient.send.mockResolvedValueOnce({ Items: [existingTrailer] }); // VIN exists

        await expect(
          service.createTrailer('carrier-123', trailerDto),
        ).rejects.toThrow(BadRequestException);
        
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
      });

      it('should throw BadRequestException when plate already exists', async () => {
        const existingTrailer = {
          trailerId: 'existing-trailer',
          plate: 'TRL-789',
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Items: [] }) // VIN unique
          .mockResolvedValueOnce({ Items: [existingTrailer] }); // Plate exists

        await expect(
          service.createTrailer('carrier-123', trailerDto),
        ).rejects.toThrow(BadRequestException);
        
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });
    });

    describe('updateTrailer', () => {
      it('should update trailer successfully', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Items: [] }) // getTrailerByPlate scan (no duplicates)
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, plate: 'TRL-999' } }); // update

        const result = await service.updateTrailer('trailer-123', 'carrier-123', { plate: 'TRL-999' });

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          plate: 'TRL-999',
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
      });

      it('should throw NotFoundException when trailer not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.updateTrailer('trailer-123', 'carrier-123', { plate: 'TRL-999' }),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when trailer belongs to different carrier', async () => {
        const differentCarrierTrailer = { ...mockTrailer, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTrailer });

        await expect(
          service.updateTrailer('trailer-123', 'carrier-123', { plate: 'TRL-999' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should validate year range when updating year', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTrailer });

        await expect(
          service.updateTrailer('trailer-123', 'carrier-123', { year: 1800 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should check VIN uniqueness when updating VIN', async () => {
        const existingTrailerWithVin = { ...mockTrailer, trailerId: 'other-trailer', vin: 'NEWVIN123' };
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Items: [existingTrailerWithVin] }); // getTrailerByVin scan

        await expect(
          service.updateTrailer('trailer-123', 'carrier-123', { vin: 'NEWVIN123' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should check plate uniqueness when updating plate', async () => {
        const existingTrailerWithPlate = { ...mockTrailer, trailerId: 'other-trailer', plate: 'NEWPLATE' };
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Items: [existingTrailerWithPlate] }); // getTrailerByPlate scan

        await expect(
          service.updateTrailer('trailer-123', 'carrier-123', { plate: 'NEWPLATE' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should allow updating reefer field', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, reefer: 'TK-5000' } }); // update

        const result = await service.updateTrailer('trailer-123', 'carrier-123', { reefer: 'TK-5000' });

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          reefer: 'TK-5000',
        });
      });

      it('should return existing trailer when no updates provided', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTrailer });

        const result = await service.updateTrailer('trailer-123', 'carrier-123', {});

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          plate: 'TRL-456', // Use correct plate from mockTrailer
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1); // Only getTrailerByIdInternal
      });
    });

    describe('deactivateTrailer', () => {
      it('should deactivate trailer by setting isActive to false', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, isActive: false } }); // update

        const result = await service.deactivateTrailer('trailer-123', 'carrier-123');

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          isActive: false,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });

      it('should throw NotFoundException when trailer not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.deactivateTrailer('trailer-123', 'carrier-123'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when trailer belongs to different carrier', async () => {
        const differentCarrierTrailer = { ...mockTrailer, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTrailer });

        await expect(
          service.deactivateTrailer('trailer-123', 'carrier-123'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('reactivateTrailer', () => {
      it('should reactivate trailer by setting isActive to true', async () => {
        const inactiveTrailer = { ...mockTrailer, isActive: false };
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: inactiveTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, isActive: true } }); // update

        const result = await service.reactivateTrailer('trailer-123', 'carrier-123');

        expect(result).toMatchObject({
          trailerId: 'trailer-123',
          isActive: true,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });

      it('should throw NotFoundException when trailer not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.reactivateTrailer('trailer-123', 'carrier-123'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when trailer belongs to different carrier', async () => {
        const differentCarrierTrailer = { ...mockTrailer, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTrailer });

        await expect(
          service.reactivateTrailer('trailer-123', 'carrier-123'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('deleteTrailer', () => {
      it('should soft delete trailer by calling deactivateTrailer', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTrailer }) // getTrailerByIdInternal
          .mockResolvedValueOnce({ Attributes: { ...mockTrailer, isActive: false } }); // update

        await service.deleteTrailer('trailer-123', 'carrier-123');

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

    describe('createTruck', () => {
      const createTruckDto = {
        truckOwnerId: 'owner-123',
        plate: 'ABC-1234',
        brand: 'Freightliner',
        year: 2020,
        vin: 'VIN123456789ABCDE',
        color: 'White',
      };

      it('should create a truck successfully', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'carrier-123',
          role: UserRole.TruckOwner,
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
          .mockResolvedValueOnce({ Items: [] }) // Check VIN uniqueness
          .mockResolvedValueOnce({ Items: [] }) // Check plate uniqueness
          .mockResolvedValueOnce({}); // Put new truck

        const result = await service.createTruck('carrier-123', createTruckDto);

        expect(result).toMatchObject({
          truckOwnerId: 'owner-123',
          carrierId: 'carrier-123',
          plate: 'ABC-1234',
          brand: 'Freightliner',
          year: 2020,
          vin: 'VIN123456789ABCDE',
          color: 'White',
          isActive: true,
        });
        expect(result.truckId).toBeDefined();
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(4);
      });

      it('should throw BadRequestException for invalid year (too old)', async () => {
        const invalidDto = { ...createTruckDto, year: 1899 };

        await expect(
          service.createTruck('carrier-123', invalidDto),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException for invalid year (future)', async () => {
        const currentYear = new Date().getFullYear();
        const invalidDto = { ...createTruckDto, year: currentYear + 2 };

        await expect(
          service.createTruck('carrier-123', invalidDto),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw ForbiddenException when truck owner does not belong to carrier', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'different-carrier',
          role: UserRole.TruckOwner,
        };

        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockUser });

        await expect(
          service.createTruck('carrier-123', createTruckDto),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when truck owner not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.createTruck('carrier-123', createTruckDto),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw BadRequestException when VIN already exists', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'carrier-123',
          role: UserRole.TruckOwner,
        };

        const existingTruck = {
          truckId: 'existing-truck',
          vin: 'VIN123456789ABCDE',
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
          .mockResolvedValueOnce({ Items: [existingTruck] }); // VIN exists

        await expect(
          service.createTruck('carrier-123', createTruckDto),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException when plate already exists', async () => {
        const mockUser = {
          PK: 'USER#owner-123',
          SK: 'METADATA',
          userId: 'owner-123',
          carrierId: 'carrier-123',
          role: UserRole.TruckOwner,
        };

        const existingTruck = {
          truckId: 'existing-truck',
          plate: 'ABC-1234',
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
          .mockResolvedValueOnce({ Items: [] }) // VIN unique
          .mockResolvedValueOnce({ Items: [existingTruck] }); // Plate exists

        await expect(
          service.createTruck('carrier-123', createTruckDto),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('updateTruck', () => {
      const updateDto = {
        plate: 'XYZ-9999',
        brand: 'Peterbilt',
        year: 2021,
        color: 'Blue',
      };

      it('should update truck successfully', async () => {
        const updatedTruck = { ...mockTruck, ...updateDto };
        
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Items: [] }) // Check plate uniqueness (plate is being updated)
          .mockResolvedValue({ Attributes: updatedTruck }); // Update

        const result = await service.updateTruck('truck-123', 'carrier-123', updateDto);

        expect(result).toMatchObject({
          truckId: 'truck-123',
          plate: 'XYZ-9999',
          brand: 'Peterbilt',
          year: 2021,
          color: 'Blue',
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
      });

      it('should throw NotFoundException when truck not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.updateTruck('truck-123', 'carrier-123', updateDto),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when truck does not belong to carrier', async () => {
        const differentCarrierTruck = { ...mockTruck, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTruck });

        await expect(
          service.updateTruck('truck-123', 'carrier-123', updateDto),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException for invalid year', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTruck });

        await expect(
          service.updateTruck('truck-123', 'carrier-123', { year: 1899 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should validate truckOwnerId belongs to carrier when updating owner', async () => {
        const mockUser = {
          PK: 'USER#new-owner-123',
          SK: 'METADATA',
          userId: 'new-owner-123',
          carrierId: 'carrier-123',
          role: UserRole.TruckOwner,
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Item: mockUser }) // Validate carrier membership
          .mockResolvedValueOnce({ Attributes: { ...mockTruck, truckOwnerId: 'new-owner-123' } }); // Update

        const result = await service.updateTruck('truck-123', 'carrier-123', {
          truckOwnerId: 'new-owner-123',
        });

        expect(result.truckOwnerId).toBe('new-owner-123');
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(3);
      });

      it('should throw ForbiddenException when new owner does not belong to carrier', async () => {
        const mockUser = {
          PK: 'USER#new-owner-123',
          SK: 'METADATA',
          userId: 'new-owner-123',
          carrierId: 'different-carrier',
          role: UserRole.TruckOwner,
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Item: mockUser }); // Validate carrier membership

        await expect(
          service.updateTruck('truck-123', 'carrier-123', { truckOwnerId: 'new-owner-123' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException when updating to duplicate VIN', async () => {
        const existingTruck = {
          truckId: 'other-truck',
          vin: 'NEWVIN123456',
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Items: [existingTruck] }); // VIN exists

        await expect(
          service.updateTruck('truck-123', 'carrier-123', { vin: 'NEWVIN123456' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException when updating to duplicate plate', async () => {
        const existingTruck = {
          truckId: 'other-truck',
          plate: 'NEWPLATE',
        };

        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Items: [existingTruck] }); // Plate exists

        await expect(
          service.updateTruck('truck-123', 'carrier-123', { plate: 'NEWPLATE' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should allow updating VIN to same value', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Attributes: mockTruck }); // Update

        const result = await service.updateTruck('truck-123', 'carrier-123', {
          vin: mockTruck.vin,
        });

        expect(result.vin).toBe(mockTruck.vin);
      });

      it('should return existing truck when no updates provided', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: mockTruck });

        const result = await service.updateTruck('truck-123', 'carrier-123', {});

        expect(result).toMatchObject({
          truckId: 'truck-123',
          plate: 'ABC-1234',
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
      });
    });

    describe('deactivateTruck', () => {
      it('should deactivate truck successfully', async () => {
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: mockTruck }) // Get existing truck
          .mockResolvedValueOnce({ Attributes: { ...mockTruck, isActive: false } }); // Update

        const result = await service.deactivateTruck('truck-123', 'carrier-123');

        expect(result).toMatchObject({
          truckId: 'truck-123',
          isActive: false,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });

      it('should throw NotFoundException when truck not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.deactivateTruck('truck-123', 'carrier-123'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when truck does not belong to carrier', async () => {
        const differentCarrierTruck = { ...mockTruck, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTruck });

        await expect(
          service.deactivateTruck('truck-123', 'carrier-123'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('reactivateTruck', () => {
      it('should reactivate truck successfully', async () => {
        const inactiveTruck = { ...mockTruck, isActive: false };
        mockDynamoDBClient.send
          .mockResolvedValueOnce({ Item: inactiveTruck }) // Get existing truck
          .mockResolvedValueOnce({ Attributes: { ...inactiveTruck, isActive: true } }); // Update

        const result = await service.reactivateTruck('truck-123', 'carrier-123');

        expect(result).toMatchObject({
          truckId: 'truck-123',
          isActive: true,
        });
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2);
      });

      it('should throw NotFoundException when truck not found', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

        await expect(
          service.reactivateTruck('truck-123', 'carrier-123'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when truck does not belong to carrier', async () => {
        const differentCarrierTruck = { ...mockTruck, carrierId: 'different-carrier' };
        mockDynamoDBClient.send.mockResolvedValueOnce({ Item: differentCarrierTruck });

        await expect(
          service.reactivateTruck('truck-123', 'carrier-123'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
