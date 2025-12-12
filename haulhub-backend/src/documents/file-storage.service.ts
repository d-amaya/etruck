import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { AwsService } from '../config/aws.service';
import { 
  PutObjectCommand, 
  DeleteObjectCommand, 
  CopyObjectCommand, 
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export interface FileMetadata {
  originalName: string;
  contentType: string;
  size: number;
  entityType: string;
  entityId: string;
  category?: string;
  uploadedBy: string;
  uploadedAt: string;
  tags?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  etag?: string;
  versionId?: string;
}

export interface PresignedUploadUrl {
  uploadUrl: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly bucketName: string;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor(
    private configService: ConfigService,
    private awsService: AwsService,
  ) {
    this.bucketName = this.configService.s3DocumentsBucketName || 'haulhub-documents-dev';
    if (!this.bucketName) {
      this.logger.warn('S3_DOCUMENTS_BUCKET_NAME not configured, using default: haulhub-documents-dev');
    }
  }

  /**
   * Upload a file to S3 with proper key structure and metadata
   * Returns the S3 URL for backward compatibility with existing documents service
   */
  async uploadFile(
    file: Express.Multer.File | Buffer,
    entityType: string,
    entityId: string,
    folderId?: string,
  ): Promise<string> {
    try {
      // Validate inputs
      this.validateEntityType(entityType);
      this.validateEntityId(entityId);

      const fileBuffer = Buffer.isBuffer(file) ? file : file.buffer;
      const fileName = Buffer.isBuffer(file) ? 'unknown' : file.originalname;
      const contentType = Buffer.isBuffer(file) ? 'application/octet-stream' : file.mimetype;
      const fileSize = Buffer.isBuffer(file) ? fileBuffer.length : file.size;

      // Validate file
      this.validateFile(fileBuffer, contentType, fileSize);

      // Generate S3 key with proper structure
      const key = this.generateS3Key(entityType, entityId, fileName, undefined, folderId);

      // Prepare metadata for S3
      const s3Metadata = this.prepareS3Metadata({
        originalName: fileName,
        contentType,
        size: fileSize,
        entityType,
        entityId,
        uploadedBy: 'system',
        uploadedAt: new Date().toISOString(),
      });

      // Upload to S3 with retry logic
      const result = await this.executeWithRetry(async () => {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          Metadata: s3Metadata,
          ServerSideEncryption: 'AES256',
        });

        const response = await this.awsService.getS3Client().send(command);
        return `https://${this.bucketName}.s3.${this.configService.awsRegion}.amazonaws.com/${key}`;
      });

      this.logger.log(`File uploaded successfully: ${key}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Upload a file to S3 with full metadata and return detailed result
   */
  async uploadFileWithMetadata(
    file: Express.Multer.File | Buffer,
    entityType: string,
    entityId: string,
    metadata: Partial<FileMetadata> = {},
    folderId?: string,
  ): Promise<UploadResult> {
    try {
      // Validate inputs
      this.validateEntityType(entityType);
      this.validateEntityId(entityId);

      const fileBuffer = Buffer.isBuffer(file) ? file : file.buffer;
      const fileName = Buffer.isBuffer(file) ? metadata.originalName || 'unknown' : file.originalname;
      const contentType = Buffer.isBuffer(file) ? metadata.contentType || 'application/octet-stream' : file.mimetype;
      const fileSize = Buffer.isBuffer(file) ? fileBuffer.length : file.size;

      // Validate file
      this.validateFile(fileBuffer, contentType, fileSize);

      // Generate S3 key with proper structure
      const key = this.generateS3Key(entityType, entityId, fileName, metadata.category, folderId);

      // Prepare metadata for S3
      const s3Metadata = this.prepareS3Metadata({
        originalName: fileName,
        contentType,
        size: fileSize,
        entityType,
        entityId,
        uploadedBy: metadata.uploadedBy || 'system',
        uploadedAt: new Date().toISOString(),
        ...metadata,
      });

      // Upload to S3 with retry logic
      const result = await this.executeWithRetry(async () => {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          Metadata: s3Metadata,
          ServerSideEncryption: 'AES256',
        });

        const response = await this.awsService.getS3Client().send(command);
        return {
          key,
          url: `https://${this.bucketName}.s3.${this.configService.awsRegion}.amazonaws.com/${key}`,
          etag: response.ETag,
          versionId: response.VersionId,
        };
      });

      this.logger.log(`File uploaded successfully: ${key}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Upload multiple files in batch
   */
  async uploadMultipleFiles(
    files: Array<{ file: Express.Multer.File | Buffer; metadata: Partial<FileMetadata> }>,
    entityType: string,
    entityId: string,
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map(({ file, metadata }) =>
      this.uploadFileWithMetadata(file, entityType, entityId, metadata)
    );

    try {
      return await Promise.all(uploadPromises);
    } catch (error) {
      this.logger.error(`Batch upload failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Batch upload failed: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for secure file downloads
   */
  async generatePresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      this.validateS3Key(key);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.awsService.getS3Client(), command, {
        expiresIn,
      });

      this.logger.debug(`Generated presigned URL for key: ${key}`);
      return url;

    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for direct browser uploads
   */
  async generatePresignedUploadUrl(
    entityType: string,
    entityId: string,
    fileName: string,
    contentType: string,
    metadata: Partial<FileMetadata> = {},
  ): Promise<PresignedUploadUrl> {
    try {
      this.validateEntityType(entityType);
      this.validateEntityId(entityId);
      this.validateContentType(contentType);

      const key = this.generateS3Key(entityType, entityId, fileName, metadata.category);
      const expiresIn = 900; // 15 minutes for uploads
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const s3Metadata = this.prepareS3Metadata({
        originalName: fileName,
        contentType,
        size: 0, // Will be set during upload
        entityType,
        entityId,
        uploadedBy: metadata.uploadedBy || 'system',
        uploadedAt: new Date().toISOString(),
        ...metadata,
      });

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        Metadata: s3Metadata,
        ServerSideEncryption: 'AES256',
      });

      const uploadUrl = await getSignedUrl(this.awsService.getS3Client(), command, {
        expiresIn,
      });

      return {
        uploadUrl,
        fields: {
          'Content-Type': contentType,
          'x-amz-server-side-encryption': 'AES256',
        },
        key,
        expiresAt,
      };

    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to generate upload URL: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      this.validateS3Key(key);

      await this.executeWithRetry(async () => {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });

        await this.awsService.getS3Client().send(command);
      });

      this.logger.log(`File deleted successfully: ${key}`);

    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * Copy a file within S3
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<string> {
    try {
      this.validateS3Key(sourceKey);
      this.validateS3Key(destinationKey);

      await this.executeWithRetry(async () => {
        const command = new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${sourceKey}`,
          Key: destinationKey,
          ServerSideEncryption: 'AES256',
        });

        await this.awsService.getS3Client().send(command);
      });

      this.logger.log(`File copied successfully: ${sourceKey} -> ${destinationKey}`);
      return `https://${this.bucketName}.s3.${this.configService.awsRegion}.amazonaws.com/${destinationKey}`;

    } catch (error) {
      this.logger.error(`Failed to copy file: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`File copy failed: ${error.message}`);
    }
  }

  /**
   * List files with a given prefix
   */
  async listFiles(prefix: string): Promise<S3Object[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: 1000,
      });

      const response = await this.awsService.getS3Client().send(command);
      
      return (response.Contents || []).map(obj => ({
        key: obj.Key!,
        size: obj.Size!,
        lastModified: obj.LastModified!,
        etag: obj.ETag!,
      }));

    } catch (error) {
      this.logger.error(`Failed to list files: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      this.validateS3Key(key);

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.awsService.getS3Client().send(command);
      
      return {
        originalName: response.Metadata?.originalname || key.split('/').pop() || 'unknown',
        contentType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || 0,
        entityType: response.Metadata?.entitytype || 'unknown',
        entityId: response.Metadata?.entityid || 'unknown',
        category: response.Metadata?.category,
        uploadedBy: response.Metadata?.uploadedby || 'unknown',
        uploadedAt: response.Metadata?.uploadedat || new Date().toISOString(),
        tags: this.parseMetadataTags(response.Metadata),
      };

    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(key: string, metadata: Partial<FileMetadata>): Promise<void> {
    try {
      // S3 doesn't support updating metadata directly, so we need to copy the object
      const tempKey = `${key}.temp.${Date.now()}`;
      
      // Get current metadata
      const currentMetadata = await this.getFileMetadata(key);
      const updatedMetadata = { ...currentMetadata, ...metadata };
      
      // Copy with new metadata
      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${key}`,
        Key: tempKey,
        Metadata: this.prepareS3Metadata(updatedMetadata),
        MetadataDirective: 'REPLACE',
        ServerSideEncryption: 'AES256',
      });

      await this.awsService.getS3Client().send(command);

      // Delete original and rename temp
      await this.deleteFile(key);
      await this.copyFile(tempKey, key);
      await this.deleteFile(tempKey);

      this.logger.log(`File metadata updated successfully: ${key}`);

    } catch (error) {
      this.logger.error(`Failed to update file metadata: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to update file metadata: ${error.message}`);
    }
  }

  /**
   * Generate S3 key with proper hierarchical structure
   */
  private generateS3Key(
    entityType: string,
    entityId: string,
    fileName: string,
    category?: string,
    folderId?: string,
  ): string {
    const timestamp = Date.now();
    const fileId = uuidv4();
    const sanitizedFileName = this.sanitizeFileName(fileName);
    
    let keyPath = `documents/${entityType.toLowerCase()}/${entityId}`;
    
    if (category) {
      keyPath += `/${category.toLowerCase()}`;
    }
    
    if (folderId) {
      keyPath += `/folders/${folderId}`;
    }
    
    return `${keyPath}/${timestamp}_${fileId}_${sanitizedFileName}`;
  }

  /**
   * Sanitize file name for S3 key
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  /**
   * Prepare metadata for S3 storage
   */
  private prepareS3Metadata(metadata: FileMetadata): Record<string, string> {
    const s3Metadata: Record<string, string> = {};
    
    // S3 metadata keys must be lowercase and contain only letters, numbers, and hyphens
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const s3Key = key.toLowerCase().replace(/[^a-z0-9-]/g, '');
        s3Metadata[s3Key] = String(value);
      }
    });
    
    return s3Metadata;
  }

  /**
   * Parse tags from S3 metadata
   */
  private parseMetadataTags(metadata?: Record<string, string>): Record<string, string> {
    const tags: Record<string, string> = {};
    
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (key.startsWith('tag-')) {
          const tagKey = key.substring(4);
          tags[tagKey] = value;
        }
      });
    }
    
    return tags;
  }

  /**
   * Execute operation with exponential backoff retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.maxRetries) {
          break;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        this.logger.warn(`Operation failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms: ${error.message}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'NetworkingError',
      'TimeoutError',
      'ThrottlingException',
      'ServiceUnavailable',
      'InternalError',
    ];
    
    return retryableErrors.some(errorType => 
      error.name?.includes(errorType) || error.code?.includes(errorType)
    );
  }

  /**
   * Validation methods
   */
  private validateEntityType(entityType: string): void {
    const allowedTypes = ['drivers', 'trucks', 'trailers', 'trips', 'users'];
    if (!allowedTypes.includes(entityType.toLowerCase())) {
      throw new BadRequestException(`Invalid entity type: ${entityType}`);
    }
  }

  private validateEntityId(entityId: string): void {
    if (!entityId || entityId.trim().length === 0) {
      throw new BadRequestException('Entity ID is required');
    }
  }

  private validateS3Key(key: string): void {
    if (!key || key.trim().length === 0) {
      throw new BadRequestException('S3 key is required');
    }
    
    if (key.length > 1024) {
      throw new BadRequestException('S3 key too long (max 1024 characters)');
    }
  }

  private validateFile(buffer: Buffer, contentType: string, size: number): void {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }
    
    if (size > 100 * 1024 * 1024) { // 100MB limit
      throw new BadRequestException('File size exceeds 100MB limit');
    }
    
    this.validateContentType(contentType);
  }

  private validateContentType(contentType: string): void {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
    ];
    
    if (!allowedTypes.includes(contentType)) {
      throw new BadRequestException(`File type not allowed: ${contentType}`);
    }
  }
}