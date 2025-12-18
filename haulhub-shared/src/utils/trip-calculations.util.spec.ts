import * as fc from 'fast-check';
import { Trip } from '../interfaces/trip.interface';
import { TripStatus } from '../enums/trip-status.enum';
import {
  calculateTripExpenses,
  calculateTripProfit,
  calculateFuelCost,
  hasFuelData
} from './trip-calculations.util';

describe('Trip Calculations Utility', () => {
  describe('calculateTripExpenses', () => {
    it('should calculate basic expenses with only driver and lorry owner payments', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const expenses = calculateTripExpenses(trip);
      expect(expenses).toBe(700); // 400 + 300
    });

    it('should include fuel costs when fuel data is available', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        loadedMiles: 100,
        emptyMiles: 50,
        fuelAvgCost: 3.5,
        fuelAvgGallonsPerMile: 0.15,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const expenses = calculateTripExpenses(trip);
      // 400 + 300 + (150 miles * 0.15 gallons/mile * $3.5/gallon) = 700 + 78.75 = 778.75
      expect(expenses).toBe(778.75);
    });

    it('should include additional fees', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        lumperFees: 50,
        detentionFees: 75,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const expenses = calculateTripExpenses(trip);
      expect(expenses).toBe(825); // 400 + 300 + 50 + 75
    });

    it('should handle missing optional fields gracefully', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const expenses = calculateTripExpenses(trip);
      expect(expenses).toBe(700);
    });

    it('should calculate all expenses together', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 2000,
        lorryOwnerPayment: 500,
        driverPayment: 400,
        status: TripStatus.Scheduled,
        loadedMiles: 200,
        emptyMiles: 100,
        fuelAvgCost: 4.0,
        fuelAvgGallonsPerMile: 0.2,
        lumperFees: 100,
        detentionFees: 150,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const expenses = calculateTripExpenses(trip);
      // 500 + 400 + (300 * 0.2 * 4.0) + 100 + 150 = 500 + 400 + 240 + 100 + 150 = 1390
      expect(expenses).toBe(1390);
    });
  });

  describe('calculateTripProfit', () => {
    it('should calculate profit correctly', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const profit = calculateTripProfit(trip);
      expect(profit).toBe(300); // 1000 - 700
    });

    it('should calculate loss correctly', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 500,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const profit = calculateTripProfit(trip);
      expect(profit).toBe(-200); // 500 - 700
    });

    it('should handle zero profit', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 700,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const profit = calculateTripProfit(trip);
      expect(profit).toBe(0);
    });
  });

  describe('calculateFuelCost', () => {
    it('should calculate fuel cost correctly', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        loadedMiles: 100,
        emptyMiles: 50,
        fuelAvgCost: 3.5,
        fuelAvgGallonsPerMile: 0.15,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const fuelCost = calculateFuelCost(trip);
      expect(fuelCost).toBe(78.75); // 150 * 0.15 * 3.5
    });

    it('should return 0 when fuel data is missing', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        loadedMiles: 100,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const fuelCost = calculateFuelCost(trip);
      expect(fuelCost).toBe(0);
    });

    it('should use distance field if loadedMiles is not available', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        distance: 100,
        emptyMiles: 50,
        fuelAvgCost: 3.5,
        fuelAvgGallonsPerMile: 0.15,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      const fuelCost = calculateFuelCost(trip);
      expect(fuelCost).toBe(78.75); // 150 * 0.15 * 3.5
    });
  });

  describe('hasFuelData', () => {
    it('should return true when fuel data is complete', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        fuelAvgCost: 3.5,
        fuelAvgGallonsPerMile: 0.15,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      expect(hasFuelData(trip)).toBe(true);
    });

    it('should return false when fuel cost is missing', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        fuelAvgGallonsPerMile: 0.15,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      expect(hasFuelData(trip)).toBe(false);
    });

    it('should return false when gallons per mile is missing', () => {
      const trip: Trip = {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        scheduledPickupDatetime: '2024-01-15T08:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'lorry-1',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 400,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        fuelAvgCost: 3.5,
        createdAt: '2024-01-10T10:00:00Z',
        updatedAt: '2024-01-10T10:00:00Z'
      };

      expect(hasFuelData(trip)).toBe(false);
    });
  });

  describe('Property-Based Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('profit should always equal revenue minus expenses', () => {
      fc.assert(
        fc.property(
          fc.record({
            brokerPayment: fc.double({ min: 100, max: 10000, noNaN: true }),
            lorryOwnerPayment: fc.double({ min: 50, max: 5000, noNaN: true }),
            driverPayment: fc.double({ min: 50, max: 5000, noNaN: true }),
            lumperFees: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined }),
            detentionFees: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined })
          }),
          (payments) => {
            const trip: Trip = {
              tripId: 'test-trip',
              dispatcherId: 'dispatcher-1',
              pickupLocation: 'City A',
              dropoffLocation: 'City B',
              scheduledPickupDatetime: '2024-01-15T08:00:00Z',
              brokerId: 'broker-1',
              brokerName: 'Test Broker',
              lorryId: 'lorry-1',
              driverId: 'driver-1',
              driverName: 'John Doe',
              status: TripStatus.Scheduled,
              createdAt: '2024-01-10T10:00:00Z',
              updatedAt: '2024-01-10T10:00:00Z',
              ...payments
            };

            const profit = calculateTripProfit(trip);
            const expenses = calculateTripExpenses(trip);
            const revenue = trip.brokerPayment;

            expect(profit).toBeCloseTo(revenue - expenses, 2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('expenses should never be negative', () => {
      fc.assert(
        fc.property(
          fc.record({
            brokerPayment: fc.double({ min: 100, max: 10000, noNaN: true }),
            lorryOwnerPayment: fc.double({ min: 0, max: 5000, noNaN: true }),
            driverPayment: fc.double({ min: 0, max: 5000, noNaN: true }),
            lumperFees: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined }),
            detentionFees: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined })
          }),
          (payments) => {
            const trip: Trip = {
              tripId: 'test-trip',
              dispatcherId: 'dispatcher-1',
              pickupLocation: 'City A',
              dropoffLocation: 'City B',
              scheduledPickupDatetime: '2024-01-15T08:00:00Z',
              brokerId: 'broker-1',
              brokerName: 'Test Broker',
              lorryId: 'lorry-1',
              driverId: 'driver-1',
              driverName: 'John Doe',
              status: TripStatus.Scheduled,
              createdAt: '2024-01-10T10:00:00Z',
              updatedAt: '2024-01-10T10:00:00Z',
              ...payments
            };

            const expenses = calculateTripExpenses(trip);
            expect(expenses).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuel cost should be proportional to miles and fuel price', () => {
      fc.assert(
        fc.property(
          fc.record({
            loadedMiles: fc.double({ min: 10, max: 1000, noNaN: true }),
            emptyMiles: fc.double({ min: 0, max: 500, noNaN: true }),
            fuelAvgCost: fc.double({ min: 2.5, max: 6.0, noNaN: true }),
            fuelAvgGallonsPerMile: fc.double({ min: 0.1, max: 0.3, noNaN: true })
          }),
          (fuelData) => {
            const trip: Trip = {
              tripId: 'test-trip',
              dispatcherId: 'dispatcher-1',
              pickupLocation: 'City A',
              dropoffLocation: 'City B',
              scheduledPickupDatetime: '2024-01-15T08:00:00Z',
              brokerId: 'broker-1',
              brokerName: 'Test Broker',
              lorryId: 'lorry-1',
              driverId: 'driver-1',
              driverName: 'John Doe',
              brokerPayment: 1000,
              lorryOwnerPayment: 400,
              driverPayment: 300,
              status: TripStatus.Scheduled,
              createdAt: '2024-01-10T10:00:00Z',
              updatedAt: '2024-01-10T10:00:00Z',
              ...fuelData
            };

            const fuelCost = calculateFuelCost(trip);
            const expectedCost = (fuelData.loadedMiles + fuelData.emptyMiles) * 
                                 fuelData.fuelAvgGallonsPerMile * 
                                 fuelData.fuelAvgCost;

            expect(fuelCost).toBeCloseTo(expectedCost, 2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
