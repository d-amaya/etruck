import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from '../../../src/trips/trips.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { BrokersService } from '../../../src/admin/brokers.service';
import { StatusWorkflowService } from '../../../src/trips/status-workflow.service';
import { IndexSelectorService } from '../../../src/trips/index-selector.service';
import { BadRequestException } from '@nestjs/common';

describe('TripsService - GSI Attributes', () => {
  let service: TripsService;
  let awsService: AwsService;
  let brokersService: BrokersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        {
          provide: AwsService,
          useValue: {
            getDynamoDBClient: jest.fn().mockReturnValue({
              send: jest.fn().mockResolvedValue({}),
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            tripsTableName: 'test-trips-table',
            lorriesTableName: 'test-lorries-table',
          },
        },
        {
          provide: BrokersService,
          useValue: {
            getBrokerById: jest.fn().mockResolvedValue({
              brokerId: 'broker-123',
              brokerName: 'Test Broker',
            }),
          },
        },
        {
          provide: StatusWorkflowService,
          useValue: {},
        },
        {
          provide: IndexSelectorService,
          useValue: {
            selectOptimalIndex: jest.fn().mockReturnValue({
              indexName: 'GSI1',
              estimatedReads: 10000,
              filterExpressionAttributes: [],
              rationale: 'Default index selected for testing',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    awsService = module.get<AwsService>(AwsService);
    brokersService = module.get<BrokersService>(BrokersService);
  });

  describe('populateGSIAttributes', () => {
    it('should generate all GSI attributes with correct format', () => {
      const params = {
        tripId: 'trip-123',
        dispatcherId: 'dispatcher-456',
        lorryId: 'ABC123',
        driverId: 'driver-789',
        brokerId: 'broker-101',
        scheduledPickupDatetime: '2025-12-15T10:00:00.000Z',
      };

      // Access private method via type assertion
      const gsiAttributes = (service as any).populateGSIAttributes(params);

      // Verify GSI1 attributes (default dispatcher index)
      expect(gsiAttributes.GSI1PK).toBe('DISPATCHER#dispatcher-456');
      expect(gsiAttributes.GSI1SK).toMatch(/^2025-12-15T10:00:00\.000Z#trip-123$/);

      // Verify GSI2 attributes (lorry-optimized index)
      expect(gsiAttributes.GSI2PK).toBe('DISPATCHER#dispatcher-456');
      expect(gsiAttributes.GSI2SK).toBe('LORRY#ABC123#2025-12-15#trip-123');

      // Verify GSI3 attributes (driver-optimized index)
      expect(gsiAttributes.GSI3PK).toBe('DISPATCHER#dispatcher-456');
      expect(gsiAttributes.GSI3SK).toBe('DRIVER#driver-789#2025-12-15#trip-123');

      // Verify GSI4 attributes (broker-optimized index)
      expect(gsiAttributes.GSI4PK).toBe('DISPATCHER#dispatcher-456');
      expect(gsiAttributes.GSI4SK).toBe('BROKER#broker-101#2025-12-15#trip-123');
    });

    it('should extract date correctly from ISO timestamp', () => {
      const params = {
        tripId: 'trip-abc',
        dispatcherId: 'disp-xyz',
        lorryId: 'LORRY-001',
        driverId: 'DRV-001',
        brokerId: 'BRK-001',
        scheduledPickupDatetime: '2025-01-20T14:30:45.123Z',
      };

      const gsiAttributes = (service as any).populateGSIAttributes(params);

      // All entity-specific GSIs should use date-only format
      expect(gsiAttributes.GSI2SK).toContain('#2025-01-20#');
      expect(gsiAttributes.GSI3SK).toContain('#2025-01-20#');
      expect(gsiAttributes.GSI4SK).toContain('#2025-01-20#');
    });
  });

  describe('validateGSIAttributes', () => {
    it('should pass validation for correctly formatted GSI attributes', () => {
      const validAttributes = {
        GSI1PK: 'DISPATCHER#disp-123',
        GSI1SK: '2025-12-15T10:00:00.000Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: 'LORRY#ABC123#2025-12-15#abc-def-123',
        GSI3PK: 'DISPATCHER#disp-123',
        GSI3SK: 'DRIVER#DRV001#2025-12-15#abc-def-123',
        GSI4PK: 'DISPATCHER#disp-123',
        GSI4SK: 'BROKER#BRK001#2025-12-15#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(validAttributes);
      }).not.toThrow();
    });

    it('should throw error for invalid GSI2SK format (missing LORRY prefix)', () => {
      const invalidAttributes = {
        GSI1PK: 'DISPATCHER#disp-123',
        GSI1SK: '2025-12-15T10:00:00.000Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: 'ABC123#2025-12-15#abc-def-123', // Missing LORRY# prefix
        GSI3PK: 'DISPATCHER#disp-123',
        GSI3SK: 'DRIVER#DRV001#2025-12-15#abc-def-123',
        GSI4PK: 'DISPATCHER#disp-123',
        GSI4SK: 'BROKER#BRK001#2025-12-15#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI2SK format/);
    });

    it('should throw error for invalid GSI3SK format (missing DRIVER prefix)', () => {
      const invalidAttributes = {
        GSI1PK: 'DISPATCHER#disp-123',
        GSI1SK: '2025-12-15T10:00:00.000Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: 'LORRY#ABC123#2025-12-15#abc-def-123',
        GSI3PK: 'DISPATCHER#disp-123',
        GSI3SK: 'DRV001#2025-12-15#abc-def-123', // Missing DRIVER# prefix
        GSI4PK: 'DISPATCHER#disp-123',
        GSI4SK: 'BROKER#BRK001#2025-12-15#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI3SK format/);
    });

    it('should throw error for invalid GSI4SK format (missing BROKER prefix)', () => {
      const invalidAttributes = {
        GSI1PK: 'DISPATCHER#disp-123',
        GSI1SK: '2025-12-15T10:00:00.000Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: 'LORRY#ABC123#2025-12-15#abc-def-123',
        GSI3PK: 'DISPATCHER#disp-123',
        GSI3SK: 'DRIVER#DRV001#2025-12-15#abc-def-123',
        GSI4PK: 'DISPATCHER#disp-123',
        GSI4SK: 'BRK001#2025-12-15#abc-def-123', // Missing BROKER# prefix
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI4SK format/);
    });

    it('should throw error for invalid date format in GSI2SK', () => {
      const invalidAttributes = {
        GSI1PK: 'DISPATCHER#disp-123',
        GSI1SK: '2025-12-15T10:00:00.000Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: 'LORRY#ABC123#12-15-2025#abc-def-123', // Wrong date format
        GSI3PK: 'DISPATCHER#disp-123',
        GSI3SK: 'DRIVER#DRV001#2025-12-15#abc-def-123',
        GSI4PK: 'DISPATCHER#disp-123',
        GSI4SK: 'BROKER#BRK001#2025-12-15#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI2SK format/);
    });
  });

  describe('createTrip - GSI integration', () => {
    it('should populate and validate GSI attributes when creating a trip', async () => {
      const dispatcherId = 'dispatcher-123';
      const createTripDto = {
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        scheduledPickupDatetime: '2025-12-20T09:00:00.000Z',
        brokerId: 'broker-123',
        lorryId: 'LORRY-XYZ',
        driverId: 'DRIVER-ABC',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 600,
        driverPayment: 300,
        distance: 250,
        loadedMiles: 200,
        emptyMiles: 50,
        totalMiles: 250,
        fuelAvgCost: 3.5,
        fuelAvgGallonsPerMile: 0.15,
        lumperFees: 50,
        detentionFees: 25,
      };

      const mockSend = jest.fn().mockResolvedValue({});
      (awsService.getDynamoDBClient as jest.Mock).mockReturnValue({
        send: mockSend,
      });

      await service.createTrip(dispatcherId, createTripDto);

      // Verify that DynamoDB send was called
      expect(mockSend).toHaveBeenCalled();

      // Get the PutCommand that was sent
      const putCommand = mockSend.mock.calls[0][0];
      const item = putCommand.input.Item;

      // Verify all GSI attributes are present
      expect(item.GSI1PK).toBeDefined();
      expect(item.GSI1SK).toBeDefined();
      expect(item.GSI2PK).toBeDefined();
      expect(item.GSI2SK).toBeDefined();
      expect(item.GSI3PK).toBeDefined();
      expect(item.GSI3SK).toBeDefined();
      expect(item.GSI4PK).toBeDefined();
      expect(item.GSI4SK).toBeDefined();

      // Verify GSI attribute formats
      expect(item.GSI2SK).toMatch(/^LORRY#LORRY-XYZ#\d{4}-\d{2}-\d{2}#/);
      expect(item.GSI3SK).toMatch(/^DRIVER#DRIVER-ABC#\d{4}-\d{2}-\d{2}#/);
      expect(item.GSI4SK).toMatch(/^BROKER#broker-123#\d{4}-\d{2}-\d{2}#/);
    });
  });
});
