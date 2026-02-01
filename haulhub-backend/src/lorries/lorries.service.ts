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
      nationalId: item.ss, // Driver license number
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
   * Task 3.2.3: Create trailer with carrier validation
   */
  async createTrailer(trailerData: {
    carrierId: string;
    plate: string;
    brand: string;
    year: number;
    vin: string;
    color: string;
    reefer?: string | null;
  }): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate year
    const currentYear = new Date().getFullYear();
    if (trailerData.year < 1900 || trailerData.year > currentYear + 1) {
      throw new BadRequestException(
        `Year must be between 1900 and ${currentYear + 1}`,
      );
    }

    // Generate UUID for trailer
    const trailerId = uuidv4();

    // Task 3.2.6: Store with GSI1 CARRIER# prefix
    const putCommand = new PutCommand({
      TableName: this.trailersTableName,
      Item: {
        PK: `TRAILER#${trailerId}`,
        SK: 'METADATA',
        GSI1PK: `CARRIER#${trailerData.carrierId}`,
        GSI1SK: `TRAILER#${trailerId}`,
        trailerId,
        carrierId: trailerData.carrierId,
        plate: trailerData.plate,
        brand: trailerData.brand,
        year: trailerData.year,
        vin: trailerData.vin,
        color: trailerData.color,
        reefer: trailerData.reefer || null,
        isActive: true,
      },
    });

    await dynamodbClient.send(putCommand);

    return {
      trailerId,
      ...trailerData,
      isActive: true,
    };
  }

  /**
   * Task 3.2.4: Update trailer
   */
  async updateTrailer(
    trailerId: string,
    updates: Partial<{
      plate: string;
      brand: string;
      year: number;
      vin: string;
      color: string;
      reefer: string | null;
      isActive: boolean;
    }>,
  ): Promise<any> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Verify trailer exists
    await this.getTrailerById(trailerId);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    Object.entries(updates).forEach(([key, value]) => {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeValues[`:${key}`] = value;
      expressionAttributeNames[`#${key}`] = key;
    });

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

    return this.mapItemToTrailer(result.Attributes);
  }

  /**
   * Task 3.2.5: Delete trailer (soft delete)
   */
  async deleteTrailer(trailerId: string): Promise<void> {
    await this.updateTrailer(trailerId, { isActive: false });
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
