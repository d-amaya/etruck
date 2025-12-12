import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBClient, ScanCommand, PutItemCommand, UpdateItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { ConfigService } from '../config/config.service';

/**
 * MigrationService - Handles data migration from old format to new enhanced format
 * 
 * This service provides utilities to:
 * 1. Migrate lorry records to separate truck/trailer entities
 * 2. Enhance driver profiles with new fields (CDL, banking, corporate info)
 * 3. Transform financial data structures for enhanced tracking
 * 4. Migrate document metadata to new folder-based organization
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly mainTableName: string;

  constructor(
    private readonly dynamoDBClient: DynamoDBClient,
    private readonly configService: ConfigService,
  ) {
    this.mainTableName = this.configService.dynamodbTableName;
  }

  /**
   * Main migration orchestrator
   * Runs all migration steps in sequence
   */
  async runFullMigration(): Promise<MigrationReport> {
    this.logger.log('Starting full data migration...');
    
    const report: MigrationReport = {
      startTime: new Date().toISOString(),
      lorryMigration: { processed: 0, success: 0, failed: 0, errors: [] },
      driverMigration: { processed: 0, success: 0, failed: 0, errors: [] },
      tripMigration: { processed: 0, success: 0, failed: 0, errors: [] },
      documentMigration: { processed: 0, success: 0, failed: 0, errors: [] },
      endTime: '',
      totalDuration: 0,
    };

    try {
      // Step 1: Migrate lorries to trucks/trailers
      report.lorryMigration = await this.migrateLorriesToVehicles();
      
      // Step 2: Enhance driver profiles
      report.driverMigration = await this.enhanceDriverProfiles();
      
      // Step 3: Enhance trip records
      report.tripMigration = await this.enhanceTripRecords();
      
      // Step 4: Migrate document metadata
      report.documentMigration = await this.migrateDocumentMetadata();
      
      report.endTime = new Date().toISOString();
      report.totalDuration = new Date(report.endTime).getTime() - new Date(report.startTime).getTime();
      
      this.logger.log('Full migration completed successfully');
      this.logger.log(`Total duration: ${report.totalDuration}ms`);
      
      return report;
    } catch (error) {
      this.logger.error('Migration failed', error);
      report.endTime = new Date().toISOString();
      throw error;
    }
  }

  /**
   * Migrate lorry records to separate truck and trailer entities
   * Requirement: 14.1
   * 
   * Strategy:
   * - Scan for all LORRY records in the main table
   * - For each lorry, create both a TRUCK and TRAILER record
   * - Preserve all existing data and add new required fields
   * - Keep original lorry record for backward compatibility (mark as migrated)
   */
  async migrateLorriesToVehicles(): Promise<MigrationStepReport> {
    this.logger.log('Starting lorry to vehicle migration...');
    
    const report: MigrationStepReport = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Scan for all lorry records
      const lorries = await this.scanLorryRecords();
      report.processed = lorries.length;
      
      this.logger.log(`Found ${lorries.length} lorry records to migrate`);

      for (const lorry of lorries) {
        try {
          // Create truck record from lorry
          await this.createTruckFromLorry(lorry);
          
          // Create trailer record from lorry (optional - can be null)
          // For now, we'll create a trailer for each lorry
          await this.createTrailerFromLorry(lorry);
          
          // Mark original lorry as migrated
          await this.markLorryAsMigrated(lorry);
          
          report.success++;
        } catch (error) {
          report.failed++;
          report.errors.push({
            recordId: lorry.lorryId,
            error: error.message,
          });
          this.logger.error(`Failed to migrate lorry ${lorry.lorryId}`, error);
        }
      }
      
      this.logger.log(`Lorry migration completed: ${report.success} success, ${report.failed} failed`);
      return report;
    } catch (error) {
      this.logger.error('Lorry migration failed', error);
      throw error;
    }
  }

  /**
   * Enhance driver profiles with new fields
   * Requirement: 14.3
   * 
   * Strategy:
   * - Scan for all USER records with role=DRIVER
   * - Add new fields with default/null values
   * - Preserve all existing data
   */
  async enhanceDriverProfiles(): Promise<MigrationStepReport> {
    this.logger.log('Starting driver profile enhancement...');
    
    const report: MigrationStepReport = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Scan for all driver records
      const drivers = await this.scanDriverRecords();
      report.processed = drivers.length;
      
      this.logger.log(`Found ${drivers.length} driver records to enhance`);

      for (const driver of drivers) {
        try {
          await this.enhanceDriverRecord(driver);
          report.success++;
        } catch (error) {
          report.failed++;
          report.errors.push({
            recordId: driver.userId,
            error: error.message,
          });
          this.logger.error(`Failed to enhance driver ${driver.userId}`, error);
        }
      }
      
      this.logger.log(`Driver enhancement completed: ${report.success} success, ${report.failed} failed`);
      return report;
    } catch (error) {
      this.logger.error('Driver enhancement failed', error);
      throw error;
    }
  }

  /**
   * Enhance trip records with new financial and mileage fields
   * Requirement: 14.2, 14.4
   * 
   * Strategy:
   * - Scan for all TRIP records
   * - Add new financial tracking fields with default values
   * - Add new mileage tracking fields
   * - Add enhanced pickup/delivery fields
   * - Preserve all existing data
   */
  async enhanceTripRecords(): Promise<MigrationStepReport> {
    this.logger.log('Starting trip record enhancement...');
    
    const report: MigrationStepReport = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Scan for all trip records
      const trips = await this.scanTripRecords();
      report.processed = trips.length;
      
      this.logger.log(`Found ${trips.length} trip records to enhance`);

      for (const trip of trips) {
        try {
          await this.enhanceTripRecord(trip);
          report.success++;
        } catch (error) {
          report.failed++;
          report.errors.push({
            recordId: trip.tripId,
            error: error.message,
          });
          this.logger.error(`Failed to enhance trip ${trip.tripId}`, error);
        }
      }
      
      this.logger.log(`Trip enhancement completed: ${report.success} success, ${report.failed} failed`);
      return report;
    } catch (error) {
      this.logger.error('Trip enhancement failed', error);
      throw error;
    }
  }

  /**
   * Migrate document metadata to new folder-based structure
   * Requirement: 14.4
   */
  async migrateDocumentMetadata(): Promise<MigrationStepReport> {
    this.logger.log('Starting document metadata migration...');
    
    const report: MigrationStepReport = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
    };

    // For now, document migration is minimal since we're using S3
    // Documents will be organized in folders as they're uploaded
    this.logger.log('Document metadata migration completed (no action needed)');
    
    return report;
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private async scanLorryRecords(): Promise<any[]> {
    const scanCommand = new ScanCommand({
      TableName: this.mainTableName,
      FilterExpression: 'begins_with(PK, :lorryPrefix) AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: marshall({
        ':lorryPrefix': 'LORRY_OWNER#',
        ':skPrefix': 'LORRY#',
      }),
    });

    const result = await this.dynamoDBClient.send(scanCommand);
    return result.Items ? result.Items.map(item => unmarshall(item)) : [];
  }

  private async scanDriverRecords(): Promise<any[]> {
    const scanCommand = new ScanCommand({
      TableName: this.mainTableName,
      FilterExpression: 'begins_with(PK, :userPrefix) AND SK = :sk AND #role = :role',
      ExpressionAttributeNames: {
        '#role': 'role',
      },
      ExpressionAttributeValues: marshall({
        ':userPrefix': 'USER#',
        ':sk': 'PROFILE',
        ':role': 'DRIVER',
      }),
    });

    const result = await this.dynamoDBClient.send(scanCommand);
    return result.Items ? result.Items.map(item => unmarshall(item)) : [];
  }

  private async scanTripRecords(): Promise<any[]> {
    const scanCommand = new ScanCommand({
      TableName: this.mainTableName,
      FilterExpression: 'begins_with(PK, :tripPrefix) AND SK = :sk',
      ExpressionAttributeValues: marshall({
        ':tripPrefix': 'TRIP#',
        ':sk': 'PROFILE',
      }),
    });

    const result = await this.dynamoDBClient.send(scanCommand);
    return result.Items ? result.Items.map(item => unmarshall(item)) : [];
  }

  private async createTruckFromLorry(lorry: any): Promise<void> {
    const now = new Date().toISOString();
    
    // Generate truck ID from lorry ID
    const truckId = `truck-${lorry.lorryId}`;
    
    const truck = {
      PK: `TRUCK#${truckId}`,
      SK: 'PROFILE',
      GSI1PK: `OWNER#${lorry.ownerId}#TRUCK`,
      GSI1SK: `ACTIVE#${now}#${truckId}`,
      truckId,
      ownerId: lorry.ownerId,
      name: lorry.make && lorry.model ? `${lorry.make} ${lorry.model}` : `Truck ${lorry.lorryId}`,
      vin: lorry.lorryId, // Use lorryId as VIN placeholder
      year: lorry.year || new Date().getFullYear(),
      brand: lorry.make || 'Unknown',
      color: 'Unknown',
      licensePlate: lorry.lorryId,
      verificationStatus: lorry.verificationStatus || 'Pending',
      verificationDocuments: lorry.verificationDocuments || [],
      isActive: true,
      notes: `Migrated from lorry ${lorry.lorryId}`,
      createdAt: lorry.createdAt || now,
      updatedAt: now,
      migratedFrom: lorry.lorryId,
    };

    const putCommand = new PutItemCommand({
      TableName: this.mainTableName,
      Item: marshall(truck),
    });

    await this.dynamoDBClient.send(putCommand);
  }

  private async createTrailerFromLorry(lorry: any): Promise<void> {
    const now = new Date().toISOString();
    
    // Generate trailer ID from lorry ID
    const trailerId = `trailer-${lorry.lorryId}`;
    
    const trailer = {
      PK: `TRAILER#${trailerId}`,
      SK: 'PROFILE',
      GSI1PK: `OWNER#${lorry.ownerId}#TRAILER`,
      GSI1SK: `ACTIVE#${now}#${trailerId}`,
      trailerId,
      ownerId: lorry.ownerId,
      name: `Trailer ${lorry.lorryId}`,
      vin: `T-${lorry.lorryId}`, // Use lorryId as VIN placeholder with T prefix
      year: lorry.year || new Date().getFullYear(),
      brand: 'Unknown',
      color: 'Unknown',
      licensePlate: `T-${lorry.lorryId}`,
      verificationStatus: lorry.verificationStatus || 'Pending',
      verificationDocuments: [],
      isActive: true,
      notes: `Migrated from lorry ${lorry.lorryId}`,
      createdAt: lorry.createdAt || now,
      updatedAt: now,
      migratedFrom: lorry.lorryId,
    };

    const putCommand = new PutItemCommand({
      TableName: this.mainTableName,
      Item: marshall(trailer),
    });

    await this.dynamoDBClient.send(putCommand);
  }

  private async markLorryAsMigrated(lorry: any): Promise<void> {
    const updateCommand = new UpdateItemCommand({
      TableName: this.mainTableName,
      Key: marshall({
        PK: lorry.PK,
        SK: lorry.SK,
      }),
      UpdateExpression: 'SET migrated = :migrated, migratedAt = :migratedAt',
      ExpressionAttributeValues: marshall({
        ':migrated': true,
        ':migratedAt': new Date().toISOString(),
      }),
    });

    await this.dynamoDBClient.send(updateCommand);
  }

  private async enhanceDriverRecord(driver: any): Promise<void> {
    const now = new Date().toISOString();
    
    const updateCommand = new UpdateItemCommand({
      TableName: this.mainTableName,
      Key: marshall({
        PK: driver.PK,
        SK: driver.SK,
      }),
      UpdateExpression: `
        SET 
          cdlClass = if_not_exists(cdlClass, :null),
          cdlIssued = if_not_exists(cdlIssued, :null),
          cdlExpires = if_not_exists(cdlExpires, :null),
          cdlState = if_not_exists(cdlState, :null),
          corpName = if_not_exists(corpName, :null),
          ein = if_not_exists(ein, :null),
          dob = if_not_exists(dob, :null),
          ssn = if_not_exists(ssn, :null),
          bankName = if_not_exists(bankName, :null),
          bankAccountNumber = if_not_exists(bankAccountNumber, :null),
          perMileRate = if_not_exists(perMileRate, :defaultRate),
          isActive = if_not_exists(isActive, :active),
          notes = if_not_exists(notes, :null),
          enhancedAt = :enhancedAt
      `,
      ExpressionAttributeValues: marshall({
        ':null': null,
        ':defaultRate': 0,
        ':active': true,
        ':enhancedAt': now,
      }),
    });

    await this.dynamoDBClient.send(updateCommand);
  }

  private async enhanceTripRecord(trip: any): Promise<void> {
    const now = new Date().toISOString();
    
    const updateCommand = new UpdateItemCommand({
      TableName: this.mainTableName,
      Key: marshall({
        PK: trip.PK,
        SK: trip.SK,
      }),
      UpdateExpression: `
        SET 
          truckId = if_not_exists(truckId, :null),
          trailerId = if_not_exists(trailerId, :null),
          orderStatus = if_not_exists(orderStatus, :defaultStatus),
          orderDate = if_not_exists(orderDate, :null),
          orderConfirmation = if_not_exists(orderConfirmation, :null),
          orderRate = if_not_exists(orderRate, :zero),
          orderExpenses = if_not_exists(orderExpenses, :zero),
          orderAverage = if_not_exists(orderAverage, :zero),
          orderRevenue = if_not_exists(orderRevenue, :zero),
          invoiceNumber = if_not_exists(invoiceNumber, :null),
          invoicePaid = if_not_exists(invoicePaid, :zero),
          invoiceSubTotal = if_not_exists(invoiceSubTotal, :zero),
          invoiceTotal = if_not_exists(invoiceTotal, :zero),
          invoiceTerms = if_not_exists(invoiceTerms, :null),
          loadedMiles = if_not_exists(loadedMiles, :zero),
          emptyMiles = if_not_exists(emptyMiles, :zero),
          totalMiles = if_not_exists(totalMiles, :zero),
          driverRate = if_not_exists(driverRate, :zero),
          driverAdvance = if_not_exists(driverAdvance, :zero),
          driverPayment = if_not_exists(driverPayment, :zero),
          dispatcherRate = if_not_exists(dispatcherRate, :zero),
          dispatcherPayment = if_not_exists(dispatcherPayment, :zero),
          fuelAvgCost = if_not_exists(fuelAvgCost, :zero),
          fuelAvgGallonsPerMile = if_not_exists(fuelAvgGallonsPerMile, :zero),
          fuelTotalCost = if_not_exists(fuelTotalCost, :zero),
          brokerRate = if_not_exists(brokerRate, :zero),
          brokerAdvance = if_not_exists(brokerAdvance, :zero),
          brokerCost = if_not_exists(brokerCost, :zero),
          factoryRate = if_not_exists(factoryRate, :zero),
          factoryCost = if_not_exists(factoryCost, :zero),
          factoryAdvance = if_not_exists(factoryAdvance, :zero),
          lumperFees = if_not_exists(lumperFees, :zero),
          detentionFees = if_not_exists(detentionFees, :zero),
          pickupCompany = if_not_exists(pickupCompany, :null),
          pickupPhone = if_not_exists(pickupPhone, :null),
          pickupAddress = if_not_exists(pickupAddress, :null),
          pickupCity = if_not_exists(pickupCity, :null),
          pickupState = if_not_exists(pickupState, :null),
          pickupZip = if_not_exists(pickupZip, :null),
          pickupDate = if_not_exists(pickupDate, :null),
          pickupTime = if_not_exists(pickupTime, :null),
          pickupNotes = if_not_exists(pickupNotes, :null),
          deliveryCompany = if_not_exists(deliveryCompany, :null),
          deliveryPhone = if_not_exists(deliveryPhone, :null),
          deliveryAddress = if_not_exists(deliveryAddress, :null),
          deliveryCity = if_not_exists(deliveryCity, :null),
          deliveryState = if_not_exists(deliveryState, :null),
          deliveryZip = if_not_exists(deliveryZip, :null),
          deliveryDate = if_not_exists(deliveryDate, :null),
          deliveryTime = if_not_exists(deliveryTime, :null),
          deliveryNotes = if_not_exists(deliveryNotes, :null),
          documentFolder = if_not_exists(documentFolder, :null),
          documents = if_not_exists(documents, :emptyList),
          notes = if_not_exists(notes, :null),
          enhancedAt = :enhancedAt
      `,
      ExpressionAttributeValues: marshall({
        ':null': null,
        ':zero': 0,
        ':defaultStatus': 'New',
        ':emptyList': [],
        ':enhancedAt': now,
      }),
    });

    await this.dynamoDBClient.send(updateCommand);
  }
}

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface MigrationReport {
  startTime: string;
  lorryMigration: MigrationStepReport;
  driverMigration: MigrationStepReport;
  tripMigration: MigrationStepReport;
  documentMigration: MigrationStepReport;
  endTime: string;
  totalDuration: number;
}

export interface MigrationStepReport {
  processed: number;
  success: number;
  failed: number;
  errors: Array<{ recordId: string; error: string }>;
}
