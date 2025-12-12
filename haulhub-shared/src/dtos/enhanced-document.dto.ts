import { DocumentCategory } from '../enums/document-category.enum';
import { EntityType } from '../enums/entity-type.enum';

export interface CreateDocumentFolderDto {
  name: string;
  entityType: EntityType;
  entityId: string;
  parentFolderId?: string;
}

export interface UpdateDocumentFolderDto {
  name?: string;
  parentFolderId?: string;
}

export interface UploadEnhancedDocumentDto {
  fileName: string;
  fileSize: number;
  contentType: string;
  folder: string;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  description?: string;
  tags?: string[];
}

export interface UpdateDocumentMetadataDto {
  folder?: string;
  category?: DocumentCategory;
  description?: string;
  tags?: string[];
}

export interface DocumentSearchDto {
  entityType?: EntityType;
  entityId?: string;
  category?: DocumentCategory;
  folder?: string;
  searchTerm?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface BatchDocumentUploadDto {
  documents: UploadEnhancedDocumentDto[];
  createFolders?: boolean;
}

export interface DocumentMoveDto {
  documentIds: string[];
  targetFolder: string;
}

export interface FolderContentsDto {
  folderId: string;
  includeSubfolders?: boolean;
}