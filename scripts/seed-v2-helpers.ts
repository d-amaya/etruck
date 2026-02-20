#!/usr/bin/env ts-node
/**
 * eTrucky v2 Seed Script — Admin-Centric Hierarchy
 *
 * Targets the NEW v2 tables (eTruckyOrders, eTruckyUsers, etc.)
 * Creates: 2 Admins, 3 Dispatchers, 3 Carriers, 8 Drivers,
 *          12 Trucks, 12 Trailers, 20 Brokers, 200+ Orders
 *
 * Usage:
 *   USER_POOL_ID=<pool-id> AWS_PROFILE=etrucky npx ts-node scripts/seed-v2.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';

// ── Config ──────────────────────────────────────────────────────────
const REGION = process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
if (!USER_POOL_ID) {
  console.error('❌ USER_POOL_ID required.\nUsage: USER_POOL_ID=<id> AWS_PROFILE=etrucky npx ts-node scripts/seed-v2.ts');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const cognito = new CognitoIdentityProviderClient({ region: REGION });

const T = {
  orders: 'eTruckyOrders',
  users: 'eTruckyUsers',
  trucks: 'eTruckyTrucks',
  trailers: 'eTruckyTrailers',
  brokers: 'eTruckyBrokers',
};

const PASSWORD = 'TempPass123!';
const EMAIL_DOMAIN = 'etrucky.com';

// ── Helpers ─────────────────────────────────────────────────────────
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min: number, max: number, dec = 2) => +(Math.random() * (max - min) + min).toFixed(dec);
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];
const genVIN = () => Array.from({ length: 17 }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[rand(0, 32)]).join('');
const genPlate = () => Array.from({ length: 3 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rand(0, 25)]).join('') +
  Array.from({ length: 4 }, () => '0123456789'[rand(0, 9)]).join('');
const genEIN = () => `${['10','12','20','35','45'][rand(0,4)]}-${rand(1000000,9999999)}`;
const genSSN = () => `${rand(100,999)}-${rand(10,99)}-${rand(1000,9999)}`;
const iso = (d: Date) => d.toISOString().split('.')[0] + 'Z';

async function clearTable(table: string): Promise<number> {
  let count = 0, lastKey: any;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, Limit: 25, ExclusiveStartKey: lastKey }));
    for (const item of res.Items || []) {
      await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK } }));
      count++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

async function clearCognitoV2Users(): Promise<number> {
  let count = 0;
  const domainsToDelete = [`@${EMAIL_DOMAIN}`, '@etrucky-v2.test'];
  const res = await cognito.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60 }));
  for (const u of res.Users || []) {
    const email = u.Attributes?.find(a => a.Name === 'email')?.Value;
    if (email && domainsToDelete.some(d => email.endsWith(d))) {
      try {
        await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: u.Username! }));
        count++;
      } catch { /* skip */ }
    }
  }
  return count;
}

async function createCognitoUser(email: string, name: string, role: string): Promise<string> {
  const res = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: name },
      { Name: 'custom:role', Value: role },
    ],
    MessageAction: 'SUPPRESS',
  }));
  const userId = res.User?.Username!;
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID, Username: userId, Password: PASSWORD, Permanent: true,
  }));
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID, Username: userId, GroupName: role,
  }));
  return userId;
}

async function putUser(item: Record<string, any>) {
  await ddb.send(new PutCommand({ TableName: T.users, Item: item }));
}

// ── Seed Functions ──────────────────────────────────────────────────

