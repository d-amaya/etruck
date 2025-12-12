import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { 
  Document, 
  DocumentSearchFilter, 
  DocumentSearchResult,
  DocumentStats,
  DocumentFolder
} from '@haulhub/shared';
import { CreateDocumentDto, UpdateDocumentDto, BulkUpdateDocumentDto, BatchUploadDocumentDto, BatchUploadResult } from './dto';
import { FileStorageService } from './file-storage.service';
import { DocumentFoldersService } from './document-folders.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private fileStorage: FileStorageService,
    private foldersService: DocumentFoldersService,
  ) {}

  async create(createDocumentDto: CreateDocumentDto, file?: Express.Multer.File): Promise<Document> {
    // Validate file if provided
    if (file) {
      this.validateFile(file);
    }

    // Upload file to S3 storage if provided
    let storageUrl = createDocumentDto.storageUrl;
    
    if (file) {
      storageUrl = await this.fileStorage.uploadFile(
        file, 
        createDocumentDto.entityType, 
        createDocumentDto.entityId,
        createDocumentDto.folderId
      );
    }

    // Create document record (simplified for S3 integration demo)
    const document: Document = {
      id: uuidv4(),
      name: createDocumentDto.name,
      description: createDocumentDto.description,
      fileName: file?.originalname || createDocumentDto.fileName || 'unknown',
      fileSize: file?.size || createDocumentDto.fileSize || 0,
      mimeType: file?.mimetype || createDocumentDto.mimeType || 'application/octet-stream',
      storageUrl: storageUrl || '',
      checksum: '', // Would be calculated in real implementation
      entityType: createDocumentDto.entityType,
      entityId: createDocumentDto.entityId,
      folderId: createDocumentDto.folderId,
      categoryId: createDocumentDto.categoryId,
      tags: createDocumentDto.tags || [],
      currentVersion: 1,
      versions: [],
      metadata: [],
      permissions: createDocumentDto.permissions || {
        canView: [],
        canEdit: [],
        canDelete: [],
        canShare: [],
        isPublic: false,
      },
      status: 'active',
      isRequired: createDocumentDto.isRequired || false,
      expiresAt: createDocumentDto.expiresAt ? new Date(createDocumentDto.expiresAt) : undefined,
      createdBy: createDocumentDto.createdBy || 'system',
      createdAt: new Date(),
      updatedBy: createDocumentDto.createdBy || 'system',
      updatedAt: new Date(),
      searchableContent: '',
      ocrText: '',
    };

    // In a real implementation, this would be stored in DynamoDB
    // For now, just return the document with S3 integration working
    return document;
  }

  private validateFile(file: Express.Multer.File): void {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
    ];
    
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }
    
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      throw new BadRequestException('File size exceeds 100MB limit');
    }
  }

  async findAll(
    entityType?: string,
    entityId?: string,
    folderId?: string,
    categoryId?: string,
  ): Promise<Document[]> {
    // Simplified implementation for S3 integration demo
    // In real implementation, this would query DynamoDB
    return [];
  }

  async findOne(id: string): Promise<Document> {
    // Simplified implementation for S3 integration demo
    throw new NotFoundException(`Document with ID ${id} not found`);
  }

  async update(id: string, updateDocumentDto: UpdateDocumentDto): Promise<Document> {
    // Simplified implementation for S3 integration demo
    throw new NotFoundException(`Document with ID ${id} not found`);
  }

  async remove(id: string): Promise<void> {
    // Simplified implementation for S3 integration demo
    // In real implementation, this would also delete from S3
    throw new NotFoundException(`Document with ID ${id} not found`);
  }

  async search(filter: DocumentSearchFilter, page = 1, limit = 50): Promise<DocumentSearchResult> {
    // Simplified implementation for S3 integration demo
    return {
      documents: [],
      totalCount: 0,
      facets: {
        categories: [],
        tags: [],
        mimeTypes: [],
        folders: [],
      },
    };
  }

  async bulkUpdate(documentIds: string[], updates: BulkUpdateDocumentDto): Promise<Document[]> {
    // Simplified implementation for S3 integration demo
    return [];
  }

  async bulkDelete(documentIds: string[]): Promise<void> {
    // Simplified implementation for S3 integration demo
    // In real implementation, this would also delete files from S3
  }

  async bulkMove(documentIds: string[], targetFolderId?: string): Promise<Document[]> {
    // Simplified implementation for S3 integration demo
    return [];
  }

  async getStats(entityType?: string, entityId?: string): Promise<DocumentStats> {
    // Simplified implementation for S3 integration demo
    return {
      totalDocuments: 0,
      totalSize: 0,
      documentsByCategory: [],
      documentsByType: [],
      recentActivity: [],
    };
  }

  async updateSearchableContent(id: string, content: string): Promise<void> {
    // Simplified implementation for S3 integration demo
  }

  async updatePermissions(id: string, permissions: any): Promise<Document> {
    // Simplified implementation for S3 integration demo
    throw new NotFoundException(`Document with ID ${id} not found`);
  }

  /**
   * Batch upload multiple documents
   * Implements Requirement 8.2: Support batch upload and individual file management
   */
  async batchUpload(
    batchUploadDto: BatchUploadDocumentDto,
    files: Express.Multer.File[],
  ): Promise<BatchUploadResult> {
    this.logger.log(`Starting batch upload of ${files.length} files for entity ${batchUploadDto.entityType}:${batchUploadDto.entityId}`);

    const result: BatchUploadResult = {
      successful: [],
      failed: [],
      totalFiles: files.length,
      successCount: 0,
      failureCount: 0,
    };

    // Process each file
    for (const file of files) {
      try {
        // Create document DTO for this file
        const createDto: CreateDocumentDto = {
          name: file.originalname,
          description: batchUploadDto.description || `Uploaded file: ${file.originalname}`,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          storageUrl: '', // Will be set by create method
          checksum: '', // Will be calculated
          entityType: batchUploadDto.entityType as any,
          entityId: batchUploadDto.entityId,
          folderId: batchUploadDto.folderId,
          categoryId: batchUploadDto.categoryId,
          tags: batchUploadDto.tags,
          permissions: batchUploadDto.permissions,
          createdBy: batchUploadDto.uploadedBy,
          updatedBy: batchUploadDto.uploadedBy,
        };

        // Upload the document
        const document = await this.create(createDto, file);

        result.successful.push({
          fileName: file.originalname,
          documentId: document.id,
          storageUrl: document.storageUrl,
        });
        result.successCount++;

        this.logger.debug(`Successfully uploaded file: ${file.originalname}`);

      } catch (error) {
        this.logger.error(`Failed to upload file ${file.originalname}: ${error.message}`, error.stack);
        
        result.failed.push({
          fileName: file.originalname,
          error: error.message || 'Unknown error occurred',
        });
        result.failureCount++;
      }
    }

    this.logger.log(`Batch upload completed: ${result.successCount} successful, ${result.failureCount} failed`);

    return result;
  }

  /**
   * Get folders for an entity
   * Implements Requirement 8.1: Organize documents into configurable folder structures
   */
  async getFolders(entityType: string, entityId: string): Promise<DocumentFolder[]> {
    this.logger.debug(`Getting folders for entity ${entityType}:${entityId}`);
    return this.foldersService.findAll(entityType, entityId);
  }

  /**
   * Create a new folder
   * Implements Requirement 8.1: Organize documents into configurable folder structures
   */
  async createFolder(
    name: string,
    entityType: string,
    entityId: string,
    parentId?: string,
    createdBy?: string,
  ): Promise<DocumentFolder> {
    this.logger.log(`Creating folder "${name}" for entity ${entityType}:${entityId}`);

    const createFolderDto = {
      name,
      parentId,
      entityType: entityType as any,
      entityId,
      permissions: {
        canView: [],
        canEdit: [],
        canDelete: [],
        canShare: [],
        isPublic: false,
      },
    };

    return this.foldersService.create(createFolderDto);
  }

  /**
   * Delete a folder
   * Implements Requirement 8.1: Organize documents into configurable folder structures
   */
  async deleteFolder(id: string, moveDocumentsToParent = false): Promise<void> {
    this.logger.log(`Deleting folder ${id}, moveToParent: ${moveDocumentsToParent}`);
    return this.foldersService.remove(id, moveDocumentsToParent);
  }
}