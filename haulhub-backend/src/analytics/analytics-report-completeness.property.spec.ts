/**
 * Property-Based Test for Report Data Completeness
 * 
 * Feature: etrucky-feature-parity, Property 10: Report Data Completeness
 * Validates: Requirements 4.5, 15.1, 15.2, 15.3, 15.4, 15.5
 * 
 * Property: For any generated report, all relevant data categories should be included 
 * and calculations should be accurate across all financial and operational metrics
 */

import { Test, TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import { AnalyticsService } from './analytics.service';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { TripStatus } from '@haulhub/shared';

describe('Analytics Report Data Completeness (Property-Based)', () => {
  let service: AnalyticsService;
  let mockDynamoDBClient: any;

  // Generator for valid trip data
  const tripArbitrary = fc.record({
    tripId: fc.uuid(),
    dispatcherId: fc.uuid(),
    driverId: fc.uuid(),
    driverName: fc.string({ minLength: 3, maxLength: 50 }),
    lorryId: fc.uuid(),
    status: fc.constantFrom(
      TripStatus.Scheduled,
      TripStatus.PickedUp,
      TripStatus.InTransit,
      TripStatus.Delivered,
      TripStatus.Paid
    ),
    brokerPayment: fc.integer({ min: 100, max: 10000 }),
    driverPayment: fc.integer({ min: 50, max: 5000 }),
    lorryOwnerPayment: fc.integer({ min: 50, max: 3000 }),
    distance: fc.integer({ min: 10, max: 3000 }),
    lumperFees: fc.integer({ min: 0, max: 500 }),
    detentionFees: fc.integer({ min: 0, max: 500 }),
    scheduledPickupDatetime: fc.integer({ min: Date.parse('2024-01-01'), max: Date.parse('2024-12-31') })
      .map(timestamp => new Date(timestamp).toISOString()),
    pickupLocation: fc.string({ minLength: 5, maxLength: 100 }),
    dropoffLocation: fc.string({ minLength: 5, maxLength: 100 }),
    brokerId: fc.uuid(),
    brokerName: fc.string({ minLength: 3, maxLength: 50 }),
    deliveredAt: fc.option(fc.integer({ min: Date.parse('2024-01-01'), max: Date.parse('2024-12-31') })
      .map(timestamp => new Date(timestamp).toISOString())),
    createdAt: fc.integer({ min: Date.parse('2024-01-01'), max: Date.parse('2024-12-31') })
      .map(timestamp => new Date(timestamp).toISOString()),
    updatedAt: fc.integer({ min: Date.parse('2024-01-01'), max: Date.parse('2024-12-31') })
      .map(timestamp => new Date(timestamp).toISOString()),
  });

  const mockTripsService = {
    awsService: {
      getDynamoDBClient: jest.fn(),
    },
    tripsTableName: 'test-trips-table',
    mapItemToTrip: jest.fn((item) => item),
  };

  const mockUsersService = {};

  beforeEach(async () => {
    mockDynamoDBClient = {
      send: jest.fn(),
    };

    mockTripsService.awsService.getDynamoDBClient.mockReturnValue(mockDynamoDBClient);

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 10: Report Data Completeness', () => {
    it('should include all required fields in fleet overview report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get fleet overview report
            const report = await service.getFleetOverview();

            // Verify all required data categories are present
            expect(report).toHaveProperty('drivers');
            expect(report).toHaveProperty('vehicles');
            expect(report).toHaveProperty('trips');

            // Verify drivers section completeness
            expect(report.drivers).toHaveProperty('total');
            expect(report.drivers).toHaveProperty('active');
            expect(report.drivers).toHaveProperty('onTrip');
            expect(report.drivers).toHaveProperty('utilization');

            // Verify vehicles section completeness
            expect(report.vehicles).toHaveProperty('total');
            expect(report.vehicles).toHaveProperty('available');
            expect(report.vehicles).toHaveProperty('inUse');
            expect(report.vehicles).toHaveProperty('maintenance');
            expect(report.vehicles).toHaveProperty('utilization');

            // Verify trips section completeness
            expect(report.trips).toHaveProperty('total');
            expect(report.trips).toHaveProperty('completed');
            expect(report.trips).toHaveProperty('inProgress');
            expect(report.trips).toHaveProperty('planned');

            // Verify all values are numbers
            expect(typeof report.drivers.total).toBe('number');
            expect(typeof report.drivers.active).toBe('number');
            expect(typeof report.drivers.onTrip).toBe('number');
            expect(typeof report.drivers.utilization).toBe('number');
            expect(typeof report.vehicles.total).toBe('number');
            expect(typeof report.vehicles.available).toBe('number');
            expect(typeof report.vehicles.inUse).toBe('number');
            expect(typeof report.vehicles.maintenance).toBe('number');
            expect(typeof report.vehicles.utilization).toBe('number');
            expect(typeof report.trips.total).toBe('number');
            expect(typeof report.trips.completed).toBe('number');
            expect(typeof report.trips.inProgress).toBe('number');
            expect(typeof report.trips.planned).toBe('number');

            // Verify non-negative values
            expect(report.drivers.total).toBeGreaterThanOrEqual(0);
            expect(report.drivers.active).toBeGreaterThanOrEqual(0);
            expect(report.drivers.onTrip).toBeGreaterThanOrEqual(0);
            expect(report.drivers.utilization).toBeGreaterThanOrEqual(0);
            expect(report.vehicles.total).toBeGreaterThanOrEqual(0);
            expect(report.vehicles.available).toBeGreaterThanOrEqual(0);
            expect(report.vehicles.inUse).toBeGreaterThanOrEqual(0);
            expect(report.vehicles.maintenance).toBeGreaterThanOrEqual(0);
            expect(report.vehicles.utilization).toBeGreaterThanOrEqual(0);
            expect(report.trips.total).toBeGreaterThanOrEqual(0);
            expect(report.trips.completed).toBeGreaterThanOrEqual(0);
            expect(report.trips.inProgress).toBeGreaterThanOrEqual(0);
            expect(report.trips.planned).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required fields in trip analytics report with accurate calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get trip analytics report
            const report = await service.getTripAnalytics();

            // Verify all required fields are present
            expect(report).toHaveProperty('totalTrips');
            expect(report).toHaveProperty('completedTrips');
            expect(report).toHaveProperty('totalRevenue');
            expect(report).toHaveProperty('totalExpenses');
            expect(report).toHaveProperty('totalProfit');
            expect(report).toHaveProperty('averageDistance');
            expect(report).toHaveProperty('averageRevenue');
            expect(report).toHaveProperty('onTimeDeliveryRate');
            expect(report).toHaveProperty('fuelEfficiency');

            // Verify all values are numbers
            expect(typeof report.totalTrips).toBe('number');
            expect(typeof report.completedTrips).toBe('number');
            expect(typeof report.totalRevenue).toBe('number');
            expect(typeof report.totalExpenses).toBe('number');
            expect(typeof report.totalProfit).toBe('number');
            expect(typeof report.averageDistance).toBe('number');
            expect(typeof report.averageRevenue).toBe('number');
            expect(typeof report.onTimeDeliveryRate).toBe('number');
            expect(typeof report.fuelEfficiency).toBe('number');

            // Verify calculation accuracy: totalProfit = totalRevenue - totalExpenses
            const expectedProfit = report.totalRevenue - report.totalExpenses;
            expect(report.totalProfit).toBeCloseTo(expectedProfit, 2);

            // Verify calculation accuracy: averageRevenue = totalRevenue / totalTrips
            if (report.totalTrips > 0) {
              const expectedAvgRevenue = report.totalRevenue / report.totalTrips;
              expect(report.averageRevenue).toBeCloseTo(expectedAvgRevenue, 2);
            } else {
              expect(report.averageRevenue).toBe(0);
            }

            // Verify calculation accuracy: averageDistance = totalDistance / totalTrips
            const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
            if (report.totalTrips > 0) {
              const expectedAvgDistance = totalDistance / report.totalTrips;
              expect(report.averageDistance).toBeCloseTo(expectedAvgDistance, 2);
            } else {
              expect(report.averageDistance).toBe(0);
            }

            // Verify non-negative values
            expect(report.totalTrips).toBeGreaterThanOrEqual(0);
            expect(report.completedTrips).toBeGreaterThanOrEqual(0);
            expect(report.totalRevenue).toBeGreaterThanOrEqual(0);
            expect(report.totalExpenses).toBeGreaterThanOrEqual(0);
            expect(report.averageDistance).toBeGreaterThanOrEqual(0);
            expect(report.averageRevenue).toBeGreaterThanOrEqual(0);
            expect(report.onTimeDeliveryRate).toBeGreaterThanOrEqual(0);
            expect(report.onTimeDeliveryRate).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required fields in driver performance report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get driver performance report
            const report = await service.getDriverPerformance();

            // Verify report is an array
            expect(Array.isArray(report)).toBe(true);

            // If there are drivers, verify each entry has all required fields
            if (report.length > 0) {
              for (const driverPerf of report) {
                expect(driverPerf).toHaveProperty('driverId');
                expect(driverPerf).toHaveProperty('driverName');
                expect(driverPerf).toHaveProperty('totalTrips');
                expect(driverPerf).toHaveProperty('completedTrips');
                expect(driverPerf).toHaveProperty('totalDistance');
                expect(driverPerf).toHaveProperty('totalRevenue');
                expect(driverPerf).toHaveProperty('averageRevenue');
                expect(driverPerf).toHaveProperty('onTimeDeliveryRate');

                // Verify all values are of correct type
                expect(typeof driverPerf.driverId).toBe('string');
                expect(typeof driverPerf.driverName).toBe('string');
                expect(typeof driverPerf.totalTrips).toBe('number');
                expect(typeof driverPerf.completedTrips).toBe('number');
                expect(typeof driverPerf.totalDistance).toBe('number');
                expect(typeof driverPerf.totalRevenue).toBe('number');
                expect(typeof driverPerf.averageRevenue).toBe('number');
                expect(typeof driverPerf.onTimeDeliveryRate).toBe('number');

                // Verify calculation accuracy: averageRevenue = totalRevenue / totalTrips
                if (driverPerf.totalTrips > 0) {
                  const expectedAvgRevenue = driverPerf.totalRevenue / driverPerf.totalTrips;
                  expect(driverPerf.averageRevenue).toBeCloseTo(expectedAvgRevenue, 2);
                }

                // Verify non-negative values
                expect(driverPerf.totalTrips).toBeGreaterThanOrEqual(0);
                expect(driverPerf.completedTrips).toBeGreaterThanOrEqual(0);
                expect(driverPerf.totalDistance).toBeGreaterThanOrEqual(0);
                expect(driverPerf.totalRevenue).toBeGreaterThanOrEqual(0);
                expect(driverPerf.averageRevenue).toBeGreaterThanOrEqual(0);
                expect(driverPerf.onTimeDeliveryRate).toBeGreaterThanOrEqual(0);
                expect(driverPerf.onTimeDeliveryRate).toBeLessThanOrEqual(100);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required fields in vehicle utilization report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get vehicle utilization report
            const report = await service.getVehicleUtilization();

            // Verify report is an array
            expect(Array.isArray(report)).toBe(true);

            // If there are vehicles, verify each entry has all required fields
            if (report.length > 0) {
              for (const vehicleUtil of report) {
                expect(vehicleUtil).toHaveProperty('vehicleId');
                expect(vehicleUtil).toHaveProperty('vehicleName');
                expect(vehicleUtil).toHaveProperty('totalTrips');
                expect(vehicleUtil).toHaveProperty('totalDistance');
                expect(vehicleUtil).toHaveProperty('totalRevenue');
                expect(vehicleUtil).toHaveProperty('utilizationRate');
                expect(vehicleUtil).toHaveProperty('averageRevenuePerTrip');

                // Verify all values are of correct type
                expect(typeof vehicleUtil.vehicleId).toBe('string');
                expect(typeof vehicleUtil.vehicleName).toBe('string');
                expect(typeof vehicleUtil.totalTrips).toBe('number');
                expect(typeof vehicleUtil.totalDistance).toBe('number');
                expect(typeof vehicleUtil.totalRevenue).toBe('number');
                expect(typeof vehicleUtil.utilizationRate).toBe('number');
                expect(typeof vehicleUtil.averageRevenuePerTrip).toBe('number');

                // Verify calculation accuracy: averageRevenuePerTrip = totalRevenue / totalTrips
                if (vehicleUtil.totalTrips > 0) {
                  const expectedAvgRevenue = vehicleUtil.totalRevenue / vehicleUtil.totalTrips;
                  expect(vehicleUtil.averageRevenuePerTrip).toBeCloseTo(expectedAvgRevenue, 2);
                }

                // Verify non-negative values
                expect(vehicleUtil.totalTrips).toBeGreaterThanOrEqual(0);
                expect(vehicleUtil.totalDistance).toBeGreaterThanOrEqual(0);
                expect(vehicleUtil.totalRevenue).toBeGreaterThanOrEqual(0);
                expect(vehicleUtil.utilizationRate).toBeGreaterThanOrEqual(0);
                expect(vehicleUtil.utilizationRate).toBeLessThanOrEqual(100);
                expect(vehicleUtil.averageRevenuePerTrip).toBeGreaterThanOrEqual(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required fields in revenue analytics report with accurate calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get revenue analytics report
            const report = await service.getRevenueAnalytics();

            // Verify all required fields are present
            expect(report).toHaveProperty('monthlyData');
            expect(report).toHaveProperty('totalRevenue');
            expect(report).toHaveProperty('totalExpenses');
            expect(report).toHaveProperty('totalProfit');
            expect(report).toHaveProperty('averageMonthlyRevenue');

            // Verify monthlyData is an array
            expect(Array.isArray(report.monthlyData)).toBe(true);

            // Verify each monthly entry has required fields
            for (const monthData of report.monthlyData) {
              expect(monthData).toHaveProperty('month');
              expect(monthData).toHaveProperty('revenue');
              expect(monthData).toHaveProperty('expenses');
              expect(monthData).toHaveProperty('profit');

              expect(typeof monthData.month).toBe('string');
              expect(typeof monthData.revenue).toBe('number');
              expect(typeof monthData.expenses).toBe('number');
              expect(typeof monthData.profit).toBe('number');

              // Verify calculation accuracy: profit = revenue - expenses
              expect(monthData.profit).toBeCloseTo(monthData.revenue - monthData.expenses, 2);
            }

            // Verify all values are numbers
            expect(typeof report.totalRevenue).toBe('number');
            expect(typeof report.totalExpenses).toBe('number');
            expect(typeof report.totalProfit).toBe('number');
            expect(typeof report.averageMonthlyRevenue).toBe('number');

            // Verify calculation accuracy: totalProfit = totalRevenue - totalExpenses
            expect(report.totalProfit).toBeCloseTo(report.totalRevenue - report.totalExpenses, 2);

            // Verify calculation accuracy: averageMonthlyRevenue = totalRevenue / monthCount
            if (report.monthlyData.length > 0) {
              const expectedAvgMonthlyRevenue = report.totalRevenue / report.monthlyData.length;
              expect(report.averageMonthlyRevenue).toBeCloseTo(expectedAvgMonthlyRevenue, 2);
            } else {
              expect(report.averageMonthlyRevenue).toBe(0);
            }

            // Verify non-negative values
            expect(report.totalRevenue).toBeGreaterThanOrEqual(0);
            expect(report.totalExpenses).toBeGreaterThanOrEqual(0);
            expect(report.averageMonthlyRevenue).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required fields in maintenance alerts report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 1, maxLength: 50 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get maintenance alerts report
            const report = await service.getMaintenanceAlerts();

            // Verify all required fields are present
            expect(report).toHaveProperty('vehicleAlerts');
            expect(report).toHaveProperty('driverAlerts');

            // Verify both are arrays
            expect(Array.isArray(report.vehicleAlerts)).toBe(true);
            expect(Array.isArray(report.driverAlerts)).toBe(true);

            // Verify each vehicle alert has required fields
            for (const alert of report.vehicleAlerts) {
              expect(alert).toHaveProperty('vehicleId');
              expect(alert).toHaveProperty('alertType');
              expect(alert).toHaveProperty('message');
              expect(alert).toHaveProperty('severity');

              expect(typeof alert.vehicleId).toBe('string');
              expect(typeof alert.alertType).toBe('string');
              expect(typeof alert.message).toBe('string');
              expect(typeof alert.severity).toBe('string');
            }

            // Verify each driver alert has required fields
            for (const alert of report.driverAlerts) {
              expect(alert).toHaveProperty('driverId');
              expect(alert).toHaveProperty('driverName');
              expect(alert).toHaveProperty('alertType');
              expect(alert).toHaveProperty('message');
              expect(alert).toHaveProperty('severity');

              expect(typeof alert.driverId).toBe('string');
              expect(typeof alert.driverName).toBe('string');
              expect(typeof alert.alertType).toBe('string');
              expect(typeof alert.message).toBe('string');
              expect(typeof alert.severity).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data consistency across all reports for the same dataset', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripArbitrary, { minLength: 5, maxLength: 30 }),
          async (trips) => {
            // Setup mock to return generated trips
            mockDynamoDBClient.send.mockResolvedValue({
              Items: trips,
            });

            // Get all reports
            const fleetOverview = await service.getFleetOverview();
            const tripAnalytics = await service.getTripAnalytics();
            const driverPerformance = await service.getDriverPerformance();
            const vehicleUtilization = await service.getVehicleUtilization();
            const revenueAnalytics = await service.getRevenueAnalytics();

            // Verify trip count consistency
            expect(fleetOverview.trips.total).toBe(tripAnalytics.totalTrips);

            // Verify revenue consistency
            expect(tripAnalytics.totalRevenue).toBeCloseTo(revenueAnalytics.totalRevenue, 2);
            expect(tripAnalytics.totalExpenses).toBeCloseTo(revenueAnalytics.totalExpenses, 2);
            expect(tripAnalytics.totalProfit).toBeCloseTo(revenueAnalytics.totalProfit, 2);

            // Verify driver count consistency
            const uniqueDrivers = new Set(trips.map(t => t.driverId));
            expect(fleetOverview.drivers.total).toBe(uniqueDrivers.size);
            expect(driverPerformance.length).toBeLessThanOrEqual(uniqueDrivers.size);

            // Verify vehicle count consistency
            const uniqueVehicles = new Set(trips.map(t => t.lorryId));
            expect(fleetOverview.vehicles.total).toBe(uniqueVehicles.size);
            expect(vehicleUtilization.length).toBeLessThanOrEqual(uniqueVehicles.size);

            // Verify total trip count matches sum of driver trips
            const totalDriverTrips = driverPerformance.reduce((sum, d) => sum + d.totalTrips, 0);
            expect(totalDriverTrips).toBe(trips.length);

            // Verify total trip count matches sum of vehicle trips
            const totalVehicleTrips = vehicleUtilization.reduce((sum, v) => sum + v.totalTrips, 0);
            expect(totalVehicleTrips).toBe(trips.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
