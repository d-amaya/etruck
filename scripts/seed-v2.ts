#!/usr/bin/env ts-node
/**
 * eTrucky v2 Seed Script — Main Entry Point
 *
 * Usage:
 *   USER_POOL_ID=<pool-id> AWS_PROFILE=etrucky npx ts-node scripts/seed-v2.ts
 */

import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  T, ddb, iso, rand, randFloat, pick,
  clearTable, clearCognitoV2Users, putUser,
  seedBrokers, seedAdmins, seedDispatchers, seedCarriers, seedDrivers, seedTrucks, seedTrailers,
  UserRecord,
} from './seed-v2-helpers';

// ── Subscription Wiring ─────────────────────────────────────────────
async function wireSubscriptions(
  admins: UserRecord[],
  dispatchers: UserRecord[],
  carriers: UserRecord[],
) {
  console.log('\n🔗 Wiring subscriptions...');

  // Admin "Maria" (0) subscribes Dispatchers "Carlos" (0) and "Sarah" (1)
  // Admin "James" (1) subscribes Dispatchers "Sarah" (1) and "Mike" (2)
  const adminToDispatchers: [number, number[]][] = [
    [0, [0, 1]],
    [1, [1, 2]],
  ];

  for (const [ai, dis] of adminToDispatchers) {
    const dispIds = dis.map(di => dispatchers[di].userId);
    await ddb.send(new UpdateCommand({
      TableName: T.users,
      Key: { PK: `USER#${admins[ai].userId}`, SK: 'METADATA' },
      UpdateExpression: 'SET subscribedDispatcherIds = :ids',
      ExpressionAttributeValues: { ':ids': dispIds },
    }));
    // Bidirectional: update each Dispatcher's subscribedAdminIds
    for (const di of dis) {
      await ddb.send(new UpdateCommand({
        TableName: T.users,
        Key: { PK: `USER#${dispatchers[di].userId}`, SK: 'METADATA' },
        UpdateExpression: 'SET subscribedAdminIds = list_append(if_not_exists(subscribedAdminIds, :empty), :id)',
        ExpressionAttributeValues: { ':id': [admins[ai].userId], ':empty': [] },
      }));
    }
    console.log(`  ✅ Admin ${admins[ai].name} → Dispatchers: ${dis.map(d => dispatchers[d].name).join(', ')}`);
  }

  // Dispatcher "Carlos" (0) subscribes Carriers "Swift" (0) and "Eagle" (1)
  // Dispatcher "Sarah" (1) subscribes Carriers "Eagle" (1) and "Pacific" (2)
  // Dispatcher "Mike" (2) subscribes Carrier "Pacific" (2)
  const dispToCarriers: [number, number[]][] = [
    [0, [0, 1]],
    [1, [1, 2]],
    [2, [2]],
  ];

  for (const [di, cis] of dispToCarriers) {
    const carrierIds = cis.map(ci => carriers[ci].userId);
    await ddb.send(new UpdateCommand({
      TableName: T.users,
      Key: { PK: `USER#${dispatchers[di].userId}`, SK: 'METADATA' },
      UpdateExpression: 'SET subscribedCarrierIds = :ids',
      ExpressionAttributeValues: { ':ids': carrierIds },
    }));
    console.log(`  ✅ Dispatcher ${dispatchers[di].name} → Carriers: ${cis.map(c => carriers[c].name).join(', ')}`);
  }
}

