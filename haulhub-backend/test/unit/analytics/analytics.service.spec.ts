import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../../src/analytics/analytics.service';
import { TripsService } from '../../../src/trips/trips.service';
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
    configService: {
      eTruckyUsersTableName: 'eTrucky-Users',
      eTruckyTrucksTableName: 'eTrucky-Trucks',
      eTruckyTrailersTableName: 'eTrucky-Trailers',
      eTruckyBrokersTableName: 'eTrucky-Brokers',
    },
    mapItemToTrip: jest.fn((item) => ({
      tripId: item.tripId,
      dispatcherId: item.dispatcherId,
      pickupCity: item.pickupCity,
      deliveryCity: item.deliveryCity,
      scheduledTimestamp: item.scheduledTimestamp,
      brokerId: item.brokerId,
      brokerName: item.brokerName,
      truckId: item.truckId,
      driverId: item.driverId,
      driverName: item.driverName,
      brokerPayment: item.brokerPayment,
      truckOwnerPayment: item.truckOwnerPayment,
      driverPayment: item.driverPayment,
      orderStatus: item.orderStatus,
      mileageOrder: item.mileageOrder,
      mileageEmpty: item.mileageEmpty || 0,
      mileageTotal: item.mileageTotal || item.mileageOrder,
      lumperValue: item.lumperValue || 0,
      detentionValue: item.detentionValue || 0,
      fuelCost: item.fuelCost || 0,
      fuelGasAvgCost: item.fuelGasAvgCost || 0,
      fuelGasAvgGallxMil: item.fuelGasAvgGallxMil || 0,
      deliveryTimestamp: item.deliveryTimestamp,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: TripsService,
          useValue: mockTripsService,
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
          truckId: 'truck1',
          orderStatus: 'In Transit' as any,
          brokerPayment: 1000,
          driverPayment: 500,
          truckOwnerPayment: 300,
          mileageOrder: 100,
          mileageEmpty: 20,
          mileageTotal: 120,
          scheduledTimestamp: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          truckId: 'truck2',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1500,
          driverPayment: 700,
          truckOwnerPayment: 400,
          mileageOrder: 150,
          mileageEmpty: 30,
          mileageTotal: 180,
          scheduledTimestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockImplementation((command) => {
          if (command.constructor.name === 'QueryCommand') {
            return Promise.resolve({ Items: mockTrips });
          }
          if (command.constructor.name === 'GetCommand') {
            const key = command.input.Key;
            if (key.PK.startsWith('USER#')) {
              return Promise.resolve({ Item: { userId: 'driver1', name: 'John Doe', ss: '123-45-6789' } });
            }
            if (key.PK.startsWith('TRUCK#')) {
              return Promise.resolve({ Item: { truckId: 'truck1', plate: 'ABC-123', brand: 'Volvo', year: 2020 } });
            }
          }
          return Promise.resolve({});
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
          truckId: 'truck1',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1000,
          driverPayment: 500,
          truckOwnerPayment: 300,
          mileageOrder: 100,
          mileageEmpty: 20,
          mileageTotal: 120,
          lumperValue: 50,
          detentionValue: 25,
          fuelCost: 100,
          scheduledTimestamp: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          truckId: 'truck2',
          orderStatus: 'Paid' as any,
          brokerPayment: 1500,
          driverPayment: 700,
          truckOwnerPayment: 400,
          mileageOrder: 150,
          mileageEmpty: 30,
          mileageTotal: 180,
          lumperValue: 0,
          detentionValue: 0,
          fuelCost: 150,
          scheduledTimestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockImplementation((command) => {
          if (command.constructor.name === 'QueryCommand') {
            return Promise.resolve({ Items: mockTrips });
          }
          if (command.constructor.name === 'GetCommand') {
            const key = command.input.Key;
            if (key.PK.startsWith('USER#')) {
              return Promise.resolve({ Item: { userId: 'driver1', name: 'John Doe', ss: '123-45-6789' } });
            }
            if (key.PK.startsWith('TRUCK#')) {
              return Promise.resolve({ Item: { truckId: 'truck1', plate: 'ABC-123', brand: 'Volvo', year: 2020 } });
            }
          }
          return Promise.resolve({});
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getTripAnalytics('dispatcher1', 'Dispatcher');

      expect(result).toBeDefined();
      expect(result.totalTrips).toBe(2);
      expect(result.completedTrips).toBe(2);
      expect(result.totalRevenue).toBe(2500);
      expect(result.totalExpenses).toBe(2225); // 500+300+50+25+100 + 700+400+150
      expect(result.totalProfit).toBe(275);
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
          truckId: 'truck1',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1000,
          driverPayment: 500,
          truckOwnerPayment: 300,
          mileageOrder: 100,
          mileageEmpty: 20,
          mileageTotal: 120,
          scheduledTimestamp: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver1',
          driverName: 'John Doe',
          truckId: 'truck2',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1500,
          driverPayment: 700,
          truckOwnerPayment: 400,
          mileageOrder: 150,
          mileageEmpty: 30,
          mileageTotal: 180,
          scheduledTimestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockImplementation((command) => {
          if (command.constructor.name === 'QueryCommand') {
            return Promise.resolve({ Items: mockTrips });
          }
          if (command.constructor.name === 'GetCommand') {
            const key = command.input.Key;
            if (key.PK.startsWith('USER#')) {
              return Promise.resolve({ Item: { userId: 'driver1', name: 'John Doe', ss: '123-45-6789' } });
            }
            if (key.PK.startsWith('TRUCK#')) {
              return Promise.resolve({ Item: { truckId: 'truck1', plate: 'ABC-123', brand: 'Volvo', year: 2020 } });
            }
          }
          return Promise.resolve({});
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getDriverPerformance('dispatcher1', 'Dispatcher');

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
          truckId: 'truck1',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1000,
          driverPayment: 500,
          truckOwnerPayment: 300,
          mileageOrder: 100,
          mileageEmpty: 20,
          mileageTotal: 120,
          scheduledTimestamp: '2024-01-01T00:00:00Z',
        },
        {
          tripId: '2',
          dispatcherId: 'dispatcher1',
          driverId: 'driver2',
          truckId: 'truck1',
          orderStatus: 'Delivered' as any,
          brokerPayment: 1500,
          driverPayment: 700,
          truckOwnerPayment: 400,
          mileageOrder: 150,
          mileageEmpty: 30,
          mileageTotal: 180,
          scheduledTimestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const mockDynamoDBClient = {
        send: jest.fn().mockImplementation((command) => {
          if (command.constructor.name === 'QueryCommand') {
            return Promise.resolve({ Items: mockTrips });
          }
          if (command.constructor.name === 'GetCommand') {
            const key = command.input.Key;
            if (key.PK.startsWith('USER#')) {
              return Promise.resolve({ Item: { userId: 'driver1', name: 'John Doe', ss: '123-45-6789' } });
            }
            if (key.PK.startsWith('TRUCK#')) {
              return Promise.resolve({ Item: { truckId: 'truck1', plate: 'ABC-123', brand: 'Volvo', year: 2020 } });
            }
          }
          return Promise.resolve({});
        }),
      };

      mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

      const result = await service.getVehicleUtilization('dispatcher1', 'Dispatcher');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].vehicleId).toBe('truck1');
      expect(result[0].totalTrips).toBe(2);
      expect(result[0].totalDistance).toBe(250);
      expect(result[0].totalRevenue).toBe(700);
    });
  });
});
