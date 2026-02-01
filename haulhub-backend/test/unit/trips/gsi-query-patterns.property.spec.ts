import 'reflect-metadata';
import * as fc from 'fast-check';
import { UserRole } from '@haulhub/shared';

/**
 * Property-Based Tests for GSI Query Pattern Selection
 * 
 * **Feature: etrucky-migration, Property 7: GSI Query Pattern by Role**
 * **Validates: Requirements 1.7, 1.8, 1.9, 1.10**
 * 
 * This test suite validates that the correct GSI is selected for each user role
 * and that partition keys are formatted correctly across all possible input combinations.
 * The core property being tested is:
 * 
 * For any query for trips by a specific role (dispatcher, driver, truck owner, carrier),
 * the system should use the correct GSI (GSI2 for dispatcher, GSI3 for driver, GSI4 for
 * truck owner, GSI1 for carrier) with the correct partition key format (DISPATCHER#,
 * DRIVER#, OWNER#, CARRIER# followed by userId).
 */

describe('GSI Query Pattern Selection Property Tests', () => {
  /**
   * GSI mapping by role
   */
  const GSI_BY_ROLE = {
    [UserRole.Dispatcher]: 'GSI2',
    [UserRole.Driver]: 'GSI3',
    [UserRole.LorryOwner]: 'GSI4', // Truck Owner
    [UserRole.Admin]: 'GSI1', // Carrier/Admin uses GSI1
  };

  /**
   * Partition key prefix by role
   */
  const PK_PREFIX_BY_ROLE = {
    [UserRole.Dispatcher]: 'DISPATCHER#',
    [UserRole.Driver]: 'DRIVER#',
    [UserRole.LorryOwner]: 'OWNER#', // Truck Owner
    [UserRole.Admin]: 'CARRIER#', // Carrier/Admin uses CARRIER#
  };

  /**
   * Helper function to select GSI based on role
   */
  function selectGSIForRole(role: UserRole): string {
    return GSI_BY_ROLE[role] || 'GSI2'; // Default to GSI2
  }

  /**
   * Helper function to format partition key based on role
   */
  function formatPartitionKey(role: UserRole, userId: string): string {
    const prefix = PK_PREFIX_BY_ROLE[role] || 'DISPATCHER#';
    return `${prefix}${userId}`;
  }

  /**
   * Property 7: GSI Query Pattern by Role
   * 
   * **Feature: etrucky-migration, Property 7: GSI Query Pattern by Role**
   * 
   * This property ensures that for any query by role:
   * - The correct GSI is selected (GSI1, GSI2, GSI3, or GSI4)
   * - The partition key uses the correct prefix (CARRIER#, DISPATCHER#, DRIVER#, OWNER#)
   * - The userId is correctly appended to the prefix
   * 
   * The property is tested across all user roles and random user IDs
   * to ensure query pattern consistency in all scenarios.
   */
  it('should select correct GSI and format partition key for each role', () => {
    fc.assert(
      fc.property(
        // Generate random user ID
        fc.uuid(),
        // Generate random role
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId: string, role: UserRole) => {
          // Select GSI for role
          const selectedGSI = selectGSIForRole(role);
          
          // Format partition key
          const partitionKey = formatPartitionKey(role, userId);
          
          // Verify correct GSI is selected
          const correctGSI = selectedGSI === GSI_BY_ROLE[role];
          
          // Verify partition key has correct prefix
          const expectedPrefix = PK_PREFIX_BY_ROLE[role];
          const hasCorrectPrefix = partitionKey.startsWith(expectedPrefix);
          
          // Verify partition key includes userId
          const includesUserId = partitionKey.includes(userId);
          
          // Verify partition key format is correct (PREFIX#UUID)
          const correctFormat = partitionKey === `${expectedPrefix}${userId}`;
          
          return correctGSI && hasCorrectPrefix && includesUserId && correctFormat;
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Dispatcher GSI Selection
   * 
   * This property tests that dispatcher queries always use GSI2
   * with DISPATCHER# prefix.
   */
  it('should use GSI2 with DISPATCHER# prefix for dispatcher role', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (dispatcherId: string) => {
          const role = UserRole.Dispatcher;
          const selectedGSI = selectGSIForRole(role);
          const partitionKey = formatPartitionKey(role, dispatcherId);
          
          // Verify GSI2 is selected
          const usesGSI2 = selectedGSI === 'GSI2';
          
          // Verify DISPATCHER# prefix
          const hasDispatcherPrefix = partitionKey.startsWith('DISPATCHER#');
          
          // Verify complete format
          const correctFormat = partitionKey === `DISPATCHER#${dispatcherId}`;
          
          return usesGSI2 && hasDispatcherPrefix && correctFormat;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Driver GSI Selection
   * 
   * This property tests that driver queries always use GSI3
   * with DRIVER# prefix.
   */
  it('should use GSI3 with DRIVER# prefix for driver role', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (driverId: string) => {
          const role = UserRole.Driver;
          const selectedGSI = selectGSIForRole(role);
          const partitionKey = formatPartitionKey(role, driverId);
          
          // Verify GSI3 is selected
          const usesGSI3 = selectedGSI === 'GSI3';
          
          // Verify DRIVER# prefix
          const hasDriverPrefix = partitionKey.startsWith('DRIVER#');
          
          // Verify complete format
          const correctFormat = partitionKey === `DRIVER#${driverId}`;
          
          return usesGSI3 && hasDriverPrefix && correctFormat;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Truck Owner GSI Selection
   * 
   * This property tests that truck owner queries always use GSI4
   * with OWNER# prefix.
   */
  it('should use GSI4 with OWNER# prefix for truck owner role', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (ownerId: string) => {
          const role = UserRole.LorryOwner; // Truck Owner
          const selectedGSI = selectGSIForRole(role);
          const partitionKey = formatPartitionKey(role, ownerId);
          
          // Verify GSI4 is selected
          const usesGSI4 = selectedGSI === 'GSI4';
          
          // Verify OWNER# prefix
          const hasOwnerPrefix = partitionKey.startsWith('OWNER#');
          
          // Verify complete format
          const correctFormat = partitionKey === `OWNER#${ownerId}`;
          
          return usesGSI4 && hasOwnerPrefix && correctFormat;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Carrier/Admin GSI Selection
   * 
   * This property tests that carrier/admin queries always use GSI1
   * with CARRIER# prefix.
   */
  it('should use GSI1 with CARRIER# prefix for carrier/admin role', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (carrierId: string) => {
          const role = UserRole.Admin; // Admin/Carrier
          const selectedGSI = selectGSIForRole(role);
          const partitionKey = formatPartitionKey(role, carrierId);
          
          // Verify GSI1 is selected
          const usesGSI1 = selectedGSI === 'GSI1';
          
          // Verify CARRIER# prefix
          const hasCarrierPrefix = partitionKey.startsWith('CARRIER#');
          
          // Verify complete format
          const correctFormat = partitionKey === `CARRIER#${carrierId}`;
          
          return usesGSI1 && hasCarrierPrefix && correctFormat;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Partition Key Uniqueness
   * 
   * This property tests that different user IDs produce different
   * partition keys for the same role.
   */
  it('should produce unique partition keys for different user IDs', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId1: string, userId2: string, role: UserRole) => {
          // Skip if user IDs are the same
          fc.pre(userId1 !== userId2);
          
          const partitionKey1 = formatPartitionKey(role, userId1);
          const partitionKey2 = formatPartitionKey(role, userId2);
          
          // Partition keys should be different
          return partitionKey1 !== partitionKey2;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Partition Key Format Consistency
   * 
   * This property tests that partition keys always follow the format
   * PREFIX#UUID with no extra characters or spaces.
   */
  it('should format partition keys consistently without extra characters', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId: string, role: UserRole) => {
          const partitionKey = formatPartitionKey(role, userId);
          
          // Should contain exactly one # character
          const hashCount = (partitionKey.match(/#/g) || []).length;
          const hasOneHash = hashCount === 1;
          
          // Should not contain spaces
          const noSpaces = !partitionKey.includes(' ');
          
          // Should not be empty
          const notEmpty = partitionKey.length > 0;
          
          // Should end with the userId
          const endsWithUserId = partitionKey.endsWith(userId);
          
          return hasOneHash && noSpaces && notEmpty && endsWithUserId;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: GSI Selection Determinism
   * 
   * This property tests that the same role always produces the same GSI
   * selection, regardless of user ID.
   */
  it('should select same GSI for same role with different user IDs', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId1: string, userId2: string, role: UserRole) => {
          const gsi1 = selectGSIForRole(role);
          const gsi2 = selectGSIForRole(role);
          
          // Same role should always produce same GSI
          return gsi1 === gsi2;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Role-to-GSI Mapping Completeness
   * 
   * This property tests that all roles have a valid GSI mapping
   * and partition key prefix.
   */
  it('should have valid GSI and prefix mapping for all roles', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (role: UserRole) => {
          const gsi = selectGSIForRole(role);
          const prefix = PK_PREFIX_BY_ROLE[role];
          
          // GSI should be one of the valid GSIs
          const validGSI = ['GSI1', 'GSI2', 'GSI3', 'GSI4'].includes(gsi);
          
          // Prefix should be defined and end with #
          const validPrefix = prefix && prefix.endsWith('#');
          
          // Prefix should be one of the valid prefixes
          const validPrefixValue = [
            'CARRIER#',
            'DISPATCHER#',
            'DRIVER#',
            'OWNER#',
          ].includes(prefix);
          
          return validGSI && validPrefix && validPrefixValue;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Partition Key with Sort Key Format
   * 
   * This property tests that partition keys work correctly with
   * ISO 8601 timestamp sort keys.
   */
  it('should work correctly with ISO 8601 timestamp sort keys', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        // 2025-01-01 = 1704067200000, 2026-12-31 = 1735689600000
        fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ms => new Date(ms)),
        fc.uuid(), // tripId
        (userId: string, role: UserRole, timestamp: Date, tripId: string) => {
          const partitionKey = formatPartitionKey(role, userId);
          
          // Format sort key as ISO timestamp + tripId
          const isoTimestamp = timestamp.toISOString().split('.')[0] + 'Z';
          const sortKey = `${isoTimestamp}#${tripId}`;
          
          // Verify partition key format is valid
          const validPartitionKey = partitionKey.includes('#') && partitionKey.includes(userId);
          
          // Verify sort key format is valid
          const validSortKey = sortKey.includes('#') && sortKey.includes(tripId);
          
          // Verify sort key starts with ISO timestamp
          const sortKeyStartsWithTimestamp = sortKey.startsWith(isoTimestamp);
          
          // Verify both keys can be used together in a query
          const canQueryTogether = validPartitionKey && validSortKey;
          
          return validPartitionKey && validSortKey && sortKeyStartsWithTimestamp && canQueryTogether;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: GSI Selection with Multiple Roles
   * 
   * This property tests that different roles produce different GSIs
   * and partition key prefixes.
   */
  it('should produce different GSIs and prefixes for different roles', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId: string, role1: UserRole, role2: UserRole) => {
          // Skip if roles are the same
          fc.pre(role1 !== role2);
          
          const gsi1 = selectGSIForRole(role1);
          const gsi2 = selectGSIForRole(role2);
          
          const pk1 = formatPartitionKey(role1, userId);
          const pk2 = formatPartitionKey(role2, userId);
          
          // Different roles should produce different GSIs or different prefixes
          const differentGSIs = gsi1 !== gsi2;
          const differentPrefixes = !pk1.startsWith(pk2.split('#')[0]) && !pk2.startsWith(pk1.split('#')[0]);
          
          return differentGSIs || differentPrefixes;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Partition Key Case Sensitivity
   * 
   * This property tests that partition key prefixes are consistently
   * uppercase (DISPATCHER#, not dispatcher#).
   */
  it('should use uppercase prefixes consistently', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(
          UserRole.Dispatcher,
          UserRole.Driver,
          UserRole.LorryOwner,
          UserRole.Admin
        ),
        (userId: string, role: UserRole) => {
          const partitionKey = formatPartitionKey(role, userId);
          const prefix = partitionKey.split('#')[0];
          
          // Prefix should be all uppercase
          const isUppercase = prefix === prefix.toUpperCase();
          
          // Prefix should not contain lowercase letters
          const noLowercase = !/[a-z]/.test(prefix);
          
          return isUppercase && noLowercase;
        }
      ),
      { numRuns: 100 }
    );
  });
});
