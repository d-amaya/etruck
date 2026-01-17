import { Test, TestingModule } from '@nestjs/testing';
import { DriversController } from '../../../src/drivers/drivers.controller';
import { DriversService } from '../../../src/drivers/drivers.service';
import { CDLClass, UpdateEnhancedDriverDto, UserRole, VerificationStatus } from '@haulhub/shared';

describe('DriversController', () => {
  let controller: DriversController;
  let mockEnhancedDriverService: jest.Mocked<DriversService>;

  const mockCurrentUser = {
    userId: 'driver-123',
    email: 'driver@example.com',
    role: UserRole.Driver,
    username: 'driver123',
  };

  const mockEnhancedDriver = {
    userId: 'driver-123',
    email: 'driver@example.com',
    fullName: 'John Driver',
    phoneNumber: '+1234567890',
    role: UserRole.Driver,
    verificationStatus: VerificationStatus.Verified,
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

  beforeEach(async () => {
    mockEnhancedDriverService = {
      getEnhancedDriverProfile: jest.fn(),
      updateEnhancedDriverProfile: jest.fn(),
      getDriverPaymentHistory: jest.fn(),
      getDriverAdvances: jest.fn(),
      recordDriverAdvance: jest.fn(),
      validateCDLInfo: jest.fn(),
      validateBankingInfo: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [
        { provide: DriversService, useValue: mockEnhancedDriverService },
      ],
    }).compile();

    controller = module.get<DriversController>(DriversController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDriverProfile', () => {
    it('should return current driver profile', async () => {
      mockEnhancedDriverService.getEnhancedDriverProfile.mockResolvedValue(mockEnhancedDriver);

      const result = await controller.getDriverProfile(mockCurrentUser);

      expect(result).toEqual(mockEnhancedDriver);
      expect(mockEnhancedDriverService.getEnhancedDriverProfile).toHaveBeenCalledWith('driver-123');
    });
  });

  describe('updateDriverProfile', () => {
    it('should update current driver profile', async () => {
      const updateDto: UpdateEnhancedDriverDto = {
        perMileRate: 0.70,
        isActive: true,
      };

      const updatedDriver = { ...mockEnhancedDriver, perMileRate: 0.70 };
      mockEnhancedDriverService.updateEnhancedDriverProfile.mockResolvedValue(updatedDriver);

      const result = await controller.updateDriverProfile(mockCurrentUser, updateDto);

      expect(result).toEqual(updatedDriver);
      expect(mockEnhancedDriverService.updateEnhancedDriverProfile).toHaveBeenCalledWith(
        'driver-123',
        updateDto,
      );
    });
  });

  describe('getDriverById', () => {
    it('should return driver profile by ID', async () => {
      mockEnhancedDriverService.getEnhancedDriverProfile.mockResolvedValue(mockEnhancedDriver);

      const result = await controller.getDriverById('driver-456');

      expect(result).toEqual(mockEnhancedDriver);
      expect(mockEnhancedDriverService.getEnhancedDriverProfile).toHaveBeenCalledWith('driver-456');
    });
  });

  describe('updateDriverById', () => {
    it('should update driver profile by ID', async () => {
      const updateDto: UpdateEnhancedDriverDto = {
        perMileRate: 0.75,
        isActive: false,
      };

      const updatedDriver = { ...mockEnhancedDriver, perMileRate: 0.75, isActive: false };
      mockEnhancedDriverService.updateEnhancedDriverProfile.mockResolvedValue(updatedDriver);

      const result = await controller.updateDriverById('driver-456', updateDto);

      expect(result).toEqual(updatedDriver);
      expect(mockEnhancedDriverService.updateEnhancedDriverProfile).toHaveBeenCalledWith(
        'driver-456',
        updateDto,
      );
    });
  });

  describe('getDriverPayments', () => {
    it('should return current driver payment history', async () => {
      const mockPayments = [
        {
          paymentId: 'payment-1',
          tripId: 'trip-1',
          amount: 1500,
          paymentDate: '2024-01-15',
          paymentType: 'trip',
          description: 'Trip payment',
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      mockEnhancedDriverService.getDriverPaymentHistory.mockResolvedValue(mockPayments);

      const result = await controller.getDriverPayments(mockCurrentUser, '2024-01-01', '2024-01-31');

      expect(result).toEqual(mockPayments);
      expect(mockEnhancedDriverService.getDriverPaymentHistory).toHaveBeenCalledWith(
        'driver-123',
        '2024-01-01',
        '2024-01-31',
      );
    });
  });

  describe('getDriverPaymentsById', () => {
    it('should return driver payment history by ID', async () => {
      const mockPayments = [
        {
          paymentId: 'payment-1',
          tripId: 'trip-1',
          amount: 1500,
          paymentDate: '2024-01-15',
          paymentType: 'trip',
          description: 'Trip payment',
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      mockEnhancedDriverService.getDriverPaymentHistory.mockResolvedValue(mockPayments);

      const result = await controller.getDriverPaymentsById('driver-456');

      expect(result).toEqual(mockPayments);
      expect(mockEnhancedDriverService.getDriverPaymentHistory).toHaveBeenCalledWith(
        'driver-456',
        undefined,
        undefined,
      );
    });
  });

  describe('getDriverAdvances', () => {
    it('should return current driver advances', async () => {
      const mockAdvances = [
        {
          advanceId: 'advance-1',
          tripId: 'trip-1',
          amount: 500,
          advanceDate: '2024-01-10',
          status: 'pending',
          description: 'Trip advance',
          createdAt: '2024-01-10T00:00:00Z',
        },
      ];

      mockEnhancedDriverService.getDriverAdvances.mockResolvedValue(mockAdvances);

      const result = await controller.getDriverAdvances(mockCurrentUser);

      expect(result).toEqual(mockAdvances);
      expect(mockEnhancedDriverService.getDriverAdvances).toHaveBeenCalledWith('driver-123');
    });
  });

  describe('getDriverAdvancesById', () => {
    it('should return driver advances by ID', async () => {
      const mockAdvances = [
        {
          advanceId: 'advance-1',
          tripId: 'trip-1',
          amount: 500,
          advanceDate: '2024-01-10',
          status: 'pending',
          description: 'Trip advance',
          createdAt: '2024-01-10T00:00:00Z',
        },
      ];

      mockEnhancedDriverService.getDriverAdvances.mockResolvedValue(mockAdvances);

      const result = await controller.getDriverAdvancesById('driver-456');

      expect(result).toEqual(mockAdvances);
      expect(mockEnhancedDriverService.getDriverAdvances).toHaveBeenCalledWith('driver-456');
    });
  });

  describe('validateCDL', () => {
    it('should validate CDL information', async () => {
      const cdlInfo = {
        cdlClass: CDLClass.A,
        cdlIssued: '2020-01-01',
        cdlExpires: '2028-01-01',
        cdlState: 'FL',
      };

      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      mockEnhancedDriverService.validateCDLInfo.mockReturnValue(validationResult);

      const result = await controller.validateCDL(cdlInfo);

      expect(result).toEqual(validationResult);
      expect(mockEnhancedDriverService.validateCDLInfo).toHaveBeenCalledWith(cdlInfo);
    });
  });

  describe('validateBanking', () => {
    it('should validate banking information', async () => {
      const bankingInfo = {
        bankName: 'Test Bank',
        bankAccountNumber: '123456789012',
      };

      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      mockEnhancedDriverService.validateBankingInfo.mockReturnValue(validationResult);

      const result = await controller.validateBanking(bankingInfo);

      expect(result).toEqual(validationResult);
      expect(mockEnhancedDriverService.validateBankingInfo).toHaveBeenCalledWith(bankingInfo);
    });
  });

  describe('recordDriverAdvance', () => {
    it('should record advance payment for driver', async () => {
      const advanceDto = {
        driverId: 'driver-456',
        amount: 500,
        description: 'Trip advance payment',
        tripId: 'trip-123',
      };

      const mockAdvanceRecord = {
        advanceId: 'advance-1',
        tripId: 'trip-123',
        amount: 500,
        advanceDate: '2024-01-10T00:00:00Z',
        status: 'Active',
        description: 'Trip advance payment',
        createdAt: '2024-01-10T00:00:00Z',
      };

      mockEnhancedDriverService.recordDriverAdvance.mockResolvedValue(mockAdvanceRecord);

      const result = await controller.recordDriverAdvance(mockCurrentUser, advanceDto);

      expect(result).toEqual(mockAdvanceRecord);
      expect(mockEnhancedDriverService.recordDriverAdvance).toHaveBeenCalledWith('driver-456', advanceDto);
    });

    it('should throw BadRequestException when driverId is missing', async () => {
      const advanceDto = {
        amount: 500,
        description: 'Trip advance payment',
      };

      await expect(controller.recordDriverAdvance(mockCurrentUser, advanceDto)).rejects.toThrow('Driver ID is required');
    });
  });

  describe('recordDriverAdvanceById', () => {
    it('should record advance payment for specific driver', async () => {
      const advanceDto = {
        amount: 500,
        description: 'Trip advance payment',
        tripId: 'trip-123',
      };

      const mockAdvanceRecord = {
        advanceId: 'advance-1',
        tripId: 'trip-123',
        amount: 500,
        advanceDate: '2024-01-10T00:00:00Z',
        status: 'Active',
        description: 'Trip advance payment',
        createdAt: '2024-01-10T00:00:00Z',
      };

      mockEnhancedDriverService.recordDriverAdvance.mockResolvedValue(mockAdvanceRecord);

      const result = await controller.recordDriverAdvanceById('driver-456', advanceDto);

      expect(result).toEqual(mockAdvanceRecord);
      expect(mockEnhancedDriverService.recordDriverAdvance).toHaveBeenCalledWith('driver-456', advanceDto);
    });
  });
});