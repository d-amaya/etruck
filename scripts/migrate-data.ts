#!/usr/bin/env ts-node
/**
 * Data Migration Script
 * 
 * This script migrates existing HaulHub data to the new enhanced format:
 * 1. Lorries → Trucks + Trailers
 * 2. Basic driver profiles → Enhanced driver profiles
 * 3. Basic trips → Enhanced trips with truck/trailer references
 * 
 * Usage:
 *   ts-node scripts/migrate-data.ts
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../haulhub-backend/.env') });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

async function migrateLorriesToTrucksAndTrailers() {
  console.log('Starting migration: Lorries to Trucks and Trailers...');
  
  const tableName = process.env.LORRIES_TABLE_NAME!;
  let lastEvaluatedKey: any = undefined;
  let migratedCount = 0;
  let skippedCount = 0;

  do {
    const scanCommand = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await docClient.send(scanCommand);
    
    if (result.Items) {
      for (const lorry of result.Items) {
        // Skip if already migrated (has vehicleType field)
        if (lorry.vehicleType) {
          console.log(`  Skipping already migrated lorry: ${lorry.lorryId}`);
          skippedCount++;
          continue;
        }

        console.log(`  Migrating lorry: ${lorry.lorryId}`);

        // Update existing lorry record to be a truck
        const updateTruckCommand = new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: lorry.PK,
            SK: lorry.SK,
          },
          UpdateExpression: 'SET vehicleType = :vehicleType, truckId = :truckId, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':vehicleType': 'Truck',
            ':truckId': lorry.lorryId,
            ':updatedAt': new Date().toISOString(),
          },
        });

        await docClient.send(updateTruckCommand);

        // Create a corresponding trailer record
        const trailer = {
          PK: lorry.PK,
          SK: `TRAILER#${lorry.lorryId}-TRAILER`,
          vehicleType: 'Trailer',
          trailerId: `${lorry.lorryId}-TRAILER`,
          ownerId: lorry.ownerId,
          make: 'Generic',
          model: 'Dry Van',
          year: lorry.year,
          verificationStatus: lorry.verificationStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          GSI1PK: `TRAILER_STATUS#${lorry.verificationStatus}`,
          GSI1SK: `TRAILER#${lorry.lorryId}-TRAILER`,
        };

        await docClient.send(new PutCommand({
          TableName: tableName,
          Item: trailer,
        }));

        migratedCount++;
        console.log(`  ✓ Migrated lorry ${lorry.lorryId} to truck + trailer`);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`\nMigration complete: ${migratedCount} lorries migrated, ${skippedCount} skipped`);
}

async function enhanceDriverProfiles() {
  console.log('\nStarting migration: Enhance Driver Profiles...');
  
  const tableName = process.env.USERS_TABLE_NAME!;
  let lastEvaluatedKey: any = undefined;
  let enhancedCount = 0;
  let skippedCount = 0;

  do {
    const scanCommand = new ScanCommand({
      TableName: tableName,
      FilterExpression: '#role = :role AND SK = :sk',
      ExpressionAttributeNames: {
        '#role': 'role',
      },
      ExpressionAttributeValues: {
        ':role': 'Driver',
        ':sk': 'PROFILE',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await docClient.send(scanCommand);
    
    if (result.Items) {
      for (const driver of result.Items) {
        // Skip if already enhanced (has licenseNumber field)
        if (driver.licenseNumber) {
          console.log(`  Skipping already enhanced driver: ${driver.userId}`);
          skippedCount++;
          continue;
        }

        console.log(`  Enhancing driver profile: ${driver.userId}`);

        const updateCommand = new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: driver.PK,
            SK: driver.SK,
          },
          UpdateExpression: 'SET licenseNumber = :licenseNumber, licenseState = :licenseState, licenseExpiry = :licenseExpiry, medicalCertExpiry = :medicalCertExpiry, endorsements = :endorsements, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':licenseNumber': driver.driverId || driver.userId,
            ':licenseState': 'CA',
            ':licenseExpiry': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            ':medicalCertExpiry': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            ':endorsements': [],
            ':updatedAt': new Date().toISOString(),
          },
        });

        await docClient.send(updateCommand);
        enhancedCount++;
        console.log(`  ✓ Enhanced driver profile: ${driver.userId}`);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`\nMigration complete: ${enhancedCount} driver profiles enhanced, ${skippedCount} skipped`);
}

async function enhanceTripRecords() {
  console.log('\nStarting migration: Enhance Trip Records...');
  
  const tableName = process.env.TRIPS_TABLE_NAME!;
  let lastEvaluatedKey: any = undefined;
  let enhancedCount = 0;
  let skippedCount = 0;

  do {
    const scanCommand = new ScanCommand({
      TableName: tableName,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': 'METADATA',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await docClient.send(scanCommand);
    
    if (result.Items) {
      for (const trip of result.Items) {
        // Skip if already enhanced (has truckId field)
        if (trip.truckId) {
          console.log(`  Skipping already enhanced trip: ${trip.tripId}`);
          skippedCount++;
          continue;
        }

        console.log(`  Enhancing trip record: ${trip.tripId}`);

        const updateCommand = new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: trip.PK,
            SK: trip.SK,
          },
          UpdateExpression: 'SET truckId = :truckId, trailerId = :trailerId, distance = :distance, cargoWeight = :cargoWeight, cargoDescription = :cargoDescription, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':truckId': trip.lorryId,
            ':trailerId': `${trip.lorryId}-TRAILER`,
            ':distance': 0,
            ':cargoWeight': 0,
            ':cargoDescription': 'General Freight',
            ':updatedAt': new Date().toISOString(),
          },
        });

        await docClient.send(updateCommand);
        enhancedCount++;
        console.log(`  ✓ Enhanced trip record: ${trip.tripId}`);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`\nMigration complete: ${enhancedCount} trip records enhanced, ${skippedCount} skipped`);
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Starting HaulHub Data Migration');
    console.log('='.repeat(60));
    console.log('\nEnvironment Configuration:');
    console.log(`  Region: ${process.env.AWS_REGION}`);
    console.log(`  Lorries Table: ${process.env.LORRIES_TABLE_NAME}`);
    console.log(`  Users Table: ${process.env.USERS_TABLE_NAME}`);
    console.log(`  Trips Table: ${process.env.TRIPS_TABLE_NAME}`);
    console.log('='.repeat(60));
    console.log('');

    await migrateLorriesToTrucksAndTrailers();
    await enhanceDriverProfiles();
    await enhanceTripRecords();

    console.log('\n' + '='.repeat(60));
    console.log('All migrations completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('Migration failed:', error);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
