import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { TripStatus } from '@haulhub/shared';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let tripsService: TripsService;

  const mockTripsService = {
    awsService: {
      getDynamoDBClient: jest.fn().mockReturnValue({
        send: jest.fn(),
      }),
    },
    tripsTableName: 'test-trips-table',
    mapItemToTrip: jest.fn((item) => ({
      tripId: item.tripId,
      dispatcherId: item.dispatcherId,
      pickupLocation: item.pickupLocation,
      dropoffLocation: item.dropoffLocation,
      scheduledPickupDatetime: item.scheduledPickupDatetime,
      brokerId: item.brokerId,
      brokerName: item.brokerName,
      lorryId: item.lorryId,
      driverId: item.driverId,
      driverName: item.driverName,
      brokerPayment: item.brokerPayment,
      lorryOwnerPayment: item.lorryOwnerPayment,
      driverPayment: item.driverPayment,
      status: item.status,
      distance: item.distance,
      lumperFees: item.lumperFees || 0,
      detentionFees: item.detentionFees || 0,
      deliveredAt: item.deliveredAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };

  const mockUsersService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: TripsService,
          useValue: mockTripsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    tripsService = module.get<TripsService>(TripsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFleetOverview', () => {
    it('should return fleet overview with real data', async () => {
      const mockTrips = [
        {
          tripId: '1',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          lorryId: 'lorry1',
          status: TripStatus.InTransit,
          brokerPayment: 1000,
          driverPayment: 500,
          lorryOwnerPayment: 300,
          distance: 100,
          scheduledPickupDatetime: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          lorryId: 'lorry2',
          status: TripStatus.Delivered,
          brokerPayment: 1500,
          driverPayment: 700,
          lorryOwnerPayment: 400,
          distance: 150,
          scheduledPickupDatetime: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockResolvedValue({
          Items: mockTrips,
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getFleetOverview('dispatcher1');

      expect(result).toBeDefined();
      expect(result.drivers.total).toBe(2);
      expect(result.vehicles.total).toBe(2);
      expect(result.trips.total).toBe(2);
      expect(result.trips.completed).toBe(1);
      expect(result.trips.inProgress).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      const mockDynamoDBClient = {
        send: jest.fn().mockRejectedValue(new Error('DynamoDB error')),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getFleetOverview('dispatcher1');

      expect(result).toBeDefined();
      expect(result.drivers.total).toBe(0);
      expect(result.vehicles.total).toBe(0);
      expect(result.trips.total).toBe(0);
    });
  });

  describe('getTripAnalytics', () => {
    it('should calculate trip analytics correctly', async () => {
      const mockTrips = [
        {
          tripId: '1',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          lorryId: 'lorry1',
          status: TripStatus.Delivered,
          brokerPayment: 1000,
          driverPayment: 500,
          lorryOwnerPayment: 300,
          distance: 100,
          lumperFees: 50,
          detentionFees: 25,
          scheduledPickupDatetime: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          lorryId: 'lorry2',
          status: TripStatus.Paid,
          brokerPayment: 1500,
          driverPayment: 700,
          lorryOwnerPayment: 400,
          distance: 150,
          lumperFees: 0,
          detentionFees: 0,
          scheduledPickupDatetime: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockResolvedValue({
          Items: mockTrips,
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getTripAnalytics('dispatcher1');

      expect(result).toBeDefined();
      expect(result.totalTrips).toBe(2);
      expect(result.completedTrips).toBe(2);
      expect(result.totalRevenue).toBe(2500);
      expect(result.totalExpenses).toBe(1975); // 500+300+50+25 + 700+400
      expect(result.totalProfit).toBe(525);
      expect(result.averageDistance).toBe(125);
      expect(result.averageRevenue).toBe(1250);
    });
  });

  describe('getDriverPerformance', () => {
    it('should calculate driver performance metrics', async () => {
      const mockTrips = [
        {
          tripId: '1',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          driverName: 'John Doe',
          lorryId: 'lorry1',
          status: TripStatus.Delivered,
          brokerPayment: 1000,
          driverPayment: 500,
          lorryOwnerPayment: 300,
          distance: 100,
          scheduledPickupDatetime: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          driverName: 'John Doe',
          lorryId: 'lorry2',
          status: TripStatus.Delivered,
          brokerPayment: 1500,
          driverPayment: 700,
          lorryOwnerPayment: 400,
          distance: 150,
          scheduledPickupDatetime: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockResolvedValue({
          Items: mockTrips,
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getDriverPerformance('dispatcher1');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].driverId).toBe('driver1');
      expect(result[0].totalTrips).toBe(2);
      expect(result[0].completedTrips).toBe(2);
      expect(result[0].totalDistance).toBe(250);
      expect(result[0].totalRevenue).toBe(1200);
    });
  });

  describe('getVehicleUtilization', () => {
    it('should calculate vehicle utilization metrics', async () => {
      const mockTrips = [
        {
          tripId: '1',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          lorryId: 'lorry1',
          status: TripStatus.Delivered,
          brokerPayment: 1000,
          driverPayment: 500,
          lorryOwnerPayment: 300,
          distance: 100,
          scheduledPickupDatetime: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          lorryId: 'lorry1',
          status: TripStatus.Delivered,
          brokerPayment: 1500,
          driverPayment: 700,
          lorryOwnerPayment: 400,
          distance: 150,
          scheduledPickupDatetime: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockResolvedValue({
          Items: mockTrips,
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getVehicleUtilization('dispatcher1');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].vehicleId).toBe('lorry1');
      expect(result[0].totalTrips).toBe(2);
      expect(result[0].totalDistance).toBe(250);
      expect(result[0].totalRevenue).toBe(700);
    });
  });
});
