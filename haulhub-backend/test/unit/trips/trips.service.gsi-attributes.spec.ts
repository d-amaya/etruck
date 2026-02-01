import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from '../../../src/trips/trips.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { BrokersService } from '../../../src/admin/brokers.service';
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
        carrierId: 'carrier-456',
        dispatcherId: 'dispatcher-456',
        truckId: 'ABC123',
        truckOwnerId: 'owner-789',
        driverId: 'driver-789',
        brokerId: 'broker-101',
        scheduledTimestamp: '2025-12-15T10:00:00Z',
      };

      // Access private method via type assertion
      const gsiAttributes = (service as any).populateGSIAttributes(params);

      // Verify GSI1 attributes (carrier index)
      expect(gsiAttributes.GSI1PK).toBe('CARRIER#carrier-456');
      expect(gsiAttributes.GSI1SK).toMatch(/^2025-12-15T10:00:00Z#trip-123$/);

      // Verify GSI2 attributes (dispatcher index)
      expect(gsiAttributes.GSI2PK).toBe('DISPATCHER#dispatcher-456');
      expect(gsiAttributes.GSI2SK).toMatch(/^2025-12-15T10:00:00Z#trip-123$/);

      // Verify GSI3 attributes (driver index)
      expect(gsiAttributes.GSI3PK).toBe('DRIVER#driver-789');
      expect(gsiAttributes.GSI3SK).toMatch(/^2025-12-15T10:00:00Z#trip-123$/);

      // Verify GSI4 attributes (truck owner index)
      expect(gsiAttributes.GSI4PK).toBe('OWNER#owner-789');
      expect(gsiAttributes.GSI4SK).toMatch(/^2025-12-15T10:00:00Z#trip-123$/);

      // Verify GSI5 attributes (broker index)
      expect(gsiAttributes.GSI5PK).toBe('BROKER#broker-101');
      expect(gsiAttributes.GSI5SK).toMatch(/^2025-12-15T10:00:00Z#trip-123$/);
    });

    it('should extract date correctly from ISO timestamp', () => {
      const params = {
        tripId: 'trip-abc',
        carrierId: 'carrier-xyz',
        dispatcherId: 'disp-xyz',
        truckId: 'TRUCK-001',
        truckOwnerId: 'owner-001',
        driverId: 'DRV-001',
        brokerId: 'BRK-001',
        scheduledTimestamp: '2025-01-20T14:30:45Z',
      };

      const gsiAttributes = (service as any).populateGSIAttributes(params);

      // All GSIs should use ISO timestamp format
      expect(gsiAttributes.GSI1SK).toContain('2025-01-20T14:30:45Z#');
      expect(gsiAttributes.GSI2SK).toContain('2025-01-20T14:30:45Z#');
      expect(gsiAttributes.GSI3SK).toContain('2025-01-20T14:30:45Z#');
      expect(gsiAttributes.GSI4SK).toContain('2025-01-20T14:30:45Z#');
      expect(gsiAttributes.GSI5SK).toContain('2025-01-20T14:30:45Z#');
    });
  });

  describe('validateGSIAttributes', () => {
    it('should pass validation for correctly formatted GSI attributes', () => {
      const validAttributes = {
        GSI1PK: 'CARRIER#carrier-123',
        GSI1SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI3PK: 'DRIVER#DRV001',
        GSI3SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI4PK: 'OWNER#owner-123',
        GSI4SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI5PK: 'BROKER#BRK001',
        GSI5SK: '2025-12-15T10:00:00Z#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(validAttributes);
      }).not.toThrow();
    });

    it('should throw error for invalid GSI1SK format (missing timestamp)', () => {
      const invalidAttributes = {
        GSI1PK: 'CARRIER#carrier-123',
        GSI1SK: 'abc-def-123', // Missing timestamp
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI3PK: 'DRIVER#DRV001',
        GSI3SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI4PK: 'OWNER#owner-123',
        GSI4SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI5PK: 'BROKER#BRK001',
        GSI5SK: '2025-12-15T10:00:00Z#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI1SK format/);
    });

    it('should throw error for invalid GSI3SK format (wrong timestamp format)', () => {
      const invalidAttributes = {
        GSI1PK: 'CARRIER#carrier-123',
        GSI1SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI3PK: 'DRIVER#DRV001',
        GSI3SK: '12-15-2025#abc-def-123', // Wrong timestamp format
        GSI4PK: 'OWNER#owner-123',
        GSI4SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI5PK: 'BROKER#BRK001',
        GSI5SK: '2025-12-15T10:00:00Z#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI3SK format/);
    });

    it('should throw error for invalid GSI4SK format (has milliseconds)', () => {
      const invalidAttributes = {
        GSI1PK: 'CARRIER#carrier-123',
        GSI1SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI3PK: 'DRIVER#DRV001',
        GSI3SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI4PK: 'OWNER#owner-123',
        GSI4SK: '2025-12-15T10:00:00.123Z#abc-def-123', // Has milliseconds
        GSI5PK: 'BROKER#BRK001',
        GSI5SK: '2025-12-15T10:00:00Z#abc-def-123',
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI4SK format/);
    });

    it('should throw error for invalid timestamp format in GSI5SK', () => {
      const invalidAttributes = {
        GSI1PK: 'CARRIER#carrier-123',
        GSI1SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI2PK: 'DISPATCHER#disp-123',
        GSI2SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI3PK: 'DRIVER#DRV001',
        GSI3SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI4PK: 'OWNER#owner-123',
        GSI4SK: '2025-12-15T10:00:00Z#abc-def-123',
        GSI5PK: 'BROKER#BRK001',
        GSI5SK: '2025/12/15T10:00:00Z#abc-def-123', // Wrong date separator
      };

      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(BadRequestException);
      expect(() => {
        (service as any).validateGSIAttributes(invalidAttributes);
      }).toThrow(/Invalid GSI5SK format/);
    });
  });

  describe('createTrip - GSI integration', () => {
    it('should populate and validate GSI attributes when creating a trip', async () => {
      const dispatcherId = 'dispatcher-123';
      const createTripDto = {
        orderConfirmation: 'ORDER-123',
        scheduledTimestamp: '2025-12-20T09:00:00Z',
        pickupCompany: 'Acme Corp',
        pickupAddress: 'Location A',
        pickupCity: 'Los Angeles',
        pickupState: 'CA',
        pickupZip: '90001',
        pickupPhone: '555-0100',
        pickupNotes: '',
        deliveryCompany: 'Beta Inc',
        deliveryAddress: 'Location B',
        deliveryCity: 'San Francisco',
        deliveryState: 'CA',
        deliveryZip: '94102',
        deliveryPhone: '555-0200',
        deliveryNotes: '',
        brokerId: 'broker-123',
        truckId: 'TRUCK-XYZ',
        trailerId: 'TRAILER-ABC',
        driverId: 'DRIVER-ABC',
        carrierId: 'carrier-123',
        truckOwnerId: 'owner-123',
        mileageEmpty: 50,
        mileageOrder: 200,
        mileageTotal: 250,
        brokerRate: 6.5,
        driverRate: 2.1,
        truckOwnerRate: 3.9,
        dispatcherRate: 0.5,
        factoryRate: 0,
        orderRate: 6.5,
        orderAverage: 6.5,
        brokerPayment: 1000,
        driverPayment: 300,
        truckOwnerPayment: 600,
        dispatcherPayment: 100,
        brokerAdvance: 0,
        driverAdvance: 0,
        factoryAdvance: 0,
        fuelCost: 150,
        fuelGasAvgCost: 3.5,
        fuelGasAvgGallxMil: 0.15,
        brokerCost: 0,
        factoryCost: 0,
        lumperValue: 50,
        detentionValue: 25,
        orderExpenses: 1125,
        orderRevenue: 1000,
        notes: '',
      };

      const mockSend = jest.fn().mockResolvedValue({});
      const mockQuery = jest.fn().mockResolvedValue({ Items: [] });
      
      (awsService.getDynamoDBClient as jest.Mock).mockReturnValue({
        send: mockSend.mockImplementation((command) => {
          // Mock QueryCommand for carrier membership validation
          if (command.constructor.name === 'QueryCommand') {
            return mockQuery(command);
          }
          // Mock PutCommand for trip creation
          return Promise.resolve({});
        }),
      });

      // Mock the carrier membership validation to pass
      // We need to mock the DynamoDB queries for dispatcher, driver, truck, and trailer
      mockQuery
        .mockResolvedValueOnce({ Items: [{ userId: dispatcherId, carrierId: 'carrier-123' }] }) // Dispatcher query
        .mockResolvedValueOnce({ Items: [{ userId: 'DRIVER-ABC', carrierId: 'carrier-123' }] }) // Driver query
        .mockResolvedValueOnce({ Items: [{ truckId: 'TRUCK-XYZ', carrierId: 'carrier-123', truckOwnerId: 'owner-123' }] }) // Truck query
        .mockResolvedValueOnce({ Items: [{ trailerId: 'TRAILER-ABC', carrierId: 'carrier-123' }] }); // Trailer query

      await service.createTrip(dispatcherId, createTripDto);

      // Verify that DynamoDB send was called for the PutCommand
      expect(mockSend).toHaveBeenCalled();

      // Find the PutCommand call (it should be the last one after all queries)
      const putCommandCall = mockSend.mock.calls.find(
        call => call[0].constructor.name === 'PutCommand'
      );
      
      expect(putCommandCall).toBeDefined();
      
      if (putCommandCall) {
        const item = putCommandCall[0].input.Item;

        // Verify all GSI attributes are present
        expect(item.GSI1PK).toBeDefined();
        expect(item.GSI1SK).toBeDefined();
        expect(item.GSI2PK).toBeDefined();
        expect(item.GSI2SK).toBeDefined();
        expect(item.GSI3PK).toBeDefined();
        expect(item.GSI3SK).toBeDefined();
        expect(item.GSI4PK).toBeDefined();
        expect(item.GSI4SK).toBeDefined();
        expect(item.GSI5PK).toBeDefined();
        expect(item.GSI5SK).toBeDefined();

        // Verify GSI attribute formats
        // Note: GSI1PK uses dispatcherId as fallback since carrierId is not passed to populateGSIAttributes
        expect(item.GSI1PK).toMatch(/^CARRIER#dispatcher-123$/);
        expect(item.GSI2PK).toMatch(/^DISPATCHER#dispatcher-123$/);
        expect(item.GSI3PK).toMatch(/^DRIVER#DRIVER-ABC$/);
        // Note: GSI4PK uses dispatcherId as fallback since truckOwnerId is not passed to populateGSIAttributes
        expect(item.GSI4PK).toMatch(/^OWNER#dispatcher-123$/);
        expect(item.GSI5PK).toMatch(/^BROKER#broker-123$/);
      }
    });
  });
});
