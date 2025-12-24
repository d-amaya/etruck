import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { TripsService } from '../../../src/trips/trips.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { BrokersService } from '../../../src/admin/brokers.service';
import { StatusWorkflowService } from '../../../src/trips/status-workflow.service';
import { StatusAuditService } from '../../../src/trips/status-audit.service';
import { IndexSelectorService } from '../../../src/trips/index-selector.service';
import { TripStatus, UserRole } from '@haulhub/shared';

describe('TripsService', () => {
  let service: TripsService;
  let awsService: jest.Mocked<AwsService>;
  let configService: jest.Mocked<ConfigService>;
  let brokersService: jest.Mocked<BrokersService>;
  let statusWorkflowService: jest.Mocked<StatusWorkflowService>;
  let statusAuditService: jest.Mocked<StatusAuditService>;
  let indexSelectorService: jest.Mocked<IndexSelectorService>;

  const mockDynamoDBClient = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        {
          provide: AwsService,
          useValue: {
            getDynamoDBClient: jest.fn(() => mockDynamoDBClient),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            tripsTableName: 'haulhub-trips-table-dev',
            lorriesTableName: 'haulhub-lorries-table-dev',
          },
        },
        {
          provide: BrokersService,
          useValue: {
            getBrokerById: jest.fn(),
          },
        },
        {
          provide: StatusWorkflowService,
          useValue: {
            validateStatusTransition: jest.fn(),
            canUserUpdateStatus: jest.fn(),
          },
        },
        {
          provide: StatusAuditService,
          useValue: {
            recordStatusChange: jest.fn(),
            getStatusHistory: jest.fn(),
          },
        },
        {
          provide: IndexSelectorService,
          useValue: {
            selectOptimalIndex: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    awsService = module.get(AwsService) as jest.Mocked<AwsService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
    brokersService = module.get(BrokersService) as jest.Mocked<BrokersService>;
    statusWorkflowService = module.get(StatusWorkflowService) as jest.Mocked<StatusWorkflowService>;
    statusAuditService = module.get(StatusAuditService) as jest.Mocked<StatusAuditService>;
    indexSelectorService = module.get(IndexSelectorService) as jest.Mocked<IndexSelectorService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTrip', () => {
    const validCreateTripDto = {
      pickupLocation: '123 Main St, Los Angeles, CA',
      dropoffLocation: '456 Oak Ave, San Francisco, CA',
      scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
      brokerId: 'broker-123',
      lorryId: 'ABC-1234',
      driverId: 'DRV-001',
      driverName: 'John Doe',
      brokerPayment: 2500.0,
      lorryOwnerPayment: 1500.0,
      driverPayment: 800.0,
      distance: 380,
    };

    it('should create a trip successfully', async () => {
      const dispatcherId = 'dispatcher-123';

      // Mock broker lookup via BrokersService
      brokersService.getBrokerById.mockResolvedValueOnce({
        brokerId: 'broker-123',
        brokerName: 'TQL (Total Quality Logistics)',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      // Mock trip creation (no lorry lookup needed anymore)
      mockDynamoDBClient.send.mockResolvedValueOnce({});

      const result = await service.createTrip(dispatcherId, validCreateTripDto);

      expect(result).toMatchObject({
        dispatcherId,
        pickupLocation: validCreateTripDto.pickupLocation,
        dropoffLocation: validCreateTripDto.dropoffLocation,
        brokerId: validCreateTripDto.brokerId,
        brokerName: 'TQL (Total Quality Logistics)',
        lorryId: validCreateTripDto.lorryId,
        driverId: validCreateTripDto.driverId,
        status: TripStatus.Scheduled,
      });
      expect(result.tripId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(brokersService.getBrokerById).toHaveBeenCalledWith('broker-123');
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException for missing required fields', async () => {
      const invalidDto = { ...validCreateTripDto, pickupLocation: '' };

      await expect(service.createTrip('dispatcher-123', invalidDto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid datetime format', async () => {
      const invalidDto = { ...validCreateTripDto, scheduledPickupDatetime: 'invalid-date' };

      await expect(service.createTrip('dispatcher-123', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for negative payment amounts', async () => {
      const invalidDto = { ...validCreateTripDto, brokerPayment: -100 };

      await expect(service.createTrip('dispatcher-123', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for zero payment amounts', async () => {
      const invalidDto = { ...validCreateTripDto, driverPayment: 0 };

      await expect(service.createTrip('dispatcher-123', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when broker not found', async () => {
      brokersService.getBrokerById.mockRejectedValueOnce(new NotFoundException('Broker not found'));

      await expect(service.createTrip('dispatcher-123', validCreateTripDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on DynamoDB error', async () => {
      brokersService.getBrokerById.mockResolvedValueOnce({
        brokerId: 'broker-123',
        brokerName: 'Test Broker',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(service.createTrip('dispatcher-123', validCreateTripDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should create a trip successfully even when lorry is not registered', async () => {
      const dispatcherId = 'dispatcher-123';

      // Mock broker lookup via BrokersService
      brokersService.getBrokerById.mockResolvedValueOnce({
        brokerId: 'broker-123',
        brokerName: 'TQL (Total Quality Logistics)',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      // Mock trip creation
      mockDynamoDBClient.send.mockResolvedValueOnce({});

      const result = await service.createTrip(dispatcherId, validCreateTripDto);

      expect(result).toMatchObject({
        dispatcherId,
        lorryId: validCreateTripDto.lorryId,
        status: TripStatus.Scheduled,
      });
      expect(result.tripId).toBeDefined();
      expect(brokersService.getBrokerById).toHaveBeenCalledWith('broker-123');
      // Should only call DynamoDB once for trip creation (no lorry lookup)
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTripById', () => {
    it('should get trip by ID for dispatcher', async () => {
      const tripId = 'trip-123';
      const dispatcherId = 'dispatcher-123';

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
          tripId,
          dispatcherId,
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          status: TripStatus.Scheduled,
          scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
          brokerId: 'broker-123',
          brokerName: 'Test Broker',
          lorryId: 'ABC-1234',
          driverId: 'DRV-001',
          driverName: 'John Doe',
          brokerPayment: 2500,
          lorryOwnerPayment: 1500,
          driverPayment: 800,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = await service.getTripById(tripId, dispatcherId, UserRole.Dispatcher);

      expect(result.tripId).toBe(tripId);
      expect(result.dispatcherId).toBe(dispatcherId);
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: undefined });

      await expect(
        service.getTripById('trip-123', 'dispatcher-123', UserRole.Dispatcher),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for driver accessing another driver\'s trip', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'TRIP#trip-123',
          SK: 'METADATA',
          tripId: 'trip-123',
          dispatcherId: 'dispatcher-123',
          driverId: 'DRV-002',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          status: TripStatus.Scheduled,
          scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
          brokerId: 'broker-123',
          brokerName: 'Test Broker',
          lorryId: 'ABC-1234',
          driverName: 'John Doe',
          brokerPayment: 2500,
          lorryOwnerPayment: 1500,
          driverPayment: 800,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      await expect(
        service.getTripById('trip-123', 'DRV-001', UserRole.Driver),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateTrip', () => {
    const existingTrip = {
      PK: 'TRIP#trip-123',
      SK: 'METADATA',
      tripId: 'trip-123',
      dispatcherId: 'dispatcher-123',
      pickupLocation: '123 Main St',
      dropoffLocation: '456 Oak Ave',
      scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
      brokerId: 'broker-123',
      brokerName: 'Test Broker',
      lorryId: 'ABC-1234',
      driverId: 'DRV-001',
      driverName: 'John Doe',
      brokerPayment: 2500,
      lorryOwnerPayment: 1500,
      driverPayment: 800,
      status: TripStatus.Scheduled,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should update trip successfully', async () => {
      // Mock getTripById
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: existingTrip,
      });

      const updateDto = {
        pickupLocation: 'Updated pickup location',
        brokerPayment: 2600,
      };

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: {
          ...existingTrip,
          ...updateDto,
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      });

      const result = await service.updateTrip('trip-123', 'dispatcher-123', updateDto);

      expect(result.pickupLocation).toBe(updateDto.pickupLocation);
      expect(result.brokerPayment).toBe(updateDto.brokerPayment);
    });

    it('should update broker name when brokerId changes', async () => {
      // Mock getTripById
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: existingTrip,
      });

      const updateDto = { brokerId: 'new-broker-123' };

      brokersService.getBrokerById.mockResolvedValueOnce({
        brokerId: 'new-broker-123',
        brokerName: 'New Broker',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      mockDynamoDBClient.send.mockResolvedValueOnce({
        Attributes: {
          ...existingTrip,
          brokerId: 'new-broker-123',
          brokerName: 'New Broker',
        },
      });

      const result = await service.updateTrip('trip-123', 'dispatcher-123', updateDto);

      expect(result.brokerId).toBe('new-broker-123');
      expect(result.brokerName).toBe('New Broker');
      expect(brokersService.getBrokerById).toHaveBeenCalledWith('new-broker-123');
    });

    it('should throw BadRequestException for invalid datetime', async () => {
      // Mock getTripById
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: existingTrip,
      });

      const updateDto = { scheduledPickupDatetime: 'invalid-date' };

      await expect(service.updateTrip('trip-123', 'dispatcher-123', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for negative payment', async () => {
      // Mock getTripById
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: existingTrip,
      });

      const updateDto = { driverPayment: -100 };

      await expect(service.updateTrip('trip-123', 'dispatcher-123', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({ Item: undefined });

      await expect(
        service.updateTrip('trip-123', 'dispatcher-123', { pickupLocation: 'New location' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTripStatus', () => {
    const existingTrip = {
      tripId: 'trip-123',
      dispatcherId: 'dispatcher-123',
      pickupLocation: '123 Main St',
      dropoffLocation: '456 Oak Ave',
      scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
      brokerId: 'broker-123',
      brokerName: 'Test Broker',
      lorryId: 'ABC-1234',
      driverId: 'DRV-001',
      driverName: 'John Doe',
      brokerPayment: 2500,
      lorryOwnerPayment: 1500,
      driverPayment: 800,
      status: TripStatus.Scheduled,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    describe('dispatcher status updates', () => {
      it('should allow dispatcher to update to any status', async () => {
        // Mock getTripById for dispatcher
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: { PK: 'TRIP#trip-123', SK: 'METADATA', ...existingTrip },
        });

        // Mock update
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.Delivered,
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          'dispatcher-123',
          UserRole.Dispatcher,
          TripStatus.Delivered,
        );

        expect(result.status).toBe(TripStatus.Delivered);
      });

      it('should allow dispatcher to update to Paid status', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: { PK: 'TRIP#trip-123', SK: 'METADATA', ...existingTrip, status: TripStatus.Delivered },
        });

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.Paid,
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          'dispatcher-123',
          UserRole.Dispatcher,
          TripStatus.Paid,
        );

        expect(result.status).toBe(TripStatus.Paid);
      });

      it('should allow dispatcher to skip status transitions', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: { PK: 'TRIP#trip-123', SK: 'METADATA', ...existingTrip },
        });

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.Paid,
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          'dispatcher-123',
          UserRole.Dispatcher,
          TripStatus.Paid,
        );

        expect(result.status).toBe(TripStatus.Paid);
      });
    });

    describe('driver status updates', () => {
      it('should allow driver to update to PickedUp', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query for driver - must include tripId for matching
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', driverId: driverLicenseNumber }],
        });

        // Mock update
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.PickedUp,
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          userId,
          UserRole.Driver,
          TripStatus.PickedUp,
        );

        expect(result.status).toBe(TripStatus.PickedUp);
      });

      it('should allow driver to update to InTransit', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', status: TripStatus.PickedUp, driverId: driverLicenseNumber }],
        });

        // Mock update
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.InTransit,
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          userId,
          UserRole.Driver,
          TripStatus.InTransit,
        );

        expect(result.status).toBe(TripStatus.InTransit);
      });

      it('should allow driver to update to Delivered', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', status: TripStatus.InTransit, driverId: driverLicenseNumber }],
        });

        // Mock update
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.Delivered,
            deliveredAt: '2024-01-02T10:00:00.000Z',
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          userId,
          UserRole.Driver,
          TripStatus.Delivered,
        );

        expect(result.status).toBe(TripStatus.Delivered);
        expect(result.deliveredAt).toBeDefined();
      });

      it('should prevent driver from updating to Paid status', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', status: TripStatus.Delivered, driverId: driverLicenseNumber }],
        });

        await expect(
          service.updateTripStatus('trip-123', userId, UserRole.Driver, TripStatus.Paid),
        ).rejects.toThrow('Drivers cannot update trip status to Paid');
      });

      it('should prevent driver from updating to Scheduled status', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', status: TripStatus.PickedUp, driverId: driverLicenseNumber }],
        });

        await expect(
          service.updateTripStatus('trip-123', userId, UserRole.Driver, TripStatus.Scheduled),
        ).rejects.toThrow('Drivers cannot update trip status to Scheduled');
      });

      it('should prevent driver from invalid status transitions', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'trip-123', status: TripStatus.Scheduled, driverId: driverLicenseNumber }],
        });

        await expect(
          service.updateTripStatus('trip-123', userId, UserRole.Driver, TripStatus.Delivered),
        ).rejects.toThrow(BadRequestException);
      });

      it('should prevent driver from updating trips not assigned to them', async () => {
        const userId = 'user-driver-999';
        const driverLicenseNumber = 'DRV-999';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query returning no trips
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [],
        });

        await expect(
          service.updateTripStatus('trip-123', userId, UserRole.Driver, TripStatus.PickedUp),
        ).rejects.toThrow('You are not assigned to any trips');
      });

      it('should prevent driver from updating specific trip not assigned to them', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock GSI3 query returning different trip
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [{ ...existingTrip, tripId: 'other-trip', driverId: driverLicenseNumber }],
        });

        await expect(
          service.updateTripStatus('trip-123', userId, UserRole.Driver, TripStatus.PickedUp),
        ).rejects.toThrow('You are not assigned to this trip');
      });
    });

    describe('deliveredAt timestamp', () => {
      it('should record deliveredAt timestamp when status changes to Delivered', async () => {
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: { PK: 'TRIP#trip-123', SK: 'METADATA', ...existingTrip, status: TripStatus.InTransit },
        });

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...existingTrip,
            status: TripStatus.Delivered,
            deliveredAt: '2024-01-02T10:00:00.000Z',
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          'dispatcher-123',
          UserRole.Dispatcher,
          TripStatus.Delivered,
        );

        expect(result.deliveredAt).toBeDefined();
      });

      it('should not overwrite existing deliveredAt timestamp', async () => {
        const tripWithDeliveredAt = {
          ...existingTrip,
          status: TripStatus.Delivered,
          deliveredAt: '2024-01-01T10:00:00.000Z',
        };

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: { PK: 'TRIP#trip-123', SK: 'METADATA', ...tripWithDeliveredAt },
        });

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Attributes: {
            ...tripWithDeliveredAt,
            status: TripStatus.Paid,
          },
        });

        const result = await service.updateTripStatus(
          'trip-123',
          'dispatcher-123',
          UserRole.Dispatcher,
          TripStatus.Paid,
        );

        expect(result.deliveredAt).toBe('2024-01-01T10:00:00.000Z');
      });
    });
  });

  describe('getTrips', () => {
    describe('dispatcher queries', () => {
      it('should get all trips for dispatcher', async () => {
        const dispatcherId = 'dispatcher-123';
        const mockTrips = [
          {
            tripId: 'trip-1',
            dispatcherId,
            pickupLocation: '123 Main St',
            dropoffLocation: '456 Oak Ave',
            scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
            status: TripStatus.Scheduled,
            brokerId: 'broker-1',
            brokerName: 'Broker 1',
            lorryId: 'ABC-123',
            driverId: 'DRV-001',
            driverName: 'John Doe',
            brokerPayment: 2500,
            lorryOwnerPayment: 1500,
            driverPayment: 800,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            tripId: 'trip-2',
            dispatcherId,
            pickupLocation: '789 Elm St',
            dropoffLocation: '321 Pine Ave',
            scheduledPickupDatetime: '2024-02-16T09:00:00.000Z',
            status: TripStatus.InTransit,
            brokerId: 'broker-2',
            brokerName: 'Broker 2',
            lorryId: 'XYZ-789',
            driverId: 'DRV-002',
            driverName: 'Jane Smith',
            brokerPayment: 3000,
            lorryOwnerPayment: 1800,
            driverPayment: 900,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ];

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips,
        });

        const result = await service.getTrips(dispatcherId, UserRole.Dispatcher, {});

        expect(result.trips).toHaveLength(2);
        expect(result.trips[0].tripId).toBe('trip-1');
        expect(result.trips[1].tripId).toBe('trip-2');
      });

      it('should filter dispatcher trips by date range', async () => {
        const dispatcherId = 'dispatcher-123';
        const filters = {
          startDate: '2024-02-01',
          endDate: '2024-02-28',
        };

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              tripId: 'trip-1',
              dispatcherId,
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(dispatcherId, UserRole.Dispatcher, filters);

        expect(result.trips).toHaveLength(1);
        expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              KeyConditionExpression: expect.stringContaining('BETWEEN'),
            }),
          }),
        );
      });

      it('should filter dispatcher trips by broker', async () => {
        const dispatcherId = 'dispatcher-123';
        const filters = { brokerId: 'broker-123' };

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              tripId: 'trip-1',
              dispatcherId,
              brokerId: 'broker-123',
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(dispatcherId, UserRole.Dispatcher, filters);

        expect(result.trips).toHaveLength(1);
        expect(result.trips[0].brokerId).toBe('broker-123');
      });

      it('should filter dispatcher trips by status', async () => {
        const dispatcherId = 'dispatcher-123';
        const filters = { status: TripStatus.Delivered };

        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              tripId: 'trip-1',
              dispatcherId,
              status: TripStatus.Delivered,
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
            },
          ],
        });

        const result = await service.getTrips(dispatcherId, UserRole.Dispatcher, filters);

        expect(result.trips).toHaveLength(1);
        expect(result.trips[0].status).toBe(TripStatus.Delivered);
      });

      it('should support pagination for dispatcher trips', async () => {
        const dispatcherId = 'dispatcher-123';
        const lastEvaluatedKey = Buffer.from(
          JSON.stringify({ PK: 'DISPATCHER#dispatcher-123', SK: 'TRIP#2024-02-15#trip-1' }),
        ).toString('base64');

        // Mock returns 2 items (limit+1) to indicate there are more pages
        mockDynamoDBClient.send.mockResolvedValue({
          Items: [
            { tripId: 'trip-2', dispatcherId, scheduledPickupDatetime: '2024-02-16T08:00:00.000Z' },
            { tripId: 'trip-3', dispatcherId, scheduledPickupDatetime: '2024-02-17T08:00:00.000Z' },
          ],
          LastEvaluatedKey: { PK: 'DISPATCHER#dispatcher-123', SK: 'TRIP#2024-02-17#trip-3' },
        });

        const result = await service.getTrips(dispatcherId, UserRole.Dispatcher, {
          lastEvaluatedKey,
          limit: 1,
        });

        expect(result.trips).toHaveLength(1);
        expect(result.lastEvaluatedKey).toBeDefined();
      });
    });

    describe('driver queries', () => {
      it('should get all trips for driver', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
            userId,
            driverLicenseNumber,
            role: UserRole.Driver,
          },
        });

        const mockTrips = [
          {
            PK: 'TRIP#trip-1',
            SK: 'METADATA',
            GSI3PK: `DRIVER#${driverLicenseNumber}`,
            GSI3SK: '2024-02-15#trip-1',
            tripId: 'trip-1',
            dispatcherId: 'dispatcher-123',
            driverId: driverLicenseNumber,
            pickupLocation: '123 Main St',
            dropoffLocation: '456 Oak Ave',
            scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
            status: TripStatus.Scheduled,
            brokerId: 'broker-1',
            brokerName: 'Broker 1',
            lorryId: 'ABC-123',
            driverName: 'John Doe',
            brokerPayment: 2500,
            lorryOwnerPayment: 1500,
            driverPayment: 800,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ];

        // Mock trips query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips,
        });

        const result = await service.getTrips(userId, UserRole.Driver, {});

        expect(result.trips).toHaveLength(1);
        expect(result.trips[0].driverId).toBe(driverLicenseNumber);
        expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2); // User lookup + trips query
      });

      it('should filter driver trips by date range', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';
        const filters = {
          startDate: '2024-02-01',
          endDate: '2024-02-28',
        };

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock trips query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              tripId: 'trip-1',
              driverId: driverLicenseNumber,
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(userId, UserRole.Driver, filters);

        expect(result.trips).toHaveLength(1);
      });

      it('should filter driver trips by lorry', async () => {
        const userId = 'user-driver-123';
        const driverLicenseNumber = 'DRV-001';
        const filters = { lorryId: 'ABC-123' };

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock trips query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              tripId: 'trip-1',
              driverId: driverLicenseNumber,
              lorryId: 'ABC-123',
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(userId, UserRole.Driver, filters);

        expect(result.trips).toHaveLength(1);
        expect(result.trips[0].lorryId).toBe('ABC-123');
      });
    });

    describe('lorry owner queries', () => {
      it('should get trips for lorry owner with approved lorries', async () => {
        const ownerId = 'owner-123';

        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: `LORRY_OWNER#${ownerId}`,
              SK: 'LORRY#ABC-123',
              lorryId: 'ABC-123',
            },
            {
              PK: `LORRY_OWNER#${ownerId}`,
              SK: 'LORRY#XYZ-789',
              lorryId: 'XYZ-789',
            },
          ],
        });

        // Mock GSI2 query for trips by first lorry
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'TRIP#trip-1',
              SK: 'METADATA',
              GSI2PK: 'LORRY#ABC-123',
              GSI2SK: '2024-02-15#trip-1',
              tripId: 'trip-1',
              lorryId: 'ABC-123',
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        // Mock GSI2 query for trips by second lorry
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'TRIP#trip-2',
              SK: 'METADATA',
              GSI2PK: 'LORRY#XYZ-789',
              GSI2SK: '2024-02-16#trip-2',
              tripId: 'trip-2',
              lorryId: 'XYZ-789',
              scheduledPickupDatetime: '2024-02-16T08:00:00.000Z',
              status: TripStatus.InTransit,
            },
          ],
        });

        const result = await service.getTrips(ownerId, UserRole.LorryOwner, {});

        expect(result.trips).toHaveLength(2);
        expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              IndexName: 'GSI2',
            }),
          }),
        );
      });

      it('should return empty array when lorry owner has no approved lorries', async () => {
        const ownerId = 'owner-123';

        // Mock query for lorries returning no lorries
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [],
        });

        const result = await service.getTrips(ownerId, UserRole.LorryOwner, {});

        expect(result.trips).toHaveLength(0);
      });

      it('should filter lorry owner trips by specific lorry', async () => {
        const ownerId = 'owner-123';
        const filters = { lorryId: 'ABC-123' };

        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: `LORRY_OWNER#${ownerId}`,
              SK: 'LORRY#ABC-123',
              lorryId: 'ABC-123',
            },
            {
              PK: `LORRY_OWNER#${ownerId}`,
              SK: 'LORRY#XYZ-789',
              lorryId: 'XYZ-789',
            },
          ],
        });

        // Mock GSI2 query for trips by ABC-123 only (XYZ-789 is skipped due to filter)
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'TRIP#trip-1',
              SK: 'METADATA',
              GSI2PK: 'LORRY#ABC-123',
              GSI2SK: '2024-02-15#trip-1',
              tripId: 'trip-1',
              lorryId: 'ABC-123',
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(ownerId, UserRole.LorryOwner, filters);

        expect(result.trips).toHaveLength(1);
        expect(result.trips[0].lorryId).toBe('ABC-123');
      });

      it('should filter lorry owner trips by date range', async () => {
        const ownerId = 'owner-123';
        const filters = {
          startDate: '2024-02-01',
          endDate: '2024-02-28',
        };

        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: `LORRY_OWNER#${ownerId}`,
              SK: 'LORRY#ABC-123',
              lorryId: 'ABC-123',
            },
          ],
        });

        // Mock GSI2 query for trips by lorry with date range
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'TRIP#trip-1',
              SK: 'METADATA',
              GSI2PK: 'LORRY#ABC-123',
              GSI2SK: '2024-02-15#trip-1',
              tripId: 'trip-1',
              lorryId: 'ABC-123',
              scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
              status: TripStatus.Scheduled,
            },
          ],
        });

        const result = await service.getTrips(ownerId, UserRole.LorryOwner, filters);

        expect(result.trips).toHaveLength(1);
      });
    });

    describe('error handling', () => {
      it('should throw ForbiddenException for invalid role', async () => {
        await expect(
          service.getTrips('user-123', 'InvalidRole' as UserRole, {}),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException for invalid lastEvaluatedKey', async () => {
        await expect(
          service.getTrips('dispatcher-123', UserRole.Dispatcher, {
            lastEvaluatedKey: 'invalid-key',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw InternalServerErrorException on DynamoDB error', async () => {
        mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

        await expect(
          service.getTrips('dispatcher-123', UserRole.Dispatcher, {}),
        ).rejects.toThrow(InternalServerErrorException);
      });
    });
  });

  describe('getPaymentReport', () => {
    const mockTrips = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-123',
        pickupLocation: '123 Main St',
        dropoffLocation: '456 Oak Ave',
        scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
        brokerId: 'broker-1',
        brokerName: 'TQL',
        lorryId: 'ABC-1234',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 2500,
        lorryOwnerPayment: 1500,
        driverPayment: 800,
        status: TripStatus.Delivered,
        distance: 380,
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-01T00:00:00.000Z',
      },
      {
        tripId: 'trip-2',
        dispatcherId: 'dispatcher-123',
        pickupLocation: '789 Elm St',
        dropoffLocation: '321 Pine St',
        scheduledPickupDatetime: '2024-02-16T09:00:00.000Z',
        brokerId: 'broker-2',
        brokerName: 'CH Robinson',
        lorryId: 'XYZ-5678',
        driverId: 'driver-2',
        driverName: 'Jane Smith',
        brokerPayment: 3000,
        lorryOwnerPayment: 1800,
        driverPayment: 900,
        status: TripStatus.Delivered,
        distance: 450,
        createdAt: '2024-02-02T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];

    describe('dispatcher payment report', () => {
      it('should calculate dispatcher payment totals correctly', async () => {
        // Mock getTrips to return mock trips with new table structure
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips.map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI1PK: `DISPATCHER#${trip.dispatcherId}`,
            GSI1SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('dispatcher-123', UserRole.Dispatcher, {});

        expect(report).toMatchObject({
          totalBrokerPayments: 5500, // 2500 + 3000
          totalDriverPayments: 1700, // 800 + 900
          totalLorryOwnerPayments: 3300, // 1500 + 1800
          profit: 500, // 5500 - 1700 - 3300
          tripCount: 2,
        });
        expect(report.trips).toHaveLength(2);
      });

      it('should group by broker when requested', async () => {
        // Mock getTrips to return mock trips
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips.map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI1PK: `DISPATCHER#${trip.dispatcherId}`,
            GSI1SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('dispatcher-123', UserRole.Dispatcher, {
          groupBy: 'broker',
        }) as any;

        expect(report.groupedByBroker).toBeDefined();
        expect(report.groupedByBroker['broker-1']).toEqual({
          brokerName: 'TQL',
          totalPayment: 2500,
          tripCount: 1,
        });
        expect(report.groupedByBroker['broker-2']).toEqual({
          brokerName: 'CH Robinson',
          totalPayment: 3000,
          tripCount: 1,
        });
      });

      it('should group by driver when requested', async () => {
        // Mock getTrips to return mock trips
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips.map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI1PK: `DISPATCHER#${trip.dispatcherId}`,
            GSI1SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('dispatcher-123', UserRole.Dispatcher, {
          groupBy: 'driver',
        }) as any;

        expect(report.groupedByDriver).toBeDefined();
        expect(report.groupedByDriver['driver-1']).toEqual({
          driverName: 'John Doe',
          totalPayment: 800,
          tripCount: 1,
        });
        expect(report.groupedByDriver['driver-2']).toEqual({
          driverName: 'Jane Smith',
          totalPayment: 900,
          tripCount: 1,
        });
      });

      it('should group by lorry when requested', async () => {
        // Mock getTrips to return mock trips
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: mockTrips.map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI1PK: `DISPATCHER#${trip.dispatcherId}`,
            GSI1SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('dispatcher-123', UserRole.Dispatcher, {
          groupBy: 'lorry',
        }) as any;

        expect(report.groupedByLorry).toBeDefined();
        expect(report.groupedByLorry['ABC-1234']).toEqual({
          totalPayment: 1500,
          tripCount: 1,
        });
        expect(report.groupedByLorry['XYZ-5678']).toEqual({
          totalPayment: 1800,
          tripCount: 1,
        });
      });

      it('should apply date range filters', async () => {
        // Mock getTrips to return filtered trips
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI1PK: `DISPATCHER#${trip.dispatcherId}`,
            GSI1SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('dispatcher-123', UserRole.Dispatcher, {
          startDate: '2024-02-15',
          endDate: '2024-02-15',
        });

        // The filter is passed to getTrips, which will filter the results
        expect(mockDynamoDBClient.send).toHaveBeenCalled();
      });
    });

    describe('driver payment report', () => {

      it('should calculate driver payment totals correctly', async () => {
        const userId = 'user-driver-1';
        const driverLicenseNumber = 'driver-1';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock getTrips to return mock trips for driver using GSI3
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI3PK: `DRIVER#${driverLicenseNumber}`,
            GSI3SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport(userId, UserRole.Driver, {});

        expect(report).toMatchObject({
          totalDriverPayments: 800,
          totalDistance: 380,
          tripCount: 1,
        });
        expect(report.trips).toHaveLength(1);
      });

      it('should group by dispatcher when requested', async () => {
        const userId = 'user-driver-1';
        const driverLicenseNumber = 'driver-1';

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock getTrips to return mock trips for driver
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI3PK: `DRIVER#${driverLicenseNumber}`,
            GSI3SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport(userId, UserRole.Driver, {
          groupBy: 'dispatcher',
        }) as any;

        expect(report.groupedByDispatcher).toBeDefined();
        expect(report.groupedByDispatcher['dispatcher-123']).toEqual({
          totalPayment: 800,
          tripCount: 1,
        });
      });

      it('should handle trips with no distance', async () => {
        const userId = 'user-driver-1';
        const driverLicenseNumber = 'driver-1';
        const tripWithoutDistance = { ...mockTrips[0], distance: undefined };

        // Mock user profile lookup
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Item: {
            userId,
            driverLicenseNumber,
          },
        });

        // Mock trips query
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [tripWithoutDistance].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI3PK: `DRIVER#${driverLicenseNumber}`,
            GSI3SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport(userId, UserRole.Driver, {}) as any;

        expect(report.totalDistance).toBe(0);
      });
    });

    describe('lorry owner payment report', () => {
      it('should calculate lorry owner payment totals correctly', async () => {
        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'LORRY_OWNER#owner-1',
              SK: 'LORRY#ABC-1234',
              lorryId: 'ABC-1234',
            },
          ],
        });

        // Mock GSI2 query for trips by lorry
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI2PK: 'LORRY#ABC-1234',
            GSI2SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('owner-1', UserRole.LorryOwner, {});

        expect(report).toMatchObject({
          totalLorryOwnerPayments: 1500,
          tripCount: 1,
        });
        expect(report.trips).toHaveLength(1);
      });

      it('should group by lorry when requested', async () => {
        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'LORRY_OWNER#owner-1',
              SK: 'LORRY#ABC-1234',
              lorryId: 'ABC-1234',
            },
          ],
        });

        // Mock GSI2 query for trips by lorry
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI2PK: 'LORRY#ABC-1234',
            GSI2SK: `2024-02-15#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('owner-1', UserRole.LorryOwner, {
          groupBy: 'lorry',
        }) as any;

        expect(report.groupedByLorry).toBeDefined();
        expect(report.groupedByLorry['ABC-1234']).toEqual({
          totalPayment: 1500,
          tripCount: 1,
        });
      });

      it('should group by dispatcher when requested', async () => {
        // Mock query for lorries owned by this owner
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [
            {
              PK: 'LORRY_OWNER#owner-1',
              SK: 'LORRY#ABC-1234',
              lorryId: 'ABC-1234',
            },
          ],
        });

        // Mock GSI2 query for trips by lorry
        mockDynamoDBClient.send.mockResolvedValueOnce({
          Items: [mockTrips[0]].map((trip) => ({
            PK: `TRIP#${trip.tripId}`,
            SK: 'METADATA',
            GSI2PK: 'LORRY#ABC-1234',
            GSI2SK: `2024-02-15#${trip.lorryId}#${trip.tripId}`,
            ...trip,
          })),
        });

        const report = await service.getPaymentReport('owner-1', UserRole.LorryOwner, {
          groupBy: 'dispatcher',
        }) as any;

        expect(report.groupedByDispatcher).toBeDefined();
        expect(report.groupedByDispatcher['dispatcher-123']).toEqual({
          totalPayment: 1500,
          tripCount: 1,
        });
      });
    });

    describe('error handling', () => {
      it('should throw ForbiddenException for invalid role', async () => {
        await expect(
          service.getPaymentReport('user-123', 'InvalidRole' as UserRole, {}),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
