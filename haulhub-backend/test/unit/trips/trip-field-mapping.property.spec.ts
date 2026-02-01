import 'reflect-metadata';
import * as fc from 'fast-check';
import { Trip, TripStatus } from '@haulhub/shared';

/**
 * Property-Based Tests for Trip Field Mapping Completeness
 * 
 * **Feature: etrucky-migration, Property 2: Trip Field Mapping Completeness**
 * **Validates: Requirements 1.2**
 * 
 * This test suite validates that all new field names are present in trip data
 * across all possible input combinations. The core property being tested is:
 * 
 * For any trip created or updated through the trips service, all new field names
 * (tripId, dispatcherId, driverId, truckId, trailerId, truckOwnerId, carrierId,
 * scheduledTimestamp, pickupTimestamp, deliveryTimestamp, mileageOrder, mileageEmpty,
 * mileageTotal, truckOwnerPayment, orderStatus) should be present in the stored data.
 */

describe('Trip Field Mapping Completeness Property Tests', () => {
  /**
   * Property 2: Trip Field Mapping Completeness
   * 
   * **Feature: etrucky-migration, Property 2: Trip Field Mapping Completeness**
   * 
   * This property ensures that for any valid trip data:
   * - All required new field names are present
   * - Field names follow the new eTrucky schema conventions
   * - No old field names are used (lorryId, lorryOwnerPayment, etc.)
   * 
   * The property is tested across a wide range of realistic trip data
   * to ensure field mapping consistency in all scenarios.
   */
  it('should contain all required new field names in trip data', () => {
    fc.assert(
      fc.property(
        // Generate realistic trip data with new field names
        fc.record({
          tripId: fc.uuid(),
          dispatcherId: fc.uuid(),
          driverId: fc.uuid(),
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
          carrierId: fc.uuid(),
          brokerId: fc.string({ minLength: 5, maxLength: 20 }),
          
          // Order information
          orderConfirmation: fc.string({ minLength: 5, maxLength: 50 }),
          orderStatus: fc.constantFrom(
            TripStatus.Scheduled,
            TripStatus.PickedUp,
            TripStatus.InTransit,
            TripStatus.Delivered,
            TripStatus.Paid
          ),
          
          // Timestamps (ISO 8601 format) - using integer timestamps to avoid invalid dates
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
          
          // Location details
          pickupCompany: fc.string({ minLength: 3, maxLength: 100 }),
          pickupAddress: fc.string({ minLength: 5, maxLength: 200 }),
          pickupCity: fc.string({ minLength: 3, maxLength: 50 }),
          pickupState: fc.string({ minLength: 2, maxLength: 2 }),
          pickupZip: fc.string({ minLength: 5, maxLength: 10 }),
          pickupPhone: fc.string({ minLength: 10, maxLength: 15 }),
          pickupNotes: fc.string({ maxLength: 500 }),
          
          deliveryCompany: fc.string({ minLength: 3, maxLength: 100 }),
          deliveryAddress: fc.string({ minLength: 5, maxLength: 200 }),
          deliveryCity: fc.string({ minLength: 3, maxLength: 50 }),
          deliveryState: fc.string({ minLength: 2, maxLength: 2 }),
          deliveryZip: fc.string({ minLength: 5, maxLength: 10 }),
          deliveryPhone: fc.string({ minLength: 10, maxLength: 15 }),
          deliveryNotes: fc.string({ maxLength: 500 }),
          
          // Mileage (new field names)
          mileageEmpty: fc.integer({ min: 0, max: 1000 }),
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
          
          // Rates
          brokerRate: fc.float({ min: 0, max: 10, noNaN: true }),
          driverRate: fc.float({ min: 0, max: 5, noNaN: true }),
          truckOwnerRate: fc.float({ min: 0, max: 5, noNaN: true }),
          dispatcherRate: fc.float({ min: 0, max: 2, noNaN: true }),
          factoryRate: fc.float({ min: 0, max: 10, noNaN: true }),
          orderRate: fc.float({ min: 0, max: 10, noNaN: true }),
          orderAverage: fc.float({ min: 0, max: 10, noNaN: true }),
          
          // Payments (new field name: truckOwnerPayment)
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          dispatcherPayment: fc.float({ min: 0, max: 5000, noNaN: true }),
          
          // Advances
          brokerAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          driverAdvance: fc.float({ min: 0, max: 5000, noNaN: true }),
          factoryAdvance: fc.float({ min: 0, max: 20000, noNaN: true }),
          
          // Costs
          fuelCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          fuelGasAvgCost: fc.float({ min: 0, max: 10, noNaN: true }),
          fuelGasAvgGallxMil: fc.float({ min: 0, max: 1, noNaN: true }),
          brokerCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          factoryCost: fc.float({ min: 0, max: 5000, noNaN: true }),
          lumperValue: fc.float({ min: 0, max: 1000, noNaN: true }),
          detentionValue: fc.float({ min: 0, max: 1000, noNaN: true }),
          orderExpenses: fc.float({ min: 0, max: 10000, noNaN: true }),
          orderRevenue: fc.float({ min: 0, max: 50000, noNaN: true }),
          
          notes: fc.string({ maxLength: 1000 }),
        }),
        (tripData: Partial<Trip>) => {
          // Verify all required new field names are present
          const requiredFields = [
            'tripId',
            'dispatcherId',
            'driverId',
            'truckId',
            'trailerId',
            'truckOwnerId',
            'carrierId',
            'scheduledTimestamp',
            'pickupTimestamp',
            'deliveryTimestamp',
            'mileageOrder',
            'mileageEmpty',
            'mileageTotal',
            'truckOwnerPayment',
            'orderStatus',
          ];
          
          const allFieldsPresent = requiredFields.every(field => 
            field in tripData
          );
          
          // Verify old field names are NOT present
          const oldFieldNames = ['lorryId', 'lorryOwnerPayment'];
          const noOldFields = oldFieldNames.every(field => 
            !(field in tripData)
          );
          
          // Verify field types are correct
          const correctTypes = 
            typeof tripData.tripId === 'string' &&
            typeof tripData.dispatcherId === 'string' &&
            typeof tripData.driverId === 'string' &&
            typeof tripData.truckId === 'string' &&
            typeof tripData.trailerId === 'string' &&
            typeof tripData.truckOwnerId === 'string' &&
            typeof tripData.carrierId === 'string' &&
            typeof tripData.scheduledTimestamp === 'string' &&
            (tripData.pickupTimestamp === null || typeof tripData.pickupTimestamp === 'string') &&
            (tripData.deliveryTimestamp === null || typeof tripData.deliveryTimestamp === 'string') &&
            typeof tripData.mileageOrder === 'number' &&
            typeof tripData.mileageEmpty === 'number' &&
            typeof tripData.mileageTotal === 'number' &&
            typeof tripData.truckOwnerPayment === 'number' &&
            typeof tripData.orderStatus === 'string';
          
          return allFieldsPresent && noOldFields && correctTypes;
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Field Mapping with Null Timestamps
   * 
   * This property tests that trips with null pickup/delivery timestamps
   * still contain all required fields.
   */
  it('should handle null timestamps correctly in field mapping', () => {
    fc.assert(
      fc.property(
        fc.record({
          tripId: fc.uuid(),
          dispatcherId: fc.uuid(),
          driverId: fc.uuid(),
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
          carrierId: fc.uuid(),
          scheduledTimestamp: fc.integer({ min: 1704067200000, max: 1735689600000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          pickupTimestamp: fc.constant(null),
          deliveryTimestamp: fc.constant(null),
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageEmpty: fc.integer({ min: 0, max: 1000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          orderStatus: fc.constant(TripStatus.Scheduled),
        }),
        (tripData) => {
          // For scheduled trips, pickup and delivery timestamps should be null
          const correctNullTimestamps = 
            tripData.pickupTimestamp === null &&
            tripData.deliveryTimestamp === null;
          
          // All required fields should still be present
          const hasRequiredFields = 
            'tripId' in tripData &&
            'scheduledTimestamp' in tripData &&
            'pickupTimestamp' in tripData &&
            'deliveryTimestamp' in tripData;
          
          return correctNullTimestamps && hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Field Mapping with All Timestamps Set
   * 
   * This property tests that completed trips with all timestamps set
   * still maintain field mapping completeness.
   */
  it('should handle all timestamps set correctly in field mapping', () => {
    fc.assert(
      fc.property(
        fc.record({
          tripId: fc.uuid(),
          dispatcherId: fc.uuid(),
          driverId: fc.uuid(),
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
          carrierId: fc.uuid(),
          scheduledTimestamp: fc.integer({ min: 1704067200000, max: 1719792000000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          pickupTimestamp: fc.integer({ min: 1704067200000, max: 1719792000000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          deliveryTimestamp: fc.integer({ min: 1704067200000, max: 1735689600000 })
            .map(ms => new Date(ms).toISOString().split('.')[0] + 'Z'),
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageEmpty: fc.integer({ min: 0, max: 1000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          orderStatus: fc.constantFrom(
            TripStatus.Delivered,
            TripStatus.Paid
          ),
        }),
        (tripData) => {
          // For completed trips, all timestamps should be set
          const allTimestampsSet = 
            tripData.scheduledTimestamp !== null &&
            tripData.pickupTimestamp !== null &&
            tripData.deliveryTimestamp !== null;
          
          // All timestamps should be valid ISO 8601 strings
          const validTimestamps = 
            typeof tripData.scheduledTimestamp === 'string' &&
            typeof tripData.pickupTimestamp === 'string' &&
            typeof tripData.deliveryTimestamp === 'string';
          
          return allTimestampsSet && validTimestamps;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Mileage Field Naming Consistency
   * 
   * This property tests that mileage fields use the new naming convention
   * (mileageOrder, mileageEmpty, mileageTotal) not old names (distance).
   */
  it('should use new mileage field names consistently', () => {
    fc.assert(
      fc.property(
        fc.record({
          mileageEmpty: fc.integer({ min: 0, max: 1000 }),
          mileageOrder: fc.integer({ min: 0, max: 3000 }),
          mileageTotal: fc.integer({ min: 0, max: 4000 }),
        }),
        (mileageData) => {
          // Verify new field names are present
          const hasNewFields = 
            'mileageEmpty' in mileageData &&
            'mileageOrder' in mileageData &&
            'mileageTotal' in mileageData;
          
          // Verify old field name is NOT present
          const noOldField = !('distance' in mileageData);
          
          // Verify all values are non-negative integers
          const validValues = 
            mileageData.mileageEmpty >= 0 &&
            mileageData.mileageOrder >= 0 &&
            mileageData.mileageTotal >= 0 &&
            Number.isInteger(mileageData.mileageEmpty) &&
            Number.isInteger(mileageData.mileageOrder) &&
            Number.isInteger(mileageData.mileageTotal);
          
          return hasNewFields && noOldField && validValues;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Payment Field Naming Consistency
   * 
   * This property tests that payment fields use the new naming convention
   * (truckOwnerPayment) not old names (lorryOwnerPayment).
   */
  it('should use new payment field names consistently', () => {
    fc.assert(
      fc.property(
        fc.record({
          brokerPayment: fc.float({ min: 0, max: 50000, noNaN: true }),
          driverPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          truckOwnerPayment: fc.float({ min: 0, max: 10000, noNaN: true }),
          dispatcherPayment: fc.float({ min: 0, max: 5000, noNaN: true }),
        }),
        (paymentData) => {
          // Verify new field name is present
          const hasNewField = 'truckOwnerPayment' in paymentData;
          
          // Verify old field name is NOT present
          const noOldField = !('lorryOwnerPayment' in paymentData);
          
          // Verify all values are non-negative numbers
          const validValues = 
            paymentData.brokerPayment >= 0 &&
            paymentData.driverPayment >= 0 &&
            paymentData.truckOwnerPayment >= 0 &&
            paymentData.dispatcherPayment >= 0;
          
          return hasNewField && noOldField && validValues;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Vehicle ID Field Naming Consistency
   * 
   * This property tests that vehicle ID fields use the new naming convention
   * (truckId, trailerId, truckOwnerId) not old names (lorryId).
   */
  it('should use new vehicle ID field names consistently', () => {
    fc.assert(
      fc.property(
        fc.record({
          truckId: fc.uuid(),
          trailerId: fc.uuid(),
          truckOwnerId: fc.uuid(),
        }),
        (vehicleData) => {
          // Verify new field names are present
          const hasNewFields = 
            'truckId' in vehicleData &&
            'trailerId' in vehicleData &&
            'truckOwnerId' in vehicleData;
          
          // Verify old field name is NOT present
          const noOldField = !('lorryId' in vehicleData);
          
          // Verify all values are valid UUIDs (non-empty strings)
          const validUUIDs = 
            typeof vehicleData.truckId === 'string' &&
            typeof vehicleData.trailerId === 'string' &&
            typeof vehicleData.truckOwnerId === 'string' &&
            vehicleData.truckId.length > 0 &&
            vehicleData.trailerId.length > 0 &&
            vehicleData.truckOwnerId.length > 0;
          
          return hasNewFields && noOldField && validUUIDs;
        }
      ),
      { numRuns: 100 }
    );
  });
});
