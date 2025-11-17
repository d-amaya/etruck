import { Test, TestingModule } from '@nestjs/testing';
import { TripsController } from '../../../src/trips/trips.controller';
import { TripsService } from '../../../src/trips/trips.service';
import { UserRole, TripStatus } from '@haulhub/shared';
import { CurrentUserData } from '../../../src/auth/decorators/current-user.decorator';

describe('TripsController', () => {
  let controller: TripsController;
  let service: jest.Mocked<TripsService>;

  const mockTripsService = {
    createTrip: jest.fn(),
    getTripById: jest.fn(),
    updateTrip: jest.fn(),
    updateTripStatus: jest.fn(),
    getTrips: jest.fn(),
    getPaymentReport: jest.fn(),
  };

  const mockDispatcherUser: CurrentUserData = {
    userId: 'dispatcher-123',
    email: 'dispatcher@example.com',
    role: UserRole.Dispatcher,
    username: 'dispatcher',
  };

  const mockDriverUser: CurrentUserData = {
    userId: 'driver-1',
    email: 'driver@example.com',
    role: UserRole.Driver,
    username: 'driver',
  };

  const mockLorryOwnerUser: CurrentUserData = {
    userId: 'owner-1',
    email: 'owner@example.com',
    role: UserRole.LorryOwner,
    username: 'owner',
  };

  const mockTrip = {
    tripId: 'trip-123',
    dispatcherId: 'dispatcher-123',
    pickupLocation: '123 Main St, Los Angeles, CA',
    dropoffLocation: '456 Oak Ave, San Francisco, CA',
    scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
    brokerId: 'broker-123',
    brokerName: 'TQL (Total Quality Logistics)',
    lorryId: 'ABC-1234',
    driverId: 'DRV-001',
    driverName: 'John Doe',
    brokerPayment: 2500.0,
    lorryOwnerPayment: 1500.0,
    driverPayment: 800.0,
    status: TripStatus.Scheduled,
    distance: 380,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [
        {
          provide: TripsService,
          useValue: mockTripsService,
        },
      ],
    })
      .overrideGuard(require('../../../src/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../src/auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TripsController>(TripsController);
    service = module.get(TripsService) as jest.Mocked<TripsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTrip', () => {
    const createTripDto = {
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
      mockTripsService.createTrip.mockResolvedValue(mockTrip);

      const result = await controller.createTrip(mockDispatcherUser, createTripDto);

      expect(result).toEqual(mockTrip);
      expect(service.createTrip).toHaveBeenCalledWith(mockDispatcherUser.userId, createTripDto);
    });

    it('should pass dispatcher userId to service', async () => {
      mockTripsService.createTrip.mockResolvedValue(mockTrip);

      await controller.createTrip(mockDispatcherUser, createTripDto);

      expect(service.createTrip).toHaveBeenCalledWith('dispatcher-123', createTripDto);
    });
  });

  describe('getTripById', () => {
    it('should get trip by ID for dispatcher', async () => {
      mockTripsService.getTripById.mockResolvedValue(mockTrip);

      const result = await controller.getTripById(mockDispatcherUser, 'trip-123');

      expect(result).toEqual(mockTrip);
      expect(service.getTripById).toHaveBeenCalledWith(
        'trip-123',
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
      );
    });

    it('should pass correct role to service', async () => {
      const driverUser: CurrentUserData = {
        userId: 'driver-123',
        email: 'driver@example.com',
        role: UserRole.Driver,
        username: 'driver',
      };

      mockTripsService.getTripById.mockResolvedValue(mockTrip);

      await controller.getTripById(driverUser, 'trip-123');

      expect(service.getTripById).toHaveBeenCalledWith('trip-123', 'driver-123', UserRole.Driver);
    });
  });

  describe('updateTrip', () => {
    const updateTripDto = {
      pickupLocation: 'Updated pickup location',
      brokerPayment: 2600.0,
    };

    it('should update trip successfully', async () => {
      const updatedTrip = { ...mockTrip, ...updateTripDto };
      mockTripsService.updateTrip.mockResolvedValue(updatedTrip);

      const result = await controller.updateTrip(mockDispatcherUser, 'trip-123', updateTripDto);

      expect(result).toEqual(updatedTrip);
      expect(service.updateTrip).toHaveBeenCalledWith(
        'trip-123',
        mockDispatcherUser.userId,
        updateTripDto,
      );
    });

    it('should pass dispatcher userId to service', async () => {
      mockTripsService.updateTrip.mockResolvedValue(mockTrip);

      await controller.updateTrip(mockDispatcherUser, 'trip-123', updateTripDto);

      expect(service.updateTrip).toHaveBeenCalledWith('trip-123', 'dispatcher-123', updateTripDto);
    });
  });

  describe('updateTripStatus', () => {
    const updateStatusDto = {
      status: TripStatus.PickedUp,
    };

    it('should update trip status for dispatcher', async () => {
      const updatedTrip = { ...mockTrip, status: TripStatus.PickedUp };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      const result = await controller.updateTripStatus(
        mockDispatcherUser,
        'trip-123',
        updateStatusDto,
      );

      expect(result).toEqual(updatedTrip);
      expect(service.updateTripStatus).toHaveBeenCalledWith(
        'trip-123',
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        TripStatus.PickedUp,
      );
    });

    it('should update trip status for driver', async () => {
      const driverUser: CurrentUserData = {
        userId: 'DRV-001',
        email: 'driver@example.com',
        role: UserRole.Driver,
        username: 'driver',
      };

      const updatedTrip = { ...mockTrip, status: TripStatus.PickedUp };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      const result = await controller.updateTripStatus(driverUser, 'trip-123', updateStatusDto);

      expect(result).toEqual(updatedTrip);
      expect(service.updateTripStatus).toHaveBeenCalledWith(
        'trip-123',
        'DRV-001',
        UserRole.Driver,
        TripStatus.PickedUp,
      );
    });

    it('should pass correct status to service', async () => {
      const deliveredStatusDto = { status: TripStatus.Delivered };
      const updatedTrip = { ...mockTrip, status: TripStatus.Delivered };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      await controller.updateTripStatus(mockDispatcherUser, 'trip-123', deliveredStatusDto);

      expect(service.updateTripStatus).toHaveBeenCalledWith(
        'trip-123',
        'dispatcher-123',
        UserRole.Dispatcher,
        TripStatus.Delivered,
      );
    });

    it('should handle Paid status update', async () => {
      const paidStatusDto = { status: TripStatus.Paid };
      const updatedTrip = { ...mockTrip, status: TripStatus.Paid };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      const result = await controller.updateTripStatus(
        mockDispatcherUser,
        'trip-123',
        paidStatusDto,
      );

      expect(result.status).toBe(TripStatus.Paid);
      expect(service.updateTripStatus).toHaveBeenCalledWith(
        'trip-123',
        'dispatcher-123',
        UserRole.Dispatcher,
        TripStatus.Paid,
      );
    });
  });

  describe('getTrips', () => {
    const mockTrips = [
      mockTrip,
      {
        ...mockTrip,
        tripId: 'trip-456',
        scheduledPickupDatetime: '2024-02-16T09:00:00.000Z',
      },
    ];

    it('should get trips for dispatcher', async () => {
      mockTripsService.getTrips.mockResolvedValue({ trips: mockTrips });

      const result = await controller.getTrips(mockDispatcherUser, {});

      expect(result.trips).toHaveLength(2);
      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        {},
      );
    });

    it('should get trips for driver', async () => {
      const driverUser: CurrentUserData = {
        userId: 'DRV-001',
        email: 'driver@example.com',
        role: UserRole.Driver,
        username: 'driver',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      const result = await controller.getTrips(driverUser, {});

      expect(result.trips).toHaveLength(1);
      expect(service.getTrips).toHaveBeenCalledWith('DRV-001', UserRole.Driver, {});
    });

    it('should get trips for lorry owner', async () => {
      const lorryOwnerUser: CurrentUserData = {
        userId: 'owner-123',
        email: 'owner@example.com',
        role: UserRole.LorryOwner,
        username: 'owner',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      const result = await controller.getTrips(lorryOwnerUser, {});

      expect(result.trips).toHaveLength(1);
      expect(service.getTrips).toHaveBeenCalledWith('owner-123', UserRole.LorryOwner, {});
    });

    it('should pass date range filters to service', async () => {
      const filters = {
        startDate: '2024-02-01',
        endDate: '2024-02-28',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: mockTrips });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass broker filter to service', async () => {
      const filters = {
        brokerId: 'broker-123',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass status filter to service', async () => {
      const filters = {
        status: TripStatus.Delivered,
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass lorry filter to service', async () => {
      const filters = {
        lorryId: 'ABC-1234',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass driver filter to service', async () => {
      const filters = {
        driverId: 'DRV-001',
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass pagination parameters to service', async () => {
      const filters = {
        limit: 25,
        lastEvaluatedKey: 'encoded-key',
      };

      mockTripsService.getTrips.mockResolvedValue({
        trips: mockTrips,
        lastEvaluatedKey: 'next-encoded-key',
      });

      const result = await controller.getTrips(mockDispatcherUser, filters);

      expect(result.lastEvaluatedKey).toBe('next-encoded-key');
      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass multiple filters to service', async () => {
      const filters = {
        startDate: '2024-02-01',
        endDate: '2024-02-28',
        brokerId: 'broker-123',
        status: TripStatus.Delivered,
        limit: 50,
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should return empty array when no trips found', async () => {
      mockTripsService.getTrips.mockResolvedValue({ trips: [] });

      const result = await controller.getTrips(mockDispatcherUser, {});

      expect(result.trips).toHaveLength(0);
    });
  });

  describe('getPaymentReport', () => {
    const mockDispatcherReport = {
      totalBrokerPayments: 5500,
      totalDriverPayments: 1700,
      totalLorryOwnerPayments: 3300,
      profit: 500,
      tripCount: 2,
      trips: [
        {
          tripId: 'trip-1',
          dispatcherId: 'dispatcher-123',
          scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          lorryId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          lorryOwnerPayment: 1500,
          driverPayment: 800,
          distance: 380,
          status: TripStatus.Delivered,
        },
      ],
    };

    const mockDriverReport = {
      totalDriverPayments: 800,
      totalDistance: 380,
      tripCount: 1,
      trips: [
        {
          tripId: 'trip-1',
          dispatcherId: 'dispatcher-123',
          scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          lorryId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          lorryOwnerPayment: 1500,
          driverPayment: 800,
          distance: 380,
          status: TripStatus.Delivered,
        },
      ],
    };

    const mockLorryOwnerReport = {
      totalLorryOwnerPayments: 1500,
      tripCount: 1,
      trips: [
        {
          tripId: 'trip-1',
          dispatcherId: 'dispatcher-123',
          scheduledPickupDatetime: '2024-02-15T08:00:00.000Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          lorryId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          lorryOwnerPayment: 1500,
          driverPayment: 800,
          distance: 380,
          status: TripStatus.Delivered,
        },
      ],
    };

    it('should return dispatcher payment report', async () => {
      mockTripsService.getPaymentReport.mockResolvedValue(mockDispatcherReport);

      const result = await controller.getPaymentReport(mockDispatcherUser, {});

      expect(service.getPaymentReport).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        {},
      );
      expect(result).toEqual(mockDispatcherReport);
    });

    it('should return driver payment report', async () => {
      mockTripsService.getPaymentReport.mockResolvedValue(mockDriverReport);

      const result = await controller.getPaymentReport(mockDriverUser, {});

      expect(service.getPaymentReport).toHaveBeenCalledWith(
        mockDriverUser.userId,
        UserRole.Driver,
        {},
      );
      expect(result).toEqual(mockDriverReport);
    });

    it('should return lorry owner payment report', async () => {
      mockTripsService.getPaymentReport.mockResolvedValue(mockLorryOwnerReport);

      const result = await controller.getPaymentReport(mockLorryOwnerUser, {});

      expect(service.getPaymentReport).toHaveBeenCalledWith(
        mockLorryOwnerUser.userId,
        UserRole.LorryOwner,
        {},
      );
      expect(result).toEqual(mockLorryOwnerReport);
    });

    it('should pass filters to service', async () => {
      const filters = {
        startDate: '2024-02-01',
        endDate: '2024-02-28',
        brokerId: 'broker-123',
        groupBy: 'broker',
      };

      mockTripsService.getPaymentReport.mockResolvedValue(mockDispatcherReport);

      await controller.getPaymentReport(mockDispatcherUser, filters);

      expect(service.getPaymentReport).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should handle groupBy parameter', async () => {
      const reportWithGrouping = {
        ...mockDispatcherReport,
        groupedByBroker: {
          'broker-1': {
            brokerName: 'TQL',
            totalPayment: 2500,
            tripCount: 1,
          },
        },
      };

      mockTripsService.getPaymentReport.mockResolvedValue(reportWithGrouping);

      const result = await controller.getPaymentReport(mockDispatcherUser, { groupBy: 'broker' });

      expect(result.groupedByBroker).toBeDefined();
      expect(result.groupedByBroker['broker-1']).toEqual({
        brokerName: 'TQL',
        totalPayment: 2500,
        tripCount: 1,
      });
    });
  });
});
