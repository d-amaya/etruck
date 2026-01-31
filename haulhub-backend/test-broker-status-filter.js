// Quick test script to debug the broker + status filter issue
// Run with: node test-broker-status-filter.js

const filters1 = {
  startDate: '2024-01-01',
  endDate: '2025-01-18',
  status: 'PickedUp',
  brokerId: null,
  lorryId: null,
  driverId: null,
  driverName: null
};

const filters2 = {
  startDate: '2024-01-01',
  endDate: '2025-01-18',
  status: 'PickedUp',
  brokerId: 'broker-ch-robinson',
  lorryId: null,
  driverId: null,
  driverName: null
};

console.log('Filter 1 (Status only):');
console.log('  - Uses GSI1 (default index)');
console.log('  - KeyCondition: DISPATCHER#xxx AND date BETWEEN ...');
console.log('  - FilterExpression: status = PickedUp');
console.log('  - Expected: 3 trips\n');

console.log('Filter 2 (Status + Broker):');
console.log('  - Uses GSI4 (broker index)');
console.log('  - KeyCondition: DISPATCHER#xxx AND GSI4SK BETWEEN BROKER#broker-ch-robinson#...');
console.log('  - FilterExpression: status = PickedUp');
console.log('  - Expected: 1 trip (C.H. Robinson with PickedUp status)');
console.log('  - Actual: 0 trips (BUG!)\n');

console.log('The issue might be:');
console.log('1. Status value mismatch (PickedUp vs Picked Up)');
console.log('2. Pagination token from GSI1 being used with GSI4');
console.log('3. FilterExpression not being applied correctly in GSI4');
console.log('4. Data in DynamoDB has different status value than expected');
