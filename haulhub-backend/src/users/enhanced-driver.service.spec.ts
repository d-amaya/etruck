import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EnhancedDriverService } from './enhanced-driver.service';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { CDLClass, UpdateEnhancedDriverDto } from '@haulhub/shared';

describe('EnhancedDriverService', () => {
  let service: EnhancedDriverService;
  let mockAwsService: jest.Mocked<AwsService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockDynamoDBClient: any;

  beforeEach(async () => {
    mockDynamoDBClient = {
      send: jest.fn(),
    };

    mockAwsService = {
      getDynamoDBClient: jest.fn().mockReturnValue(mockDynamoDBClient),
    } as any;

    mockConfigService = {
      usersTableName: 'test-users-table',
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedDriverService,
        { provide: AwsService, useValue: mockAwsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EnhancedDriverService>(EnhancedDriverService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEnhancedDriverProfile', () => {
    it('should return enhanced driver profile when found', async () => {
      const mockItem = {
        userId: 'driver-123',
        email: 'driver@example.com',
        fullName: 'John Driver',
        phoneNumber: '+1234567890',
        role: 'driver',
        verificationStatus: 'verified',
        driverLicenseNumber: 'DL123456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
        corpName: 'Driver Corp',
        ein: '12-3456789',
        perMileRate: 0.65,
        isActive: true,
      };

      mockDynamoDBClient.send.mockResolvedValue({ Item: mockItem });

      const result = await service.getEnhancedDriverProfile('driver-123');

      expect(result).toEqual(expect.objectContaining({
        userId: 'driver-123',
        cdlClass: CDLClass.A,
        perMileRate: 0.65,
        isActive: true,
      }));
      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: {
              PK: 'USER#driver-123',
              SK: 'PROFILE',
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException when driver not found', async () => {
      mockDynamoDBClient.send.mockResolvedValue({ Item: null });

      await expect(service.getEnhancedDriverProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateEnhancedDriverProfile', () => {
    it('should update driver profile with valid data', async () => {
      const updateDto: UpdateEnhancedDriverDto = {
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
        perMileRate: 0.70,
        isActive: true,
      };

      const mockUpdatedItem = {
        userId: 'driver-123',
        email: 'driver@example.com',
        fullName: 'John Driver',
        phoneNumber: '+1234567890',
        role: 'driver',
        verificationStatus: 'verified',
        driverLicenseNumber: 'DL123456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
        ...updateDto,
      };

      mockDynamoDBClient.send.mockResolvedValue({ Attributes: mockUpdatedItem });

      const result = await service.updateEnhancedDriverProfile('driver-123', updateDto);

      expect(result).toEqual(expect.objectContaining({
        userId: 'driver-123',
        cdlClass: CDLClass.A,
        perMileRate: 0.70,
        isActive: true,
      }));
      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: {
              PK: 'USER#driver-123',
              SK: 'PROFILE',
            },
          }),
        }),
      );
    });

    it('should throw BadRequestException for invalid CDL data', async () => {
      const updateDto: UpdateEnhancedDriverDto = {
        cdlClass: CDLClass.A,
        cdlIssued: '2028-01-01', // Future date
        cdlExpires: '2020-01-01', // Past date
        cdlState: 'FL',
      };

      await expect(
        service.updateEnhancedDriverProfile('driver-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid banking data', async () => {
      const updateDto: UpdateEnhancedDriverDto = {
        bankName: 'Test Bank',
        bankAccountNumber: '123', // Too short
      };

      await expect(
        service.updateEnhancedDriverProfile('driver-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateCDLInfo', () => {
    it('should validate correct CDL information', () => {
      const cdlInfo = {
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
      };

      const result = service.validateCDLInfo(cdlInfo);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid CDL class', () => {
      const cdlInfo = {
        cdlClass: 'INVALID' as CDLClass,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
      };

      const result = service.validateCDLInfo(cdlInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid CDL class');
    });

    it('should reject expired CDL', () => {
      const cdlInfo = {
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2020-12-31', // Expired
        cdlState: 'FL',
      };

      const result = service.validateCDLInfo(cdlInfo);

      expect(result.warnings).toContain('CDL is expired or expires soon');
    });

    it('should reject invalid state', () => {
      const cdlInfo = {
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'XX', // Invalid state
      };

      const result = service.validateCDLInfo(cdlInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid US state abbreviation');
    });
  });

  describe('validateBankingInfo', () => {
    it('should validate correct banking information', () => {
      const bankingInfo = {
        bankName: 'Test Bank',
        bankAccountNumber: '987654321098', // Valid account number
      };

      const result = service.validateBankingInfo(bankingInfo);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short bank name', () => {
      const bankingInfo = {
        bankName: 'A',
        bankAccountNumber: '123456789012',
      };

      const result = service.validateBankingInfo(bankingInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Bank name must be at least 2 characters');
    });

    it('should reject invalid account number length', () => {
      const bankingInfo = {
        bankName: 'Test Bank',
        bankAccountNumber: '123', // Too short
      };

      const result = service.validateBankingInfo(bankingInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Account number must be between 8 and 17 digits');
    });

    it('should reject obviously invalid account numbers', () => {
      const bankingInfo = {
        bankName: 'Test Bank',
        bankAccountNumber: '1111111111', // All same digit
      };

      const result = service.validateBankingInfo(bankingInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Account number cannot be all the same digit');
    });
  });

  describe('getDriverPaymentHistory', () => {
    it('should return payment history for driver', async () => {
      const mockPayments = [
        {
          SK: 'PAYMENT#payment-1',
          tripId: 'trip-1',
          amount: 1500,
          paymentDate: '2024-01-15',
          paymentType: 'trip',
          description: 'Trip payment',
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      mockDynamoDBClient.send.mockResolvedValue({ Items: mockPayments });

      const result = await service.getDriverPaymentHistory('driver-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        paymentId: 'payment-1',
        tripId: 'trip-1',
        amount: 1500,
      }));
    });
  });

  describe('getDriverAdvances', () => {
    it('should return advances for driver', async () => {
      const mockAdvances = [
        {
          SK: 'ADVANCE#advance-1',
          tripId: 'trip-1',
          amount: 500,
          advanceDate: '2024-01-10',
          status: 'pending',
          description: 'Trip advance',
          createdAt: '2024-01-10T00:00:00Z',
        },
      ];

      mockDynamoDBClient.send.mockResolvedValue({ Items: mockAdvances });

      const result = await service.getDriverAdvances('driver-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        advanceId: 'advance-1',
        tripId: 'trip-1',
        amount: 500,
        status: 'pending',
      }));
    });
  });
});