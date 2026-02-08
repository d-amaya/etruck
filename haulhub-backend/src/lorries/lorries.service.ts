import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import {
  Lorry,
  LorryVerificationStatus,
  RegisterLorryDto,
  UploadDocumentDto,
  PresignedUrlResponse,
  LorryDocumentMetadata,
  UserRole,
} from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LorriesService {
  private readonly lorriesTableName: string;
  private readonly trailersTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.lorriesTableName = this.configService.lorriesTableName;
    this.trailersTableName = this.configService.trailersTableName;
  }

  /**
   * Create a new truck for a carrier
   * Task 3.1: Add truck creation method
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 13.2, 13.3, 13.6, 13.7, 13.8
   * 
   * @param carrierId - The carrier ID creating the truck
   * @param dto - Truck creation data
   * @returns Created truck
   */
  async createTruck(carrierId: string, dto: any): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate year (1900 to current + 1)
    // Requirement 13.8
    const currentYear = new Date().getFullYear();
    if (dto.year < 1900 || dto.year > currentYear + 1) {
      throw new BadRequestException(
        `Year must be between 1900 and ${currentYear + 1}`,
      );
    }

    // Validate truckOwnerId belongs to same carrier
    // Requirements 4.5, 13.7
    await this.validateCarrierMembership(dto.truckOwnerId, carrierId);

    // Check VIN uniqueness across all trucks
    // Requirement 13.2
    const existingTruckByVin = await this.getTruckByVin(dto.vin);
    if (existingTruckByVin) {
      throw new BadRequestException(
        `A truck with VIN ${dto.vin} already exists`,
      );
    }

    // Check plate uniqueness across all trucks
    // Requirement 13.3
    const existingTruckByPlate = await this.getTruckByPlate(dto.plate);
    if (existingTruckByPlate) {
      throw new BadRequestException(
        `A truck with plate ${dto.plate} already exists`,
      );
    }

    // Generate UUID for truckId
    // Requirement 4.6
    const truckId = uuidv4();

    // Store in eTrucky-Trucks with proper keys
    // Requirements 4.1, 4.2, 4.3, 4.7
    const putCommand = new PutCommand({
      TableName: this.lorriesTableName,
      Item: {
        // Primary keys
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
        // GSI1: Carrier index
        GSI1PK: `CARRIER#${carrierId}`,
        GSI1SK: `TRUCK#${truckId}`,
        // GSI2: Owner index
        GSI2PK: `OWNER#${dto.truckOwnerId}`,
        GSI2SK: `TRUCK#${truckId}`,
        // Truck data
        truckId,
        carrierId,
        truckOwnerId: dto.truckOwnerId,
        plate: dto.plate,
        brand: dto.brand,
        year: dto.year,
        vin: dto.vin,
        color: dto.color,
        // Set isActive=true by default (Requirement 4.8)
        isActive: true,
      },
    });

    await dynamodbClient.send(putCommand);

    return {
      truckId,
      carrierId,
      truckOwnerId: dto.truckOwnerId,
      plate: dto.plate,
      brand: dto.brand,
      year: dto.year,
      vin: dto.vin,
      color: dto.color,
      isActive: true,
    };
  }

  /**
   * Get truck by VIN (for uniqueness validation)
   * Requirement 13.2
   */
  private async getTruckByVin(vin: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Scan for VIN (no GSI for VIN, so we need to scan)
    // In production, consider adding a GSI for VIN if this becomes a bottleneck
    const scanCommand = new ScanCommand({
      TableName: this.lorriesTableName,
      FilterExpression: 'vin = :vin',
      ExpressionAttributeValues: {
        ':vin': vin,
      },
    });

    try {
      const result = await dynamodbClient.send(scanCommand);
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      // If scan fails, return null (assume no duplicate)
      return null;
    }
  }

  /**
   * Get truck by plate (for uniqueness validation)
   * Requirement 13.3
   */
  private async getTruckByPlate(plate: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Scan for plate (no GSI for plate, so we need to scan)
    // In production, consider adding a GSI for plate if this becomes a bottleneck
    const scanCommand = new ScanCommand({
      TableName: this.lorriesTableName,
      FilterExpression: 'plate = :plate',
      ExpressionAttributeValues: {
        ':plate': plate,
      },
    });

    try {
      const result = await dynamodbClient.send(scanCommand);
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      // If scan fails, return null (assume no duplicate)
      return null;
    }
  }

  /**
   * Register a new truck (formerly lorry) for a truck owner
   * PK: TRUCK#{truckId}
   * SK: METADATA
   * GSI1PK: CARRIER#{carrierId}
   * GSI1SK: TRUCK#{truckId}
   * GSI2PK: OWNER#{truckOwnerId}
   * GSI2SK: TRUCK#{truckId}
   * 
   * Task 3.1.1, 3.1.2, 3.1.3: Updated for eTrucky-Trucks schema
   */
  async registerLorry(
    ownerId: string,
    dto: RegisterLorryDto,
    carrierId?: string,
  ): Promise<Lorry> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate year
    const currentYear = new Date().getFullYear();
    if (dto.year < 1900 || dto.year > currentYear + 1) {
      throw new BadRequestException(
        `Year must be between 1900 and ${currentYear + 1}`,
      );
    }

    // Generate UUID for truck if not provided
    const truckId = dto.lorryId || uuidv4();

    // Check if truck already exists
    const existingTruck = await this.getTruckByIdInternal(truckId);
    if (existingTruck) {
      throw new ConflictException(
        `Truck with ID ${truckId} is already registered`,
      );
    }

    // Task 3.1.6: Validate carrier membership if carrierId provided
    if (carrierId) {
      await this.validateCarrierMembership(ownerId, carrierId);
    }

    const now = new Date().toISOString();
    const lorry: Lorry = {
      lorryId: truckId,
      ownerId,
      make: dto.make,
      model: dto.model,
      year: dto.year,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [],
      createdAt: now,
      updatedAt: now,
    };

    // Store truck in DynamoDB with new eTrucky-Trucks schema
    // Task 3.1.2: Field mappings - lorryId→truckId, make→brand
    // Task 3.1.3: Add color, truckOwnerId, carrierId fields
    const putCommand = new PutCommand({
      TableName: this.lorriesTableName,
      Item: {
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
        // Task 3.1.4: GSI1 with CARRIER# prefix
        GSI1PK: carrierId ? `CARRIER#${carrierId}` : undefined,
        GSI1SK: carrierId ? `TRUCK#${truckId}` : undefined,
        // Task 3.1.5: GSI2 with OWNER# prefix
        GSI2PK: `OWNER#${ownerId}`,
        GSI2SK: `TRUCK#${truckId}`,
        truckId: truckId,
        truckOwnerId: ownerId,
        carrierId: carrierId,
        plate: dto.lorryId, // Using lorryId as plate for backward compatibility
        brand: dto.make,
        year: dto.year,
        vin: '', // TODO: Add VIN to DTO
        color: '', // TODO: Add color to DTO
        isActive: true,
      },
    });

    await dynamodbClient.send(putCommand);

    return lorry;
  }

  /**
   * Get all trucks for a specific owner
   * Task 3.1.5: Query by GSI2 with OWNER# prefix
   */
  async getLorriesByOwner(ownerId: string): Promise<Lorry[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const queryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `OWNER#${ownerId}`,
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.mapItemToLorry(item));
  }

  /**
   * Get trucks by carrier
   * Task 3.1.4: Query by GSI1 with CARRIER# prefix
   * Public method for controller use
   */
  async getTrucksByCarrier(carrierId: string): Promise<Lorry[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const queryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `CARRIER#${carrierId}`,
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.mapItemToLorry(item));
  }

  /**
   * Get a specific truck by ID (internal method)
   * Uses new PK format: TRUCK#{truckId}
   */
  private async getTruckByIdInternal(truckId: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const getCommand = new GetCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
      },
    });

    const result = await dynamodbClient.send(getCommand);
    return result.Item || null;
  }

  /**
   * Get a specific truck by ID and owner
   * Used for authorization checks
   */
  async getLorryByIdAndOwner(
    lorryId: string,
    ownerId: string,
  ): Promise<Lorry | null> {
    const truck = await this.getTruckByIdInternal(lorryId);

    if (!truck) {
      return null;
    }

    // Verify ownership
    if (truck.truckOwnerId !== ownerId) {
      return null;
    }

    return this.mapItemToLorry(truck);
  }

  /**
   * Get a specific truck by ID
   * Used by admin and for trip validation
   */
  async getLorryById(lorryId: string, ownerId: string): Promise<Lorry> {
    const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);

    if (!lorry) {
      throw new NotFoundException(`Truck with ID ${lorryId} not found`);
    }

    return lorry;
  }

  /**
   * Update truck details
   * Task 3.2: Add truck update and deactivation methods
   * Requirements: 4.13, 4.14
   * 
   * @param truckId - The truck ID to update
   * @param carrierId - The carrier ID (for authorization)
   * @param dto - Update data (plate, brand, year, vin, color, truckOwnerId)
   * @returns Updated truck
   */
  async updateTruck(
    truckId: string,
    carrierId: string,
    dto: Partial<{
      plate: string;
      brand: string;
      year: number;
      vin: string;
      color: string;
      truckOwnerId: string;
    }>,
  ): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify truck exists and belongs to carrier
    const existingTruck = await this.getTruckByIdInternal(truckId);
    if (!existingTruck) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    if (existingTruck.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to update this truck',
      );
    }

    // Validate year if provided
    if (dto.year !== undefined) {
      const currentYear = new Date().getFullYear();
      if (dto.year < 1900 || dto.year > currentYear + 1) {
        throw new BadRequestException(
          `Year must be between 1900 and ${currentYear + 1}`,
        );
      }
    }

    // Validate truckOwnerId belongs to same carrier if provided
    if (dto.truckOwnerId !== undefined) {
      await this.validateCarrierMembership(dto.truckOwnerId, carrierId);
    }

    // Check VIN uniqueness if VIN is being updated
    if (dto.vin !== undefined && dto.vin !== existingTruck.vin) {
      const existingTruckByVin = await this.getTruckByVin(dto.vin);
      if (existingTruckByVin && existingTruckByVin.truckId !== truckId) {
        throw new BadRequestException(
          `A truck with VIN ${dto.vin} already exists`,
        );
      }
    }

    // Check plate uniqueness if plate is being updated
    if (dto.plate !== undefined && dto.plate !== existingTruck.plate) {
      const existingTruckByPlate = await this.getTruckByPlate(dto.plate);
      if (existingTruckByPlate && existingTruckByPlate.truckId !== truckId) {
        throw new BadRequestException(
          `A truck with plate ${dto.plate} already exists`,
        );
      }
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    // Add updatable fields
    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = value;
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    // If truckOwnerId is being updated, also update GSI2PK and GSI2SK
    if (dto.truckOwnerId !== undefined) {
      updateExpressions.push(`#GSI2PK = :GSI2PK`);
      updateExpressions.push(`#GSI2SK = :GSI2SK`);
      expressionAttributeValues[':GSI2PK'] = `OWNER#${dto.truckOwnerId}`;
      expressionAttributeValues[':GSI2SK'] = `TRUCK#${truckId}`;
      expressionAttributeNames['#GSI2PK'] = 'GSI2PK';
      expressionAttributeNames['#GSI2SK'] = 'GSI2SK';
    }

    if (updateExpressions.length === 0) {
      // No updates provided, return existing truck
      return this.mapItemToTruck(existingTruck);
    }

    const updateCommand = new UpdateCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    if (!result.Attributes) {
      throw new Error('Failed to update truck');
    }

    return this.mapItemToTruck(result.Attributes);
  }

  /**
   * Deactivate truck (soft delete)
   * Task 3.2: Add truck update and deactivation methods
   * Requirements: 4.15
   * 
   * @param truckId - The truck ID to deactivate
   * @param carrierId - The carrier ID (for authorization)
   * @returns Updated truck with isActive=false
   */
  async deactivateTruck(truckId: string, carrierId: string): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify truck exists and belongs to carrier
    const existingTruck = await this.getTruckByIdInternal(truckId);
    if (!existingTruck) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    if (existingTruck.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to deactivate this truck',
      );
    }

    const updateCommand = new UpdateCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': false,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    return this.mapItemToTruck(result.Attributes);
  }

  /**
   * Reactivate truck
   * Task 3.2: Add truck update and deactivation methods
   * Requirements: 4.16
   * 
   * @param truckId - The truck ID to reactivate
   * @param carrierId - The carrier ID (for authorization)
   * @returns Updated truck with isActive=true
   */
  async reactivateTruck(truckId: string, carrierId: string): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify truck exists and belongs to carrier
    const existingTruck = await this.getTruckByIdInternal(truckId);
    if (!existingTruck) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    if (existingTruck.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to reactivate this truck',
      );
    }

    const updateCommand = new UpdateCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${truckId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': true,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    return this.mapItemToTruck(result.Attributes);
  }

  /**
   * Task 3.1.6: Validate carrier membership
   * Verifies that the truck owner belongs to the specified carrier
   */
  private async validateCarrierMembership(
    ownerId: string,
    carrierId: string,
  ): Promise<void> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Query eTrucky-Users table to verify owner's carrierId
    const getCommand = new GetCommand({
      TableName: this.configService.usersTableName,
      Key: {
        PK: `USER#${ownerId}`,
        SK: 'METADATA',
      },
    });

    const result = await dynamodbClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(`User with ID ${ownerId} not found`);
    }

    if (result.Item.carrierId !== carrierId) {
      throw new ForbiddenException(
        'Truck owner does not belong to this carrier',
      );
    }
  }

  /**
   * Task 3.2: Trailer support methods
   */

  /**
   * Task 3.2.1: Get trailers by carrier
   * Query GSI1 with CARRIER# prefix
   */
  async getTrailersByCarrier(carrierId: string): Promise<any[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const queryCommand = new QueryCommand({
      TableName: this.trailersTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `CARRIER#${carrierId}`,
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.mapItemToTrailer(item));
  }

  /**
   * Get all drivers for a carrier
   * Query eTrucky-Users table by carrierId and role=DRIVER
   */
  async getDriversByCarrier(carrierId: string): Promise<any[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const usersTableName = this.configService.usersTableName;

    const queryCommand = new QueryCommand({
      TableName: usersTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :role)',
      ExpressionAttributeValues: {
        ':pk': `CARRIER#${carrierId}`,
        ':role': 'ROLE#DRIVER#',
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => ({
      userId: item.userId,
      name: item.name,
      email: item.email,
      phone: item.phone,
      corpName: item.corpName,
      cdlClass: item.cdlClass,
      cdlState: item.cdlState,
      nationalId: item.ss,
      isActive: item.isActive,
    }));
  }

  async getDispatchersByCarrier(carrierId: string): Promise<any[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const usersTableName = this.configService.usersTableName;

    const queryCommand = new QueryCommand({
      TableName: usersTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :role)',
      ExpressionAttributeValues: {
        ':pk': `CARRIER#${carrierId}`,
        ':role': 'ROLE#DISPATCHER#',
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => ({
      userId: item.userId,
      name: item.name,
      email: item.email,
      phone: item.phone,
      isActive: item.isActive,
    }));
  }

  /**
   * Get all truck owners for a carrier
   * Query eTrucky-Users table by carrierId and role=TRUCK_OWNER
   */
  async getTruckOwnersByCarrier(carrierId: string): Promise<any[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const usersTableName = this.configService.usersTableName;

    const queryCommand = new QueryCommand({
      TableName: usersTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :role)',
      ExpressionAttributeValues: {
        ':pk': `CARRIER#${carrierId}`,
        ':role': 'ROLE#TRUCK_OWNER#',
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => ({
      userId: item.userId,
      name: item.name,
      email: item.email,
      phone: item.phone,
      corpName: item.corpName,
      isActive: item.isActive,
    }));
  }

  /**
   * Task 3.2.2: Get trailer by ID
   */
  async getTrailerById(trailerId: string): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const getCommand = new GetCommand({
      TableName: this.trailersTableName,
      Key: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
      },
    });

    const result = await dynamodbClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    return this.mapItemToTrailer(result.Item);
  }

  /**
   * Get a specific trailer by ID (internal method)
   * Uses PK format: TRAILER#{trailerId}
   * Used for authorization checks in update/deactivate methods
   */
  private async getTrailerByIdInternal(trailerId: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const getCommand = new GetCommand({
      TableName: this.trailersTableName,
      Key: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
      },
    });

    const result = await dynamodbClient.send(getCommand);
    return result.Item || null;
  }

  /**
   * Create a new trailer for a carrier
   * Task 3.3: Add trailer creation method
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 13.4, 13.5
   * 
   * @param carrierId - The carrier ID creating the trailer
   * @param dto - Trailer creation data
   * @returns Created trailer
   */
  async createTrailer(carrierId: string, dto: any): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate year (1900 to current + 1)
    // Requirement 13.8 (same validation as trucks)
    const currentYear = new Date().getFullYear();
    if (dto.year < 1900 || dto.year > currentYear + 1) {
      throw new BadRequestException(
        `Year must be between 1900 and ${currentYear + 1}`,
      );
    }

    // Check VIN uniqueness across all trailers
    // Requirement 13.4
    const existingTrailerByVin = await this.getTrailerByVin(dto.vin);
    if (existingTrailerByVin) {
      throw new BadRequestException(
        `A trailer with VIN ${dto.vin} already exists`,
      );
    }

    // Check plate uniqueness across all trailers
    // Requirement 13.5
    const existingTrailerByPlate = await this.getTrailerByPlate(dto.plate);
    if (existingTrailerByPlate) {
      throw new BadRequestException(
        `A trailer with plate ${dto.plate} already exists`,
      );
    }

    // Generate UUID for trailerId
    // Requirement 5.5
    const trailerId = uuidv4();

    // Store in eTrucky-Trailers with proper keys
    // Requirements 5.1, 5.2, 5.6
    const putCommand = new PutCommand({
      TableName: this.trailersTableName,
      Item: {
        // Primary keys
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
        // GSI1: Carrier index
        GSI1PK: `CARRIER#${carrierId}`,
        GSI1SK: `TRAILER#${trailerId}`,
        // Trailer data
        trailerId,
        carrierId,
        plate: dto.plate,
        brand: dto.brand,
        year: dto.year,
        vin: dto.vin,
        color: dto.color,
        // Accept optional reefer field (Requirement 5.4)
        reefer: dto.reefer || null,
        // Set isActive=true by default (Requirement 5.7)
        isActive: true,
      },
    });

    await dynamodbClient.send(putCommand);

    return {
      trailerId,
      carrierId,
      plate: dto.plate,
      brand: dto.brand,
      year: dto.year,
      vin: dto.vin,
      color: dto.color,
      reefer: dto.reefer || null,
      isActive: true,
    };
  }

  /**
   * Get trailer by VIN (for uniqueness validation)
   * Requirement 13.4
   */
  private async getTrailerByVin(vin: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Scan for VIN (no GSI for VIN, so we need to scan)
    // In production, consider adding a GSI for VIN if this becomes a bottleneck
    const scanCommand = new ScanCommand({
      TableName: this.trailersTableName,
      FilterExpression: 'vin = :vin',
      ExpressionAttributeValues: {
        ':vin': vin,
      },
    });

    try {
      const result = await dynamodbClient.send(scanCommand);
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      // If scan fails, return null (assume no duplicate)
      return null;
    }
  }

  /**
   * Get trailer by plate (for uniqueness validation)
   * Requirement 13.5
   */
  private async getTrailerByPlate(plate: string): Promise<any | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Scan for plate (no GSI for plate, so we need to scan)
    // In production, consider adding a GSI for plate if this becomes a bottleneck
    const scanCommand = new ScanCommand({
      TableName: this.trailersTableName,
      FilterExpression: 'plate = :plate',
      ExpressionAttributeValues: {
        ':plate': plate,
      },
    });

    try {
      const result = await dynamodbClient.send(scanCommand);
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      // If scan fails, return null (assume no duplicate)
      return null;
    }
  }

  /**
   * Update trailer details
   * Task 3.4: Add trailer update and deactivation methods
   * Requirements: 5.11, 5.12
   * 
   * @param trailerId - The trailer ID to update
   * @param carrierId - The carrier ID (for authorization)
   * @param dto - Update data (plate, brand, year, vin, color, reefer)
   * @returns Updated trailer
   */
  async updateTrailer(
    trailerId: string,
    carrierId: string,
    dto: Partial<{
      plate: string;
      brand: string;
      year: number;
      vin: string;
      color: string;
      reefer: string | null;
    }>,
  ): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify trailer exists and belongs to carrier
    const existingTrailer = await this.getTrailerByIdInternal(trailerId);
    if (!existingTrailer) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    if (existingTrailer.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to update this trailer',
      );
    }

    // Validate year if provided
    if (dto.year !== undefined) {
      const currentYear = new Date().getFullYear();
      if (dto.year < 1900 || dto.year > currentYear + 1) {
        throw new BadRequestException(
          `Year must be between 1900 and ${currentYear + 1}`,
        );
      }
    }

    // Check VIN uniqueness if VIN is being updated
    if (dto.vin !== undefined && dto.vin !== existingTrailer.vin) {
      const existingTrailerByVin = await this.getTrailerByVin(dto.vin);
      if (existingTrailerByVin && existingTrailerByVin.trailerId !== trailerId) {
        throw new BadRequestException(
          `A trailer with VIN ${dto.vin} already exists`,
        );
      }
    }

    // Check plate uniqueness if plate is being updated
    if (dto.plate !== undefined && dto.plate !== existingTrailer.plate) {
      const existingTrailerByPlate = await this.getTrailerByPlate(dto.plate);
      if (existingTrailerByPlate && existingTrailerByPlate.trailerId !== trailerId) {
        throw new BadRequestException(
          `A trailer with plate ${dto.plate} already exists`,
        );
      }
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    // Add updatable fields
    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = value;
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    if (updateExpressions.length === 0) {
      // No updates provided, return existing trailer
      return this.mapItemToTrailer(existingTrailer);
    }

    const updateCommand = new UpdateCommand({
      TableName: this.trailersTableName,
      Key: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    if (!result.Attributes) {
      throw new Error('Failed to update trailer');
    }

    return this.mapItemToTrailer(result.Attributes);
  }

  /**
   * Deactivate trailer (soft delete)
   * Task 3.4: Add trailer update and deactivation methods
   * Requirements: 5.13
   * 
   * @param trailerId - The trailer ID to deactivate
   * @param carrierId - The carrier ID (for authorization)
   * @returns Updated trailer with isActive=false
   */
  async deactivateTrailer(trailerId: string, carrierId: string): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify trailer exists and belongs to carrier
    const existingTrailer = await this.getTrailerByIdInternal(trailerId);
    if (!existingTrailer) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    if (existingTrailer.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to deactivate this trailer',
      );
    }

    const updateCommand = new UpdateCommand({
      TableName: this.trailersTableName,
      Key: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': false,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    return this.mapItemToTrailer(result.Attributes);
  }

  /**
   * Reactivate trailer
   * Task 3.4: Add trailer update and deactivation methods
   * Requirements: 5.14
   * 
   * @param trailerId - The trailer ID to reactivate
   * @param carrierId - The carrier ID (for authorization)
   * @returns Updated trailer with isActive=true
   */
  async reactivateTrailer(trailerId: string, carrierId: string): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify trailer exists and belongs to carrier
    const existingTrailer = await this.getTrailerByIdInternal(trailerId);
    if (!existingTrailer) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    if (existingTrailer.carrierId !== carrierId) {
      throw new ForbiddenException(
        'You do not have permission to reactivate this trailer',
      );
    }

    const updateCommand = new UpdateCommand({
      TableName: this.trailersTableName,
      Key: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': true,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamodbClient.send(updateCommand);

    return this.mapItemToTrailer(result.Attributes);
  }

  /**
   * Task 3.2.5: Delete trailer (soft delete) - legacy method
   * @deprecated Use deactivateTrailer instead
   */
  async deleteTrailer(trailerId: string, carrierId: string): Promise<void> {
    await this.deactivateTrailer(trailerId, carrierId);
  }

  /**
   * Generate presigned URL for document upload
   * Requirements: 6.5, 15.1, 15.2
   */
  async generateUploadUrl(
    lorryId: string,
    ownerId: string,
    dto: UploadDocumentDto,
    userRole: UserRole,
  ): Promise<PresignedUrlResponse> {
    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (dto.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds the maximum limit of 10MB`,
      );
    }

    // Verify truck exists and user has permission
    const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);
    if (!lorry) {
      throw new NotFoundException(`Truck with ID ${lorryId} not found`);
    }

    // Generate unique document ID
    const documentId = uuidv4();
    const s3Key = `lorries/${lorryId}/documents/${documentId}`;

    // Generate presigned URL for upload (15 minutes expiration)
    const s3Client = this.awsService.getS3Client();
    const bucketName = this.configService.s3DocumentsBucketName;

    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: dto.contentType,
      Metadata: {
        lorryId,
        ownerId,
        documentId,
        fileName: dto.fileName,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: 900, // 15 minutes
    });

    // Store document metadata in DynamoDB
    const now = new Date().toISOString();
    const documentMetadata: LorryDocumentMetadata = {
      documentId,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      contentType: dto.contentType,
      uploadedAt: now,
    };

    const dynamodbClient = this.awsService.getDynamoDBClient();
    const putCommand = new PutCommand({
      TableName: this.lorriesTableName,
      Item: {
        PK: `TRUCK#${lorryId}`,
        SK: `DOCUMENT#${documentId}`,
        lorryId,
        ownerId,
        s3Key,
        ...documentMetadata,
      },
    });

    await dynamodbClient.send(putCommand);

    // Update truck's verificationDocuments array
    await this.addDocumentToLorry(lorryId, ownerId, documentMetadata);

    return {
      uploadUrl,
      documentId,
      expiresIn: 900,
    };
  }

  /**
   * Generate presigned URL for document viewing
   * Requirements: 15.3, 15.4
   */
  async generateViewUrl(
    lorryId: string,
    documentId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<string> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Get document metadata
    const getCommand = new GetCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${lorryId}`,
        SK: `DOCUMENT#${documentId}`,
      },
    });

    const result = await dynamodbClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(
        `Document with ID ${documentId} not found for truck ${lorryId}`,
      );
    }

    const ownerId = result.Item.ownerId;
    const s3Key = result.Item.s3Key;

    // Authorization check: only owner and admin can view documents
    if (userRole !== UserRole.Admin && userId !== ownerId) {
      throw new ForbiddenException(
        'You do not have permission to access this document',
      );
    }

    // Generate presigned URL for viewing (15 minutes expiration)
    const s3Client = this.awsService.getS3Client();
    const bucketName = this.configService.s3DocumentsBucketName;

    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    const viewUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 900, // 15 minutes
    });

    return viewUrl;
  }

  /**
   * Get all documents for a truck
   * Requirements: 15.4
   */
  async getDocuments(
    lorryId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<LorryDocumentMetadata[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Get document metadata
    const queryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRUCK#${lorryId}`,
        ':sk': 'DOCUMENT#',
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Authorization check: only owner and admin can view documents
    const ownerId = result.Items[0].ownerId;
    if (userRole !== UserRole.Admin && userId !== ownerId) {
      throw new ForbiddenException(
        'You do not have permission to access these documents',
      );
    }

    return result.Items.map((item) => ({
      documentId: item.documentId,
      fileName: item.fileName,
      fileSize: item.fileSize,
      contentType: item.contentType,
      uploadedAt: item.uploadedAt,
    }));
  }

  /**
   * Add document metadata to truck's verificationDocuments array
   */
  private async addDocumentToLorry(
    lorryId: string,
    ownerId: string,
    documentMetadata: LorryDocumentMetadata,
  ): Promise<void> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const updateCommand = new UpdateCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `TRUCK#${lorryId}`,
        SK: 'METADATA',
      },
      UpdateExpression:
        'SET verificationDocuments = list_append(if_not_exists(verificationDocuments, :empty_list), :doc), updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':doc': [documentMetadata],
        ':empty_list': [],
        ':updatedAt': new Date().toISOString(),
      },
    });

    await dynamodbClient.send(updateCommand);
  }

  /**
   * Map DynamoDB item to Lorry interface
   * Task 3.1.2: Handle new field names (truckId, plate, brand)
   */
  private mapItemToLorry(item: any): Lorry {
    return {
      truckId: item.truckId,
      truckOwnerId: item.truckOwnerId,
      carrierId: item.carrierId,
      plate: item.plate,
      brand: item.brand,
      year: item.year,
      vin: item.vin,
      color: item.color,
      isActive: item.isActive,
    } as any;
  }

  /**
   * Map DynamoDB item to Truck object
   * Used by update and deactivation methods
   */
  private mapItemToTruck(item: any): any {
    return {
      truckId: item.truckId,
      truckOwnerId: item.truckOwnerId,
      carrierId: item.carrierId,
      plate: item.plate,
      brand: item.brand,
      year: item.year,
      vin: item.vin,
      color: item.color,
      isActive: item.isActive,
    };
  }

  /**
   * Map DynamoDB item to Trailer interface
   */
  private mapItemToTrailer(item: any): any {
    return {
      trailerId: item.trailerId,
      carrierId: item.carrierId,
      plate: item.plate,
      brand: item.brand,
      year: item.year,
      vin: item.vin,
      color: item.color,
      reefer: item.reefer,
      isActive: item.isActive,
    };
  }
}
