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
    scheduledTimestamp: '2024-02-15T08:00:00Z',
    brokerId: 'broker-123',
    brokerName: 'TQL (Total Quality Logistics)',
    truckId: 'ABC-1234',
    driverId: 'DRV-001',
    driverName: 'John Doe',
    brokerPayment: 2500.0,
    truckOwnerPayment: 1500.0,
    driverPayment: 800.0,
    orderStatus: TripStatus.Scheduled,
    mileageOrder: 380,
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
      orderConfirmation: 'ORDER-123',
      scheduledTimestamp: '2024-02-15T08:00:00Z',
      pickupCompany: 'Acme Corp',
      pickupAddress: '123 Main St',
      pickupCity: 'Los Angeles',
      pickupState: 'CA',
      pickupZip: '90001',
      pickupPhone: '555-0100',
      pickupNotes: '',
      deliveryCompany: 'Beta Inc',
      deliveryAddress: '456 Oak Ave',
      deliveryCity: 'San Francisco',
      deliveryState: 'CA',
      deliveryZip: '94102',
      deliveryPhone: '555-0200',
      deliveryNotes: '',
      brokerId: 'broker-123',
      truckId: 'ABC-1234',
      trailerId: 'TRL-001',
      driverId: 'DRV-001',
      carrierId: 'carrier-001',
      truckOwnerId: 'owner-001',
      mileageEmpty: 50,
      mileageOrder: 380,
      mileageTotal: 430,
      brokerRate: 6.5,
      driverRate: 2.1,
      truckOwnerRate: 3.9,
      dispatcherRate: 0.5,
      factoryRate: 0,
      orderRate: 6.5,
      orderAverage: 6.5,
      brokerPayment: 2500.0,
      driverPayment: 800.0,
      truckOwnerPayment: 1500.0,
      dispatcherPayment: 200.0,
      brokerAdvance: 0,
      driverAdvance: 0,
      factoryAdvance: 0,
      fuelCost: 150.0,
      fuelGasAvgCost: 3.5,
      fuelGasAvgGallxMil: 0.15,
      brokerCost: 0,
      factoryCost: 0,
      lumperValue: 0,
      detentionValue: 0,
      orderExpenses: 2650.0,
      orderRevenue: 2500.0,
      notes: '',
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
      orderStatus: TripStatus.PickedUp,
    };

    it('should update trip status for dispatcher', async () => {
      const updatedTrip = { ...mockTrip, orderStatus: TripStatus.PickedUp };
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
              undefined,
              undefined,
            );
    });

    it('should update trip status for driver', async () => {
      const driverUser: CurrentUserData = {
        userId: 'DRV-001',
        email: 'driver@example.com',
        role: UserRole.Driver,
        username: 'driver',
      };

      const updatedTrip = { ...mockTrip, orderStatus: TripStatus.PickedUp };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      const result = await controller.updateTripStatus(driverUser, 'trip-123', updateStatusDto);

      expect(result).toEqual(updatedTrip);
      expect(service.updateTripStatus).toHaveBeenCalledWith(
              'trip-123',
              'DRV-001',
              UserRole.Driver,
              TripStatus.PickedUp,
              undefined,
              undefined,
            );
    });

    it('should pass correct status to service', async () => {
      const deliveredStatusDto = { orderStatus: TripStatus.Delivered };
      const updatedTrip = { ...mockTrip, orderStatus: TripStatus.Delivered };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      await controller.updateTripStatus(mockDispatcherUser, 'trip-123', deliveredStatusDto);

      expect(service.updateTripStatus).toHaveBeenCalledWith(
              'trip-123',
              'dispatcher-123',
              UserRole.Dispatcher,
              TripStatus.Delivered,
              undefined,
              undefined,
            );
    });

    it('should handle Paid status update', async () => {
      const paidStatusDto = { orderStatus: TripStatus.Paid };
      const updatedTrip = { ...mockTrip, orderStatus: TripStatus.Paid };
      mockTripsService.updateTripStatus.mockResolvedValue(updatedTrip);

      const result = await controller.updateTripStatus(
        mockDispatcherUser,
        'trip-123',
        paidStatusDto,
      );

      expect(result.orderStatus).toBe(TripStatus.Paid);
      expect(service.updateTripStatus).toHaveBeenCalledWith(
              'trip-123',
              'dispatcher-123',
              UserRole.Dispatcher,
              TripStatus.Paid,
              undefined,
              undefined,
            );
    });
  });

  describe('getTrips', () => {
    const mockTrips = [
      mockTrip,
      {
        ...mockTrip,
        tripId: 'trip-456',
        scheduledTimestamp: '2024-02-16T09:00:00Z',
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
        orderStatus: TripStatus.Delivered,
      };

      mockTripsService.getTrips.mockResolvedValue({ trips: [mockTrip] });

      await controller.getTrips(mockDispatcherUser, filters);

      expect(service.getTrips).toHaveBeenCalledWith(
        mockDispatcherUser.userId,
        UserRole.Dispatcher,
        filters,
      );
    });

    it('should pass truck filter to service', async () => {
      const filters = {
        truckId: 'ABC-1234',
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
        orderStatus: TripStatus.Delivered,
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
      totalTruckOwnerPayments: 3300,
      profit: 500,
      tripCount: 2,
      trips: [
        {
          tripId: 'trip-1',
          dispatcherId: 'dispatcher-123',
          scheduledTimestamp: '2024-02-15T08:00:00Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          truckId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          truckOwnerPayment: 1500,
          driverPayment: 800,
          mileageOrder: 380,
          orderStatus: TripStatus.Delivered,
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
          scheduledTimestamp: '2024-02-15T08:00:00Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          truckId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          truckOwnerPayment: 1500,
          driverPayment: 800,
          mileageOrder: 380,
          orderStatus: TripStatus.Delivered,
        },
      ],
    };

    const mockLorryOwnerReport = {
      totalTruckOwnerPayments: 1500,
      tripCount: 1,
      trips: [
        {
          tripId: 'trip-1',
          dispatcherId: 'dispatcher-123',
          scheduledTimestamp: '2024-02-15T08:00:00Z',
          pickupLocation: '123 Main St',
          dropoffLocation: '456 Oak Ave',
          brokerId: 'broker-1',
          brokerName: 'TQL',
          truckId: 'ABC-1234',
          driverId: 'driver-1',
          driverName: 'John Doe',
          brokerPayment: 2500,
          truckOwnerPayment: 1500,
          driverPayment: 800,
          mileageOrder: 380,
          orderStatus: TripStatus.Delivered,
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
