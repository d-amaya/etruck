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
  DocumentMetadata,
  UserRole,
} from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LorriesService {
  private readonly lorriesTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.lorriesTableName = this.configService.lorriesTableName;
  }

  /**
   * Register a new lorry for a lorry owner
   * PK: LORRY_OWNER#{ownerId}
   * SK: LORRY#{lorryId}
   * GSI1PK: LORRY_STATUS#{verificationStatus}
   * GSI1SK: LORRY#{lorryId}
   */
  async registerLorry(
    ownerId: string,
    dto: RegisterLorryDto,
  ): Promise<Lorry> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate year
    const currentYear = new Date().getFullYear();
    if (dto.year < 1900 || dto.year > currentYear + 1) {
      throw new BadRequestException(
        `Year must be between 1900 and ${currentYear + 1}`,
      );
    }

    // Check if lorry already exists for this owner
    const existingLorry = await this.getLorryByIdAndOwner(
      dto.lorryId,
      ownerId,
    );
    if (existingLorry) {
      throw new ConflictException(
        `Lorry with ID ${dto.lorryId} is already registered for this owner`,
      );
    }

    const now = new Date().toISOString();
    const lorry: Lorry = {
      lorryId: dto.lorryId,
      ownerId,
      make: dto.make,
      model: dto.model,
      year: dto.year,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [],
      createdAt: now,
      updatedAt: now,
    };

    // Store lorry in DynamoDB
    const putCommand = new PutCommand({
      TableName: this.lorriesTableName,
      Item: {
        PK: `LORRY_OWNER#${ownerId}`,
        SK: `LORRY#${dto.lorryId}`,
        GSI1PK: `LORRY_STATUS#${LorryVerificationStatus.Pending}`,
        GSI1SK: `LORRY#${dto.lorryId}`,
        ...lorry,
      },
    });

    await dynamodbClient.send(putCommand);

    return lorry;
  }

  /**
   * Get all lorries for a specific owner
   * Query by PK: LORRY_OWNER#{ownerId}
   */
  async getLorriesByOwner(ownerId: string): Promise<Lorry[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const queryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `LORRY_OWNER#${ownerId}`,
        ':sk': 'LORRY#',
      },
    });

    const result = await dynamodbClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.mapItemToLorry(item));
  }

  /**
   * Get a specific lorry by ID and owner
   * Used for authorization checks
   */
  async getLorryByIdAndOwner(
    lorryId: string,
    ownerId: string,
  ): Promise<Lorry | null> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const getCommand = new GetCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `LORRY_OWNER#${ownerId}`,
        SK: `LORRY#${lorryId}`,
      },
    });

    const result = await dynamodbClient.send(getCommand);

    if (!result.Item) {
      return null;
    }

    return this.mapItemToLorry(result.Item);
  }

  /**
   * Get a specific lorry by ID (for any owner)
   * Used by admin and for trip validation
   * Note: This requires scanning or maintaining a separate index
   * For now, we'll require the ownerId to be passed
   */
  async getLorryById(lorryId: string, ownerId: string): Promise<Lorry> {
    const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);

    if (!lorry) {
      throw new NotFoundException(`Lorry with ID ${lorryId} not found`);
    }

    return lorry;
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

    // Verify lorry exists and user has permission
    const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);
    if (!lorry) {
      throw new NotFoundException(`Lorry with ID ${lorryId} not found`);
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
    const documentMetadata: DocumentMetadata = {
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
        PK: `LORRY#${lorryId}`,
        SK: `DOCUMENT#${documentId}`,
        lorryId,
        ownerId,
        s3Key,
        ...documentMetadata,
      },
    });

    await dynamodbClient.send(putCommand);

    // Update lorry's verificationDocuments array
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
        PK: `LORRY#${lorryId}`,
        SK: `DOCUMENT#${documentId}`,
      },
    });

    const result = await dynamodbClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(
        `Document with ID ${documentId} not found for lorry ${lorryId}`,
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
   * Get all documents for a lorry
   * Requirements: 15.4
   */
  async getDocuments(
    lorryId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<DocumentMetadata[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Get document metadata
    const queryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `LORRY#${lorryId}`,
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
   * Add document metadata to lorry's verificationDocuments array
   */
  private async addDocumentToLorry(
    lorryId: string,
    ownerId: string,
    documentMetadata: DocumentMetadata,
  ): Promise<void> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    const updateCommand = new UpdateCommand({
      TableName: this.lorriesTableName,
      Key: {
        PK: `LORRY_OWNER#${ownerId}`,
        SK: `LORRY#${lorryId}`,
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
   */
  private mapItemToLorry(item: any): Lorry {
    return {
      lorryId: item.lorryId,
      ownerId: item.ownerId,
      make: item.make,
      model: item.model,
      year: item.year,
      verificationStatus: item.verificationStatus,
      verificationDocuments: item.verificationDocuments || [],
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