async function seedBrokers(): Promise<{ id: string; name: string }[]> {
  console.log('\n🏢 Seeding Brokers...');
  const names = [
    'C.H. Robinson', 'XPO Logistics', 'TQL', 'Coyote Logistics', 'Echo Global Logistics',
    'Landstar System', 'J.B. Hunt', 'Schneider National', 'Werner Enterprises', 'Knight-Swift',
    'Hub Group', 'Transplace', 'Arrive Logistics', 'GlobalTranz', 'Convoy',
    'Uber Freight', 'Loadsmart', 'Freightos', 'Flexport', 'Redwood Logistics',
  ];
  const brokers: { id: string; name: string }[] = [];
  for (const name of names) {
    const id = `broker-${String(brokers.length + 1).padStart(3, '0')}`;
    await ddb.send(new PutCommand({
      TableName: T.brokers,
      Item: {
        PK: `BROKER#${id}`, SK: 'METADATA',
        brokerId: id, brokerName: name, isActive: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    }));
    brokers.push({ id, name });
  }
  console.log(`  ✅ ${brokers.length} brokers`);
  return brokers;
}

interface UserRecord { userId: string; name: string; email: string; role: string; }

async function seedAdmins(): Promise<UserRecord[]> {
  console.log('\n👑 Seeding Admins...');
  const data = [
    { name: 'Maria Rodriguez', company: 'Rodriguez Logistics', city: 'Miami', state: 'FL' },
    { name: 'James Chen', company: 'Chen Transport Group', city: 'Los Angeles', state: 'CA' },
  ];
  const admins: UserRecord[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const email = `admin${i + 1}@${EMAIL_DOMAIN}`;
    const userId = await createCognitoUser(email, d.name, 'Admin');
    await putUser({
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: 'NONE', GSI1SK: `ROLE#ADMIN#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name: d.name, role: 'ADMIN',
      accountStatus: 'active', company: d.company,
      rate: 5, ein: genEIN(), ss: genSSN(),
      city: d.city, state: d.state, phone: `(555) 100-000${i + 1}`,
      isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      createdBy: 'seed', lastModifiedBy: 'seed',
    });
    admins.push({ userId, name: d.name, email, role: 'ADMIN' });
    console.log(`  ✅ ${d.name} (${userId})`);
  }
  return admins;
}

async function seedDispatchers(): Promise<UserRecord[]> {
  console.log('\n👔 Seeding Dispatchers...');
  const data = [
    { name: 'Carlos Mendez', city: 'Houston', state: 'TX', rate: 5 },
    { name: 'Sarah Johnson', city: 'Chicago', state: 'IL', rate: 5 },
    { name: 'Mike Williams', city: 'Phoenix', state: 'AZ', rate: 5 },
  ];
  const dispatchers: UserRecord[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const email = `dispatcher${i + 1}@${EMAIL_DOMAIN}`;
    const userId = await createCognitoUser(email, d.name, 'Dispatcher');
    await putUser({
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: 'NONE', GSI1SK: `ROLE#DISPATCHER#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name: d.name, role: 'DISPATCHER',
      accountStatus: 'active', rate: d.rate,
      ein: genEIN(), ss: genSSN(),
      city: d.city, state: d.state, phone: `(555) 200-000${i + 1}`,
      subscribedCarrierIds: [], // filled after carriers created
      subscribedAdminIds: [],   // filled after wiring
      isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      createdBy: 'seed', lastModifiedBy: 'seed',
    });
    dispatchers.push({ userId, name: d.name, email, role: 'DISPATCHER' });
    console.log(`  ✅ ${d.name} (${userId})`);
  }
  return dispatchers;
}

async function seedCarriers(): Promise<UserRecord[]> {
  console.log('\n📦 Seeding Carriers...');
  const data = [
    { name: 'Swift Transport LLC', city: 'Phoenix', state: 'AZ' },
    { name: 'Eagle Freight Inc', city: 'Dallas', state: 'TX' },
    { name: 'Pacific Haulers', city: 'Los Angeles', state: 'CA' },
  ];
  const carriers: UserRecord[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const email = `carrier${i + 1}@${EMAIL_DOMAIN}`;
    const userId = await createCognitoUser(email, d.name, 'Carrier');
    await putUser({
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: `CARRIER#${userId}`, GSI1SK: `ROLE#CARRIER#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name: d.name, role: 'CARRIER',
      accountStatus: 'active', company: d.name,
      carrierId: userId, // self-reference
      ein: genEIN(), ss: genSSN(),
      city: d.city, state: d.state, phone: `(555) 300-000${i + 1}`,
      isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      createdBy: 'seed', lastModifiedBy: 'seed',
    });
    carriers.push({ userId, name: d.name, email, role: 'CARRIER' });
    console.log(`  ✅ ${d.name} (${userId})`);
  }
  return carriers;
}

async function seedDrivers(carriers: UserRecord[]): Promise<(UserRecord & { carrierId: string; rate: number })[]> {
  console.log('\n🚗 Seeding Drivers...');
  const names = [
    'James Garcia', 'Robert Martinez', 'David Rodriguez', 'Carlos Hernandez',
    'Michael Lopez', 'Daniel Gonzalez', 'Jose Perez', 'Antonio Sanchez',
  ];
  // Distribute: 3, 3, 2 across carriers
  const carrierAssignment = [0, 0, 0, 1, 1, 1, 2, 2];
  const drivers: (UserRecord & { carrierId: string; rate: number })[] = [];

  for (let i = 0; i < names.length; i++) {
    const carrier = carriers[carrierAssignment[i]];
    const email = `driver${i + 1}@${EMAIL_DOMAIN}`;
    const rate = +(0.45 + i * 0.02).toFixed(2);
    const userId = await createCognitoUser(email, names[i], 'Driver');
    await putUser({
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: `CARRIER#${carrier.userId}`, GSI1SK: `ROLE#DRIVER#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name: names[i], role: 'DRIVER',
      accountStatus: 'active', carrierId: carrier.userId,
      rate, cdlClass: 'A', cdlState: 'AZ', cdlIssued: '01/01/2020', cdlExpires: '01/01/2030',
      ein: genEIN(), ss: genSSN(), phone: `(555) 400-00${String(i + 1).padStart(2, '0')}`,
      isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      createdBy: carrier.userId, lastModifiedBy: 'seed',
    });
    drivers.push({ userId, name: names[i], email, role: 'DRIVER', carrierId: carrier.userId, rate });
    console.log(`  ✅ ${names[i]} → ${carrier.name} (${userId})`);
  }
  return drivers;
}

async function seedTrucks(carriers: UserRecord[]): Promise<{ truckId: string; carrierId: string }[]> {
  console.log('\n🚚 Seeding Trucks...');
  const brands = ['Peterbilt', 'Kenworth', 'Freightliner', 'Volvo'];
  const colors = ['White', 'Black', 'Red', 'Silver'];
  const trucks: { truckId: string; carrierId: string }[] = [];

  for (const carrier of carriers) {
    for (let i = 0; i < 4; i++) {
      const truckId = uuidv4();
      const fuelGasAvgGallxMil = +(0.12 + i * 0.02).toFixed(2);
      const fuelGasAvgCost = +(3.2 + i * 0.3).toFixed(2);
      await ddb.send(new PutCommand({
        TableName: T.trucks,
        Item: {
          PK: `TRUCK#${truckId}`, SK: 'METADATA',
          GSI1PK: `CARRIER#${carrier.userId}`, GSI1SK: `TRUCK#${truckId}`,
          truckId, carrierId: carrier.userId,
          plate: genPlate(), brand: brands[i], year: 2019 + i,
          vin: genVIN(), color: colors[i], isActive: true,
          fuelGasAvgGallxMil, fuelGasAvgCost,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          createdBy: carrier.userId, lastModifiedBy: 'seed',
        },
      }));
      trucks.push({ truckId, carrierId: carrier.userId });
    }
  }
  console.log(`  ✅ ${trucks.length} trucks`);
  return trucks;
}

async function seedTrailers(carriers: UserRecord[]): Promise<{ trailerId: string; carrierId: string }[]> {
  console.log('\n🚛 Seeding Trailers...');
  const brands = ['Utility', 'Great Dane', 'Wabash', 'Hyundai'];
  const trailers: { trailerId: string; carrierId: string }[] = [];

  for (const carrier of carriers) {
    for (let i = 0; i < 4; i++) {
      const trailerId = uuidv4();
      await ddb.send(new PutCommand({
        TableName: T.trailers,
        Item: {
          PK: `TRAILER#${trailerId}`, SK: 'METADATA',
          GSI1PK: `CARRIER#${carrier.userId}`, GSI1SK: `TRAILER#${trailerId}`,
          trailerId, carrierId: carrier.userId,
          plate: genPlate(), brand: brands[i], year: 2020 + i,
          vin: genVIN(), color: 'White', isActive: true,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          createdBy: carrier.userId, lastModifiedBy: 'seed',
        },
      }));
      trailers.push({ trailerId, carrierId: carrier.userId });
    }
  }
  console.log(`  ✅ ${trailers.length} trailers`);
  return trailers;
}

// continued in next part — wiring + orders + main
export {
  T, ddb, cognito, USER_POOL_ID, EMAIL_DOMAIN, PASSWORD,
  iso, rand, randFloat, pick, genEIN, genSSN,
  clearTable, clearCognitoV2Users, putUser,
  seedBrokers, seedAdmins, seedDispatchers, seedCarriers, seedDrivers, seedTrucks, seedTrailers,
};
export type { UserRecord };
