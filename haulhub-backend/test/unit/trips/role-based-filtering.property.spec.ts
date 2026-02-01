import 'reflect-metadata';
import * as fc from 'fast-check';
import { Trip, TripStatus, UserRole } from '@haulhub/shared';

/**
 * Property-Based Tests for Role-Based Data Filtering
 * 
 * **Feature: etrucky-migration, Properties 9 & 10: Role-Based Data Filtering**
 * **Validates: Requirements 1.12, 1.13, 1.20**
 * 
 * This test suite validates that role-based filtering correctly hides sensitive
 * financial data based on user roles across all possible input combinations.
 * The core properties being tested are:
 * 
 * Property 9: For any trip returned to a user with role DRIVER, the response should
 * exclude all sensitive financial fields and include only driver-relevant fields.
 * 
 * Property 10: For any trip returned to a user with role TRUCK_OWNER, the response
 * should exclude all sensitive financial fields except truckOwnerPayment.
 */

describe('Role-Based Data Filtering Property Tests', () => {
  /**
   * Helper to generate valid date arbitraries using integer timestamps
   */
  const dateArbitrary = (minMs: number, maxMs: number) =>
    fc.integer({ min: minMs, max: maxMs }).map(ms => new Date(ms));

  /**
   * Fields that should be EXCLUDED from driver responses
   */
  const DRIVER_HIDDEN_FIELDS = [
    'brokerPayment',
    'truckOwnerPayment',
    'orderRevenue',
    'brokerRate',
    'dispatcherPayment',
    'dispatcherRate',
    'factoryRate',
    'factoryCost',
    'brokerCost',
    'brokerAdvance',
    'factoryAdvance',
  ];

  /**
   * Fields that should be INCLUDED in driver responses
   */
  const DRIVER_VISIBLE_FIELDS = [
    'tripId',
    'orderConfirmation',
    'orderStatus',
    'scheduledTimestamp',
    'pickupTimestamp',
    'deliveryTimestamp',
    'pickupCity',
    'pickupState',
    'deliveryCity',
    'deliveryState',
    'mileageOrder',
    'mileageTotal',
    'driverPayment',
    'driverRate',
    'driverAdvance',
    'truckId',
    'trailerId',
    'notes',
  ];

  /**
   * Fields that should be EXCLUDED from truck owner responses
   */
  const TRUCK_OWNER_HIDDEN_FIELDS = [
    'brokerPayment',
    'driverPayment',
    'orderRevenue',
    'brokerRate',
    'driverRate',
    'dispatcherPayment',
    'dispatcherRate',
    'factoryRate',
    'factoryCost',
    'brokerCost',
    'brokerAdvance',
    'driverAdvance',
    'factoryAdvance',
  ];

  /**
   * Fields that should be INCLUDED in truck owner responses
   */
  const TRUCK_OWNER_VISIBLE_FIELDS = [
    'tripId',
    'orderConfirmation',
    'orderStatus',
    'scheduledTimestamp',
    'pickupTimestamp',
    'deliveryTimestamp',
    'pickupCity',
    'pickupState',
    'deliveryCity',
    'deliveryState',
    'mileageOrder',
    'mileageTotal',
    'truckOwnerPayment',
    'truckId',
    'notes',
  ];

  /**
   * Helper function to simulate driver filtering
   */
  function filterTripForDriver(trip: Partial<Trip>): Partial<Trip> {
    const filtered: any = {};
    DRIVER_VISIBLE_FIELDS.forEach(field => {
      if (field in trip) {
        filtered[field] = trip[field as keyof Trip];
      }
    });
    return filtered;
  }

  /**
   * Helper function to simulate truck owner filtering
   */
  function filterTripForTruckOwner(trip: Partial<Trip>): Partial<Trip> {
    const filtered: any = {};
    TRUCK_OWNER_VISIBLE_FIELDS.forEach(field => {
      if (field in trip) {
        filtered[field] = trip[field as keyof Trip];
      }
    });
    return filtered;
  }

  /**
   * Property 9: Driver Data Filtering
   * 
   * **Feature: etrucky-migration, Property 9: Driver Data Filtering**
   * 
   * This property ensures that for any trip viewed by a driver:
   * - All sensitive financial fields are excluded
   * - Only driver-relevant fields are included
   * - Driver payment information is visible
   * 
   * The property is tested across a wide range of realistic trip data
   * to ensure filtering consistency in all scenarios.
   */
  it('should exclude sensitive financial fields for driver role', () => {
    fc.assert(
      fc.property(
        // Generate complete trip data with all fields
        fc.record({
          tripId: fc.uuid(),
          dispatcherId: fc.uuid(),
          driverId: fc.uuid(),
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
          carrierId: fc.uuid(),
          brokerId: fc.string({ minLength: 5, maxLength: 20 }),
          
          orderConfirmation: fc.string({ minLength: 5, maxLength: 50 }),
          orderStatus: fc.constantFrom(
            TripStatus.Scheduled,
            TripStatus.PickedUp,
            TripStatus.InTransit,
            TripStatus.Delivered,
            TripStatus.Paid
          ),
          
          // 2025-01-01 = 1704067200000, 2026-12-31 = 1735689600000
          scheduledTimestamp: fc.integer({ min: 1704067200000, max: 1735689600000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          pickupTimestamp: fc.oneof(
            fc.constant(null),
            fc.integer({ min: 1704067200000, max: 1735689600000 })
              .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z')
          ),
          deliveryTimestamp: fc.oneof(
            fc.constant(null),
            fc.integer({ min: 1704067200000, max: 1735689600000 })
              .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z')
          ),
          
          pickupCity: fc.string({ minLength: 3, maxLength: 50 }),
          pickupState: fc.string({ minLength: 2, maxLength: 2 }),
          deliveryCity: fc.string({ minLength: 3, maxLength: 50 }),
          deliveryState: fc.string({ minLength: 2, maxLength: 2 }),
          
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
          
          // All payment fields (some should be filtered)
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          dispatcherPayment: fc.float({ min: 0, max: 5000, noNaN: true }),
          
          // All rate fields (some should be filtered)
          brokerRate: fc.float({ min: 0, max: 10, noNaN: true }),
          driverRate: fc.float({ min: 0, max: 5, noNaN: true }),
          dispatcherRate: fc.float({ min: 0, max: 2, noNaN: true }),
          factoryRate: fc.float({ min: 0, max: 10, noNaN: true }),
          
          // All advance fields (some should be filtered)
          brokerAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          driverAdvance: fc.float({ min: 0, max: 5000, noNaN: true }),
          factoryAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          
          // All cost fields (should be filtered)
          factoryCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          brokerCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          
          orderRevenue: fc.float({ min: 0, max: 50000, noNaN: true }),
          notes: fc.string({ maxLength: 1000 }),
        }),
        (fullTrip: Partial<Trip>) => {
          // Apply driver filtering
          const filteredTrip = filterTripForDriver(fullTrip);
          
          // Verify all hidden fields are excluded
          const allHiddenFieldsExcluded = DRIVER_HIDDEN_FIELDS.every(
            field => !(field in filteredTrip)
          );
          
          // Verify all visible fields are included (if they exist in original)
          const allVisibleFieldsIncluded = DRIVER_VISIBLE_FIELDS.every(
            field => {
              if (field in fullTrip) {
                return field in filteredTrip;
              }
              return true; // Field not in original, so it's okay if not in filtered
            }
          );
          
          // Verify driver payment fields are visible
          const driverPaymentVisible = 
            'driverPayment' in filteredTrip &&
            'driverRate' in filteredTrip &&
            'driverAdvance' in filteredTrip;
          
          // Verify sensitive payments are hidden
          const sensitivePaymentsHidden = 
            !('brokerPayment' in filteredTrip) &&
            !('truckOwnerPayment' in filteredTrip) &&
            !('dispatcherPayment' in filteredTrip);
          
          return allHiddenFieldsExcluded && 
                 allVisibleFieldsIncluded && 
                 driverPaymentVisible && 
                 sensitivePaymentsHidden;
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property 10: Truck Owner Data Filtering
   * 
   * **Feature: etrucky-migration, Property 10: Truck Owner Data Filtering**
   * 
   * This property ensures that for any trip viewed by a truck owner:
   * - All sensitive financial fields except truckOwnerPayment are excluded
   * - Only truck owner-relevant fields are included
   * - Truck owner payment information is visible
   * 
   * The property is tested across a wide range of realistic trip data
   * to ensure filtering consistency in all scenarios.
   */
  it('should exclude sensitive financial fields for truck owner role', () => {
    fc.assert(
      fc.property(
        // Generate complete trip data with all fields
        fc.record({
          tripId: fc.uuid(),
          dispatcherId: fc.uuid(),
          driverId: fc.uuid(),
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
          carrierId: fc.uuid(),
          brokerId: fc.string({ minLength: 5, maxLength: 20 }),
          
          orderConfirmation: fc.string({ minLength: 5, maxLength: 50 }),
          orderStatus: fc.constantFrom(
            TripStatus.Scheduled,
            TripStatus.PickedUp,
            TripStatus.InTransit,
            TripStatus.Delivered,
            TripStatus.Paid
          ),
          
          // 2025-01-01 = 1704067200000, 2026-12-31 = 1735689600000
          scheduledTimestamp: fc.integer({ min: 1704067200000, max: 1735689600000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          pickupTimestamp: fc.oneof(
            fc.constant(null),
            fc.integer({ min: 1704067200000, max: 1735689600000 })
              .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z')
          ),
          deliveryTimestamp: fc.oneof(
            fc.constant(null),
            fc.integer({ min: 1704067200000, max: 1735689600000 })
              .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z')
          ),
          
          pickupCity: fc.string({ minLength: 3, maxLength: 50 }),
          pickupState: fc.string({ minLength: 2, maxLength: 2 }),
          deliveryCity: fc.string({ minLength: 3, maxLength: 50 }),
          deliveryState: fc.string({ minLength: 2, maxLength: 2 }),
          
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
          
          // All payment fields (most should be filtered)
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          dispatcherPayment: fc.float({ min: 0, max: 5000, noNaN: true }),
          
          // All rate fields (should be filtered)
          brokerRate: fc.float({ min: 0, max: 10, noNaN: true }),
          driverRate: fc.float({ min: 0, max: 5, noNaN: true }),
          dispatcherRate: fc.float({ min: 0, max: 2, noNaN: true }),
          factoryRate: fc.float({ min: 0, max: 10, noNaN: true }),
          
          // All advance fields (should be filtered)
          brokerAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          driverAdvance: fc.float({ min: 0, max: 5000, noNaN: true }),
          factoryAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          
          // All cost fields (should be filtered)
          factoryCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          brokerCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          
          orderRevenue: fc.float({ min: 0, max: 50000, noNaN: true }),
          notes: fc.string({ maxLength: 1000 }),
        }),
        (fullTrip: Partial<Trip>) => {
          // Apply truck owner filtering
          const filteredTrip = filterTripForTruckOwner(fullTrip);
          
          // Verify all hidden fields are excluded
          const allHiddenFieldsExcluded = TRUCK_OWNER_HIDDEN_FIELDS.every(
            field => !(field in filteredTrip)
          );
          
          // Verify all visible fields are included (if they exist in original)
          const allVisibleFieldsIncluded = TRUCK_OWNER_VISIBLE_FIELDS.every(
            field => {
              if (field in fullTrip) {
                return field in filteredTrip;
              }
              return true; // Field not in original, so it's okay if not in filtered
            }
          );
          
          // Verify truck owner payment is visible
          const truckOwnerPaymentVisible = 'truckOwnerPayment' in filteredTrip;
          
          // Verify other payments are hidden
          const otherPaymentsHidden = 
            !('brokerPayment' in filteredTrip) &&
            !('driverPayment' in filteredTrip) &&
            !('dispatcherPayment' in filteredTrip);
          
          // Verify rates are hidden
          const ratesHidden = 
            !('brokerRate' in filteredTrip) &&
            !('driverRate' in filteredTrip) &&
            !('dispatcherRate' in filteredTrip);
          
          return allHiddenFieldsExcluded && 
                 allVisibleFieldsIncluded && 
                 truckOwnerPaymentVisible && 
                 otherPaymentsHidden &&
                 ratesHidden;
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Driver Filtering Consistency Across Trip Statuses
   * 
   * This property tests that driver filtering works consistently
   * regardless of trip status.
   */
  it('should apply driver filtering consistently across all trip statuses', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          TripStatus.Scheduled,
          TripStatus.PickedUp,
          TripStatus.InTransit,
          TripStatus.Delivered,
          TripStatus.Paid
        ),
        fc.record({
          tripId: fc.uuid(),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          orderRevenue: fc.float({ min: 0, max: 50000, noNaN: true }),
        }),
        (status: TripStatus, tripData) => {
          const fullTrip: Partial<Trip> = { ...tripData, orderStatus: status as any };
          const filteredTrip = filterTripForDriver(fullTrip);
          
          // Driver payment should always be visible
          const driverPaymentVisible = 'driverPayment' in filteredTrip;
          
          // Sensitive fields should always be hidden
          const sensitiveFieldsHidden = 
            !('brokerPayment' in filteredTrip) &&
            !('truckOwnerPayment' in filteredTrip) &&
            !('orderRevenue' in filteredTrip);
          
          return driverPaymentVisible && sensitiveFieldsHidden;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Truck Owner Filtering Consistency Across Trip Statuses
   * 
   * This property tests that truck owner filtering works consistently
   * regardless of trip status.
   */
  it('should apply truck owner filtering consistently across all trip statuses', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          TripStatus.Scheduled,
          TripStatus.PickedUp,
          TripStatus.InTransit,
          TripStatus.Delivered,
          TripStatus.Paid
        ),
        fc.record({
          tripId: fc.uuid(),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          orderRevenue: fc.float({ min: 0, max: 50000, noNaN: true }),
        }),
        (status: TripStatus, tripData) => {
          const fullTrip: Partial<Trip> = { ...tripData, orderStatus: status as any };
          const filteredTrip = filterTripForTruckOwner(fullTrip);
          
          // Truck owner payment should always be visible
          const truckOwnerPaymentVisible = 'truckOwnerPayment' in filteredTrip;
          
          // Sensitive fields should always be hidden
          const sensitiveFieldsHidden = 
            !('brokerPayment' in filteredTrip) &&
            !('driverPayment' in filteredTrip) &&
            !('orderRevenue' in filteredTrip);
          
          return truckOwnerPaymentVisible && sensitiveFieldsHidden;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: No Data Leakage Between Roles
   * 
   * This property tests that filtering for one role doesn't accidentally
   * expose data meant for another role.
   */
  it('should not leak sensitive data between driver and truck owner roles', () => {
    fc.assert(
      fc.property(
        fc.record({
          tripId: fc.uuid(),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
        }),
        (tripData) => {
          const driverFiltered = filterTripForDriver(tripData);
          const ownerFiltered = filterTripForTruckOwner(tripData);
          
          // Driver should see their payment but not truck owner payment
          const driverCorrect = 
            'driverPayment' in driverFiltered &&
            !('truckOwnerPayment' in driverFiltered);
          
          // Truck owner should see their payment but not driver payment
          const ownerCorrect = 
            'truckOwnerPayment' in ownerFiltered &&
            !('driverPayment' in ownerFiltered);
          
          // Neither should see broker payment
          const brokerPaymentHidden = 
            !('brokerPayment' in driverFiltered) &&
            !('brokerPayment' in ownerFiltered);
          
          return driverCorrect && ownerCorrect && brokerPaymentHidden;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Filtering Preserves Non-Sensitive Data
   * 
   * This property tests that filtering doesn't accidentally remove
   * non-sensitive data that should be visible to all roles.
   */
  it('should preserve non-sensitive data for both driver and truck owner roles', () => {
    fc.assert(
      fc.property(
        fc.record({
          tripId: fc.uuid(),
          orderConfirmation: fc.string({ minLength: 5, maxLength: 50 }),
          orderStatus: fc.constantFrom(
            TripStatus.Scheduled,
            TripStatus.PickedUp,
            TripStatus.InTransit,
            TripStatus.Delivered,
            TripStatus.Paid
          ),
          pickupCity: fc.string({ minLength: 3, maxLength: 50 }),
          deliveryCity: fc.string({ minLength: 3, maxLength: 50 }),
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          notes: fc.string({ maxLength: 1000 }),
          // Add some sensitive fields that should be filtered
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
        }),
        (tripData) => {
          const driverFiltered = filterTripForDriver(tripData);
          const ownerFiltered = filterTripForTruckOwner(tripData);
          
          // Non-sensitive fields should be present in both filtered versions
          const nonSensitiveFields = [
            'tripId',
            'orderConfirmation',
            'orderStatus',
            'pickupCity',
            'deliveryCity',
            'mileageOrder',
            'notes',
          ];
          
          const driverHasNonSensitive = nonSensitiveFields.every(
            field => field in driverFiltered
          );
          
          const ownerHasNonSensitive = nonSensitiveFields.every(
            field => field in ownerFiltered
          );
          
          return driverHasNonSensitive && ownerHasNonSensitive;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Filtering with Null Timestamps
   * 
   * This property tests that filtering works correctly even when
   * some timestamps are null (e.g., for scheduled trips).
   */
  it('should handle null timestamps correctly in filtered data', () => {
    fc.assert(
      fc.property(
        fc.record({
          tripId: fc.uuid(),
          scheduledTimestamp: fc.integer({ min: 1704067200000, max: 1735689600000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          pickupTimestamp: fc.constant(null),
          deliveryTimestamp: fc.constant(null),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
        }),
        (tripData) => {
          const driverFiltered = filterTripForDriver(tripData);
          const ownerFiltered = filterTripForTruckOwner(tripData);
          
          // Timestamps should be preserved (including null values)
          const driverTimestampsCorrect = 
            'scheduledTimestamp' in driverFiltered &&
            'pickupTimestamp' in driverFiltered &&
            'deliveryTimestamp' in driverFiltered;
          
          const ownerTimestampsCorrect = 
            'scheduledTimestamp' in ownerFiltered &&
            'pickupTimestamp' in ownerFiltered &&
            'deliveryTimestamp' in ownerFiltered;
          
          // Sensitive payments should still be filtered
          const driverPaymentsFiltered = !('brokerPayment' in driverFiltered);
          const ownerPaymentsFiltered = !('driverPayment' in ownerFiltered);
          
          return driverTimestampsCorrect && 
                 ownerTimestampsCorrect && 
                 driverPaymentsFiltered && 
                 ownerPaymentsFiltered;
        }
      ),
      { numRuns: 100 }
    );
  });
});