// ── Order Seeding ───────────────────────────────────────────────────
async function seedOrders(
  admins: UserRecord[],
  dispatchers: UserRecord[],
  carriers: UserRecord[],
  drivers: (UserRecord & { carrierId: string; rate: number })[],
  trucks: { truckId: string; carrierId: string }[],
  trailers: { trailerId: string; carrierId: string }[],
  brokers: { id: string; name: string }[],
): Promise<number> {
  console.log('\n📋 Seeding Orders...');

  const statuses = ['Scheduled', 'Picking Up', 'Transit', 'Delivered', 'Waiting RC', 'Ready To Pay', 'Canceled'];
  const cities = [
    { city: 'Los Angeles', state: 'CA', zip: '90001' },
    { city: 'Phoenix', state: 'AZ', zip: '85001' },
    { city: 'Houston', state: 'TX', zip: '77001' },
    { city: 'Chicago', state: 'IL', zip: '60601' },
    { city: 'Miami', state: 'FL', zip: '33101' },
    { city: 'Dallas', state: 'TX', zip: '75201' },
    { city: 'Atlanta', state: 'GA', zip: '30301' },
    { city: 'Denver', state: 'CO', zip: '80201' },
  ];

  // Map dispatcher→admin and dispatcher→carrier assignments
  // Carlos(0) works for Maria(0), uses Swift(0)/Eagle(1)
  // Sarah(1) works for Maria(0)/James(1), uses Eagle(1)/Pacific(2)
  // Mike(2) works for James(1), uses Pacific(2)
  const dispatcherConfig: { adminIdx: number; carrierIdxs: number[] }[] = [
    { adminIdx: 0, carrierIdxs: [0, 1] },
    { adminIdx: 0, carrierIdxs: [1, 2] }, // Sarah alternates admins
    { adminIdx: 1, carrierIdxs: [2] },
  ];

  let orderCount = 0;
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2026-02-15');

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    // ~1-2 orders per day
    const ordersToday = rand(0, 2);
    for (let o = 0; o < ordersToday; o++) {
      const dispIdx = orderCount % dispatchers.length;
      const cfg = dispatcherConfig[dispIdx];
      // Sarah alternates admins every other order
      const adminIdx = dispIdx === 1 && orderCount % 4 >= 2 ? 1 : cfg.adminIdx;
      const carrierIdx = cfg.carrierIdxs[orderCount % cfg.carrierIdxs.length];

      const admin = admins[adminIdx];
      const dispatcher = dispatchers[dispIdx];
      const carrier = carriers[carrierIdx];

      // Pick driver/truck/trailer belonging to this carrier
      const carrierDrivers = drivers.filter(d => d.carrierId === carrier.userId);
      const carrierTrucks = trucks.filter(t => t.carrierId === carrier.userId);
      const carrierTrailers = trailers.filter(t => t.carrierId === carrier.userId);

      if (!carrierDrivers.length || !carrierTrucks.length || !carrierTrailers.length) continue;

      const driver = carrierDrivers[orderCount % carrierDrivers.length];
      const truck = carrierTrucks[orderCount % carrierTrucks.length];
      const trailer = carrierTrailers[orderCount % carrierTrailers.length];
      const broker = brokers[orderCount % brokers.length];

      const status = statuses[orderCount % statuses.length];
      const pickupCity = cities[orderCount % cities.length];
      const deliveryCity = cities[(orderCount + 3) % cities.length];

      const scheduledDate = new Date(d);
      scheduledDate.setHours(6 + rand(0, 8), rand(0, 59));
      const scheduledTimestamp = iso(scheduledDate);

      const mileageOrder = rand(200, 1200);
      const mileageEmpty = rand(10, 120);
      const mileageTotal = mileageOrder + mileageEmpty;

      // Financial model: admin+dispatcher = 10%, carrier = 90%
      const orderRate = rand(2000, 8000);
      const adminRate = 5;
      const dispatcherRate = 5;
      const adminPayment = +(orderRate * adminRate / 100).toFixed(2);
      const dispatcherPayment = +(orderRate * dispatcherRate / 100).toFixed(2);
      const lumperValue = Math.random() > 0.6 ? rand(25, 100) : 0;
      const detentionValue = Math.random() > 0.8 ? rand(25, 75) : 0;
      const carrierPayment = +(orderRate * 0.9).toFixed(2);
      const driverPayment = +(driver.rate * mileageOrder).toFixed(2);
      const fuelGasAvgCost = randFloat(3.2, 4.5);
      const fuelGasAvgGallxMil = randFloat(0.12, 0.18);
      const fuelCost = +(mileageTotal * fuelGasAvgGallxMil * fuelGasAvgCost).toFixed(2);

      // Timestamps based on status
      let pickupTimestamp: string | null = null;
      let deliveryTimestamp: string | null = null;
      if (['Picking Up', 'Transit', 'Delivered', 'Waiting RC', 'Ready To Pay'].includes(status)) {
        const pt = new Date(scheduledDate); pt.setHours(pt.getHours() + rand(1, 3));
        pickupTimestamp = iso(pt);
      }
      if (['Delivered', 'Waiting RC', 'Ready To Pay'].includes(status)) {
        const dt = new Date(scheduledDate); dt.setHours(dt.getHours() + rand(6, 18));
        deliveryTimestamp = iso(dt);
      }

      const orderId = uuidv4();
      await ddb.send(new PutCommand({
        TableName: T.orders,
        Item: {
          PK: `ORDER#${orderId}`, SK: 'METADATA',
          GSI1PK: `CARRIER#${carrier.userId}`, GSI1SK: `${scheduledTimestamp}#${orderId}`,
          GSI2PK: `DISPATCHER#${dispatcher.userId}`, GSI2SK: `${scheduledTimestamp}#${orderId}`,
          GSI3PK: `DRIVER#${driver.userId}`, GSI3SK: `${scheduledTimestamp}#${orderId}`,
          GSI4PK: `ADMIN#${admin.userId}`, GSI4SK: `${scheduledTimestamp}#${orderId}`,
          GSI5PK: `BROKER#${broker.id}`, GSI5SK: `${scheduledTimestamp}#${orderId}`,
          orderId, adminId: admin.userId, dispatcherId: dispatcher.userId,
          carrierId: carrier.userId, driverId: driver.userId,
          truckId: truck.truckId, trailerId: trailer.trailerId, brokerId: broker.id,
          invoiceNumber: `INV-${String(orderCount + 1).padStart(4, '0')}`,
          brokerLoad: `BL-${rand(10000, 99999)}`,
          orderStatus: status, scheduledTimestamp, pickupTimestamp, deliveryTimestamp,
          pickupCompany: `${pickupCity.city} Warehouse`, pickupAddress: `${rand(100, 999)} Pickup St`,
          pickupCity: pickupCity.city, pickupState: pickupCity.state, pickupZip: pickupCity.zip,
          pickupPhone: '(555) 100-0001', pickupNotes: '',
          deliveryCompany: `${deliveryCity.city} Distribution`, deliveryAddress: `${rand(100, 999)} Delivery Ave`,
          deliveryCity: deliveryCity.city, deliveryState: deliveryCity.state, deliveryZip: deliveryCity.zip,
          deliveryPhone: '(555) 200-0001', deliveryNotes: '',
          mileageEmpty, mileageOrder, mileageTotal,
          orderRate, adminRate, adminPayment, dispatcherRate, dispatcherPayment,
          carrierRate: 90, carrierPayment, lumperValue, detentionValue,
          driverRate: driver.rate, driverPayment,
          fuelGasAvgCost, fuelGasAvgGallxMil, fuelCost,
          notes: '', createdAt: scheduledTimestamp, updatedAt: scheduledTimestamp,
          lastModifiedBy: dispatcher.userId,
        },
      }));
      orderCount++;
    }
  }

  console.log(`  ✅ ${orderCount} orders`);
  return orderCount;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 eTrucky v2 Seed Script — Admin-Centric Hierarchy\n');

  // Step 1: Clear v2 tables + Cognito
  console.log('🧹 Clearing v2 data...');
  const cognitoDeleted = await clearCognitoV2Users();
  console.log(`  Cognito: ${cognitoDeleted} users deleted`);
  for (const [name, table] of Object.entries(T)) {
    const count = await clearTable(table);
    console.log(`  ${name}: ${count} items deleted`);
  }

  // Step 2: Seed entities
  const brokers = await seedBrokers();
  const admins = await seedAdmins();
  const dispatchers = await seedDispatchers();
  const carriers = await seedCarriers();
  const drivers = await seedDrivers(carriers);
  const trucks = await seedTrucks(carriers);
  const trailers = await seedTrailers(carriers);

  // Step 3: Wire subscriptions
  await wireSubscriptions(admins, dispatchers, carriers);

  // Step 4: Seed orders
  const orderCount = await seedOrders(admins, dispatchers, carriers, drivers, trucks, trailers, brokers);

  // Summary
  console.log('\n✅ Seeding complete!\n');
  console.log('📊 Summary:');
  console.log(`  Admins:       ${admins.length}`);
  console.log(`  Dispatchers:  ${dispatchers.length}`);
  console.log(`  Carriers:     ${carriers.length}`);
  console.log(`  Drivers:      ${drivers.length}`);
  console.log(`  Trucks:       ${trucks.length}`);
  console.log(`  Trailers:     ${trailers.length}`);
  console.log(`  Brokers:      ${brokers.length}`);
  console.log(`  Orders:       ${orderCount}`);
  console.log('\n🔗 Subscriptions:');
  console.log('  Admin Maria → Dispatchers: Carlos, Sarah');
  console.log('  Admin James → Dispatchers: Sarah, Mike');
  console.log('  Dispatcher Carlos → Carriers: Swift, Eagle');
  console.log('  Dispatcher Sarah → Carriers: Eagle, Pacific');
  console.log('  Dispatcher Mike → Carriers: Pacific');
  console.log('\n🔑 Test Credentials:');
  console.log(`  Password: TempPass123!`);
  console.log('  Admins:      admin1@etrucky-v2.test, admin2@etrucky-v2.test');
  console.log('  Dispatchers: dispatcher1@etrucky-v2.test, dispatcher2@etrucky-v2.test, dispatcher3@etrucky-v2.test');
  console.log('  Carriers:    carrier1@etrucky-v2.test, carrier2@etrucky-v2.test, carrier3@etrucky-v2.test');
  console.log('  Drivers:     driver1@etrucky-v2.test ... driver8@etrucky-v2.test');
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
