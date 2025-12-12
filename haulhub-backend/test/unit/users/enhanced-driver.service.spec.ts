import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as fc from 'fast-check';
import { EnhancedDriverService } from '../../../src/users/enhanced-driver.service';
// EncryptionService removed - storing data as plain text
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { EnhancedDriver, CDLClass, UserRole, VerificationStatus } from '@haulhub/shared';

describe('EnhancedDriverService', () => {
  let service: EnhancedDriverService;
  // encryptionService removed

  const mockDynamoDBClient = {
    send: jest.fn(),
  };

  const mockEnhancedDriver: EnhancedDriver = {
    userId: 'driver-123',
    email: 'driver@test.com',
    fullName: 'Test Driver',
    phoneNumber: '(555) 123-4567',
    role: UserRole.Driver,
    verificationStatus: VerificationStatus.Verified,
    driverLicenseNumber: 'DL123456789',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    cdlClass: CDLClass.A,
    cdlIssued: '2020-01-01',
    cdlExpires: '2028-01-01',
    cdlState: 'FL',
    corpName: 'Test Corp',
    ein: '12-3456789',
    dob: '1990-01-01',
    ssn: '123-45-6789',
    bankName: 'Test Bank',
    bankAccountNumber: '987654321098',
    perMileRate: 0.55,
    notes: 'Test notes',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedDriverService,
        // EncryptionService provider removed
        {
          provide: AwsService,
          useValue: {
            getDynamoDBClient: jest.fn().mockReturnValue(mockDynamoDBClient),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            usersTableName: 'test-users-table',
          },
        },
      ],
    }).compile();

    service = module.get<EnhancedDriverService>(EnhancedDriverService);
    // encryptionService assignment removed
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 7: Data Storage Consistency
   * **Feature: etrucky-feature-parity, Property 7: Data Storage Consistency**
   * **Validates: Requirements 1.2, 1.4**
   * 
   * For any enhanced driver profile with sensitive data, storing and retrieving
   * should preserve the original values without modification.
   */
  describe('Property 7: Data Storage Consistency', () => {
    it('should maintain data integrity through storage and retrieval', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary sensitive data for testing
          fc.record({
            ssn: fc.constantFrom('123-45-6789', '987-65-4321', '555-12-3456'),
            dob: fc.constantFrom('1990-01-01', '1985-06-15', '1992-12-31'),
            bankAccountNumber: fc.constantFrom('987654321098', '876543210987', '765432109876'),
          }),
          async (sensitiveData) => {
            // Reset mocks for each iteration
            jest.clearAllMocks();
            mockDynamoDBClient.send.mockReset();
            
            const updateDto = {
              ssn: sensitiveData.ssn,
              dob: sensitiveData.dob,
              bankAccountNumber: sensitiveData.bankAccountNumber,
              bankName: 'Test Bank',
            };

            // Mock DynamoDB operations - data stored as-is (plain text)
            const storedData = {
              ...mockEnhancedDriver,
              ...updateDto,
              updatedAt: '2024-01-02T00:00:00.000Z',
            };

            mockDynamoDBClient.send
              .mockResolvedValueOnce({ Attributes: storedData }); // updateEnhancedDriverProfile call

            // Test the storage and retrieval through the service
            const result = await service.updateEnhancedDriverProfile('driver-123', updateDto);

            // Property: The retrieved result should contain the original sensitive data unchanged
            expect(result.ssn).toBe(sensitiveData.ssn);
            expect(result.dob).toBe(sensitiveData.dob);
            expect(result.bankAccountNumber).toBe(sensitiveData.bankAccountNumber);
            expect(result.bankName).toBe('Test Bank');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty sensitive fields correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            ssn: fc.option(fc.constant(''), { nil: undefined }),
            dob: fc.option(fc.constant(''), { nil: undefined }),
            bankAccountNumber: fc.option(fc.constant(''), { nil: undefined }),
          }),
          async (sensitiveData) => {
            // Reset mocks for each iteration
            jest.clearAllMocks();
            mockDynamoDBClient.send.mockReset();

            const updateDto = {
              ssn: sensitiveData.ssn,
              dob: sensitiveData.dob,
              bankAccountNumber: sensitiveData.bankAccountNumber,
              bankName: sensitiveData.bankAccountNumber ? 'Test Bank' : undefined,
            };

            // Skip validation if banking info is incomplete
            if (sensitiveData.bankAccountNumber && !updateDto.bankName) {
              return; // Skip this test case as it would fail validation
            }

            // Mock DynamoDB operations
            const storedData = {
              ...mockEnhancedDriver,
              ssn: sensitiveData.ssn,
              dob: sensitiveData.dob,
              bankAccountNumber: sensitiveData.bankAccountNumber,
              updatedAt: '2024-01-02T00:00:00.000Z',
            };

            mockDynamoDBClient.send
              .mockResolvedValueOnce({ Attributes: storedData });

            // Test the storage and retrieval (only if we have valid data)
            if (sensitiveData.ssn !== undefined || sensitiveData.dob !== undefined || sensitiveData.bankAccountNumber !== undefined) {
              const result = await service.updateEnhancedDriverProfile('driver-123', updateDto);

              // Property: Empty fields should remain empty after storage/retrieval
              expect(result.ssn).toBe(sensitiveData.ssn);
              expect(result.dob).toBe(sensitiveData.dob);
              expect(result.bankAccountNumber).toBe(sensitiveData.bankAccountNumber);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('getEnhancedDriverProfile', () => {
    it('should return enhanced driver profile when found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#driver-123',
          SK: 'ENHANCED_PROFILE',
          ...mockEnhancedDriver,
        },
      });

      const result = await service.getEnhancedDriverProfile('driver-123');

      expect(result).toEqual(expect.objectContaining({
        userId: 'driver-123',
        email: 'driver@test.com',
        fullName: 'Test Driver',
        ssn: '123-45-6789', // Stored as plain text
        dob: '1990-01-01', // Stored as plain text
        bankAccountNumber: '987654321098', // Stored as plain text
      }));
    });

    it('should throw NotFoundException when profile not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: null });

      await expect(service.getEnhancedDriverProfile('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateEnhancedDriverProfile', () => {
    it('should update enhanced driver profile successfully', async () => {
      const updateDto = {
        cdlClass: CDLClass.B,
        perMileRate: 0.60,
        ssn: '987-65-4321',
        bankName: 'New Bank',
      };

      const updatedProfile = {
        ...mockEnhancedDriver,
        ...updateDto,
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Attributes: updatedProfile }); // updateEnhancedDriverProfile

      const result = await service.updateEnhancedDriverProfile('driver-123', updateDto);

      expect(result).toEqual(expect.objectContaining({
        cdlClass: CDLClass.B,
        perMileRate: 0.60,
        ssn: '987-65-4321', // Stored as plain text
        bankName: 'New Bank',
      }));
    });

    it('should validate CDL class', async () => {
      const updateDto = {
        cdlClass: 'INVALID' as CDLClass,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
      };

      await expect(service.updateEnhancedDriverProfile('driver-123', updateDto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should validate EIN format', async () => {
      const updateDto = {
        ein: 'invalid-ein',
      };

      await expect(service.updateEnhancedDriverProfile('driver-123', updateDto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should validate bank account number', async () => {
      const updateDto = {
        bankName: 'Test Bank',
        bankAccountNumber: '123', // Too short
      };

      await expect(service.updateEnhancedDriverProfile('driver-123', updateDto)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('recordDriverAdvance', () => {
    it('should record a driver advance payment', async () => {
      const advanceDto = {
        amount: 500,
        description: 'Trip advance payment',
        tripId: 'trip-123',
      };

      mockDynamoDBClient.send.mockResolvedValue({});

      const result = await service.recordDriverAdvance('driver-123', advanceDto);

      expect(result).toMatchObject({
        amount: 500,
        description: 'Trip advance payment',
        tripId: 'trip-123',
        status: 'Active',
      });
      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Item: expect.objectContaining({
              PK: 'USER#driver-123',
              amount: 500,
              description: 'Trip advance payment',
              tripId: 'trip-123',
              status: 'Active',
            }),
          }),
        })
      );
    });

    it('should record advance with default description when none provided', async () => {
      const advanceDto = {
        amount: 300,
      };

      mockDynamoDBClient.send.mockResolvedValue({});

      const result = await service.recordDriverAdvance('driver-123', advanceDto);

      expect(result).toMatchObject({
        amount: 300,
        description: 'Driver advance payment',
        status: 'Active',
      });
    });

    it('should throw BadRequestException for invalid amount', async () => {
      const advanceDto = {
        amount: 0,
        description: 'Invalid advance',
      };

      await expect(service.recordDriverAdvance('driver-123', advanceDto)).rejects.toThrow(
        'Advance amount must be greater than 0'
      );
    });

    it('should throw BadRequestException for negative amount', async () => {
      const advanceDto = {
        amount: -100,
        description: 'Negative advance',
      };

      await expect(service.recordDriverAdvance('driver-123', advanceDto)).rejects.toThrow(
        'Advance amount must be greater than 0'
      );
    });

    it('should handle DynamoDB errors', async () => {
      const advanceDto = {
        amount: 500,
        description: 'Test advance',
      };

      mockDynamoDBClient.send.mockRejectedValue(new Error('DynamoDB error'));

      await expect(service.recordDriverAdvance('driver-123', advanceDto)).rejects.toThrow(
        'Failed to record advance payment'
      );
    });
  });
});