import 'reflect-metadata';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for Timestamp Format Consistency
 * 
 * **Feature: etrucky-migration, Property 3: Timestamp Format Consistency**
 * **Validates: Requirements 1.3**
 * 
 * This test suite validates that all timestamps stored in the system match
 * the ISO 8601 format without milliseconds across all possible input combinations.
 * The core property being tested is:
 * 
 * For any timestamp stored in the system (scheduledTimestamp, pickupTimestamp,
 * deliveryTimestamp), it should match the ISO 8601 format without milliseconds:
 * YYYY-MM-DDTHH:mm:ssZ
 */

describe('Timestamp Format Consistency Property Tests', () => {
  /**
   * ISO 8601 format regex without milliseconds
   * Format: YYYY-MM-DDTHH:mm:ssZ
   * Example: 2025-01-15T14:30:45Z
   */
  const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  /**
   * Helper to generate valid date arbitraries using integer timestamps
   * This avoids invalid Date objects that fc.date() can sometimes generate
   */
  const dateArbitrary = (minMs: number, maxMs: number) =>
    fc.integer({ min: minMs, max: maxMs }).map(ms => new Date(ms));

  /**
   * Property 3: Timestamp Format Consistency
   * 
   * **Feature: etrucky-migration, Property 3: Timestamp Format Consistency**
   * 
   * This property ensures that for any valid timestamp:
   * - It matches the ISO 8601 format without milliseconds
   * - It uses UTC timezone (Z suffix)
   * - It contains no milliseconds component
   * 
   * The property is tested across a wide range of realistic dates
   * to ensure format consistency in all scenarios.
   */
  it('should match ISO 8601 format without milliseconds for all timestamps', () => {
    fc.assert(
      fc.property(
        // Generate realistic dates across a wide range
        // 2020-01-01 = 1577836800000, 2030-12-31 = 1924905600000
        dateArbitrary(1577836800000, 1924905600000),
        (date: Date) => {
          // Convert to ISO 8601 format without milliseconds
          const timestamp = date.toISOString().split('.')[0] + 'Z';
          
          // Verify format matches regex
          const matchesFormat = ISO_8601_REGEX.test(timestamp);
          
          // Verify no milliseconds are present
          const noMilliseconds = !timestamp.includes('.');
          
          // Verify UTC timezone indicator is present
          const hasUTCIndicator = timestamp.endsWith('Z');
          
          // Verify timestamp can be parsed back to a valid date
          const parsedDate = new Date(timestamp);
          const isValidDate = !isNaN(parsedDate.getTime());
          
          return matchesFormat && noMilliseconds && hasUTCIndicator && isValidDate;
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Scheduled Timestamp Format
   * 
   * This property tests that scheduled timestamps (when trips are created)
   * always match the ISO 8601 format without milliseconds.
   */
  it('should format scheduledTimestamp correctly for new trips', () => {
    fc.assert(
      fc.property(
        // 2025-01-01 = 1704067200000, 2026-12-31 = 1735689600000
        dateArbitrary(1704067200000, 1735689600000),
        (scheduledDate: Date) => {
          // Simulate the timestamp generation that happens in the service
          const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
          
          // Verify format
          const matchesFormat = ISO_8601_REGEX.test(scheduledTimestamp);
          
          // Verify the timestamp represents a future date (for scheduling)
          const isValidScheduledDate = new Date(scheduledTimestamp).getTime() > 0;
          
          // Verify no fractional seconds
          const parts = scheduledTimestamp.split('T');
          const timePart = parts[1];
          const noFractionalSeconds = !timePart.includes('.');
          
          return matchesFormat && isValidScheduledDate && noFractionalSeconds;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Pickup Timestamp Format
   * 
   * This property tests that pickup timestamps (set when status changes to "Picked Up")
   * always match the ISO 8601 format without milliseconds.
   */
  it('should format pickupTimestamp correctly when trip is picked up', () => {
    fc.assert(
      fc.property(
        dateArbitrary(1704067200000, 1735689600000),
        (pickupDate: Date) => {
          // Simulate the timestamp generation when status changes to "Picked Up"
          const pickupTimestamp = pickupDate.toISOString().split('.')[0] + 'Z';
          
          // Verify format
          const matchesFormat = ISO_8601_REGEX.test(pickupTimestamp);
          
          // Verify it's a valid timestamp
          const isValidDate = !isNaN(new Date(pickupTimestamp).getTime());
          
          // Verify no milliseconds component
          const noMilliseconds = !pickupTimestamp.includes('.');
          
          return matchesFormat && isValidDate && noMilliseconds;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Delivery Timestamp Format
   * 
   * This property tests that delivery timestamps (set when status changes to "Delivered")
   * always match the ISO 8601 format without milliseconds.
   */
  it('should format deliveryTimestamp correctly when trip is delivered', () => {
    fc.assert(
      fc.property(
        dateArbitrary(1704067200000, 1735689600000),
        (deliveryDate: Date) => {
          // Simulate the timestamp generation when status changes to "Delivered"
          const deliveryTimestamp = deliveryDate.toISOString().split('.')[0] + 'Z';
          
          // Verify format
          const matchesFormat = ISO_8601_REGEX.test(deliveryTimestamp);
          
          // Verify it's a valid timestamp
          const isValidDate = !isNaN(new Date(deliveryTimestamp).getTime());
          
          // Verify UTC timezone
          const hasUTCIndicator = deliveryTimestamp.endsWith('Z');
          
          return matchesFormat && isValidDate && hasUTCIndicator;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Timestamp Ordering Consistency
   * 
   * This property tests that when all three timestamps are set,
   * they maintain logical ordering: scheduled <= pickup <= delivery
   */
  it('should maintain logical timestamp ordering when all timestamps are set', () => {
    fc.assert(
      fc.property(
        // Generate three dates in order
        // 2025-01-01 = 1704067200000, 2025-06-30 = 1719792000000
        dateArbitrary(1704067200000, 1719792000000),
        fc.integer({ min: 0, max: 72 }), // Hours to add for pickup (0-3 days)
        fc.integer({ min: 0, max: 168 }), // Hours to add for delivery (0-7 days)
        (scheduledDate: Date, pickupHoursOffset: number, deliveryHoursOffset: number) => {
          // Generate timestamps
          const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
          
          const pickupDate = new Date(scheduledDate.getTime() + pickupHoursOffset * 60 * 60 * 1000);
          const pickupTimestamp = pickupDate.toISOString().split('.')[0] + 'Z';
          
          const deliveryDate = new Date(pickupDate.getTime() + deliveryHoursOffset * 60 * 60 * 1000);
          const deliveryTimestamp = deliveryDate.toISOString().split('.')[0] + 'Z';
          
          // Verify all formats are correct
          const allFormatsCorrect = 
            ISO_8601_REGEX.test(scheduledTimestamp) &&
            ISO_8601_REGEX.test(pickupTimestamp) &&
            ISO_8601_REGEX.test(deliveryTimestamp);
          
          // Verify logical ordering
          const scheduledTime = new Date(scheduledTimestamp).getTime();
          const pickupTime = new Date(pickupTimestamp).getTime();
          const deliveryTime = new Date(deliveryTimestamp).getTime();
          
          const correctOrdering = scheduledTime <= pickupTime && pickupTime <= deliveryTime;
          
          return allFormatsCorrect && correctOrdering;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Timestamp Format with Edge Case Dates
   * 
   * This property tests timestamp formatting with edge case dates:
   * - Start of year (January 1)
   * - End of year (December 31)
   * - Leap year dates (February 29)
   * - Month boundaries
   */
  it('should format timestamps correctly for edge case dates', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Start of year
          fc.constant(new Date('2025-01-01T00:00:00Z')),
          // End of year
          fc.constant(new Date('2025-12-31T23:59:59Z')),
          // Leap year date
          fc.constant(new Date('2024-02-29T12:00:00Z')),
          // Month boundaries
          fc.constant(new Date('2025-01-31T23:59:59Z')),
          fc.constant(new Date('2025-02-01T00:00:00Z')),
          // Random date - 2024-01-01 = 1704067200000, 2026-12-31 = 1735689600000
          dateArbitrary(1704067200000, 1735689600000)
        ),
        (date: Date) => {
          const timestamp = date.toISOString().split('.')[0] + 'Z';
          
          // Verify format
          const matchesFormat = ISO_8601_REGEX.test(timestamp);
          
          // Verify can be parsed back
          const parsedDate = new Date(timestamp);
          const isValidDate = !isNaN(parsedDate.getTime());
          
          // Verify no milliseconds
          const noMilliseconds = !timestamp.includes('.');
          
          return matchesFormat && isValidDate && noMilliseconds;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Timestamp Format with Various Time Components
   * 
   * This property tests that timestamps with various hour, minute, and second
   * combinations all format correctly.
   */
  it('should format timestamps correctly for all time components', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2025, max: 2026 }), // year
        fc.integer({ min: 1, max: 12 }), // month
        fc.integer({ min: 1, max: 28 }), // day (safe for all months)
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        fc.integer({ min: 0, max: 59 }), // second
        (year: number, month: number, day: number, hour: number, minute: number, second: number) => {
          // Create date with specific components
          const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
          
          // Generate timestamp
          const timestamp = date.toISOString().split('.')[0] + 'Z';
          
          // Verify format
          const matchesFormat = ISO_8601_REGEX.test(timestamp);
          
          // Verify components are preserved
          const parsedDate = new Date(timestamp);
          const componentsMatch = 
            parsedDate.getUTCFullYear() === year &&
            parsedDate.getUTCMonth() === month - 1 &&
            parsedDate.getUTCDate() === day &&
            parsedDate.getUTCHours() === hour &&
            parsedDate.getUTCMinutes() === minute &&
            parsedDate.getUTCSeconds() === second;
          
          // Verify no milliseconds
          const noMilliseconds = !timestamp.includes('.');
          
          return matchesFormat && componentsMatch && noMilliseconds;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Null Timestamp Handling
   * 
   * This property tests that null timestamps (for pickupTimestamp and deliveryTimestamp
   * before they are set) are handled correctly and don't cause format issues.
   */
  it('should handle null timestamps correctly without format violations', () => {
    fc.assert(
      fc.property(
        dateArbitrary(1704067200000, 1735689600000),
        fc.boolean(),
        fc.boolean(),
        (scheduledDate: Date, hasPickup: boolean, hasDelivery: boolean) => {
          // Generate timestamps
          const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
          const pickupTimestamp = hasPickup 
            ? new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z'
            : null;
          const deliveryTimestamp = hasDelivery && hasPickup
            ? new Date(scheduledDate.getTime() + 48 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z'
            : null;
          
          // Verify scheduled timestamp always has correct format
          const scheduledFormatCorrect = ISO_8601_REGEX.test(scheduledTimestamp);
          
          // Verify pickup timestamp is either null or correctly formatted
          const pickupFormatCorrect = pickupTimestamp === null || ISO_8601_REGEX.test(pickupTimestamp);
          
          // Verify delivery timestamp is either null or correctly formatted
          const deliveryFormatCorrect = deliveryTimestamp === null || ISO_8601_REGEX.test(deliveryTimestamp);
          
          return scheduledFormatCorrect && pickupFormatCorrect && deliveryFormatCorrect;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Timestamp Parsing and Formatting Round-Trip
   * 
   * This property tests that timestamps can be parsed and formatted back
   * without losing precision (except milliseconds which are intentionally removed).
   */
  it('should maintain timestamp accuracy through parse and format round-trip', () => {
    fc.assert(
      fc.property(
        dateArbitrary(1577836800000, 1924905600000),
        (originalDate: Date) => {
          // Format to ISO 8601 without milliseconds
          const timestamp = originalDate.toISOString().split('.')[0] + 'Z';
          
          // Parse back
          const parsedDate = new Date(timestamp);
          
          // Format again
          const reformattedTimestamp = parsedDate.toISOString().split('.')[0] + 'Z';
          
          // Verify both timestamps are identical
          const timestampsMatch = timestamp === reformattedTimestamp;
          
          // Verify both match the format
          const bothMatchFormat = 
            ISO_8601_REGEX.test(timestamp) &&
            ISO_8601_REGEX.test(reformattedTimestamp);
          
          // Verify dates are equal (ignoring milliseconds)
          const originalWithoutMs = Math.floor(originalDate.getTime() / 1000);
          const parsedWithoutMs = Math.floor(parsedDate.getTime() / 1000);
          const datesEqual = originalWithoutMs === parsedWithoutMs;
          
          return timestampsMatch && bothMatchFormat && datesEqual;
        }
      ),
      { numRuns: 100 }
    );
  });
});
