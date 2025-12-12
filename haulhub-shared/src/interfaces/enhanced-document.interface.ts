import { DocumentCategory } from '../enums/document-category.enum';
import { EntityType } from '../enums/entity-type.enum';

export interface DocumentFolder {
  id: string;
  name: string;
  parentId?: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  entityType: 'customer' | 'vendor' | 'driver' | 'vehicle' | 'load';
  entityId: string;
  permissions: DocumentPermissions;
}

export interface DocumentPermissions {
  canView: string[];
  canEdit: string[];
  canDelete: string[];
  canShare: string[];
  isPublic: boolean;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
  checksum: string;
  uploadedBy: string;
  uploadedAt: Date;
  changeLog?: string;
}

export interface Document {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
  checksum: string;
  
  // Entity association
  entityType: 'customer' | 'vendor' | 'driver' | 'vehicle' | 'load';
  entityId: string;
  
  // Organization
  folderId?: string;
  categoryId?: string;
  tags: string[];
  
  // Versioning
  currentVersion: number;
  versions: DocumentVersion[];
  
  // Metadata
  metadata: DocumentMetadataKeyValue[];
  
  // Permissions and access
  permissions: DocumentPermissions;
  
  // Status and workflow
  status: 'draft' | 'active' | 'archived' | 'deleted';
  isRequired: boolean;
  expiresAt?: Date;
  
  // Audit trail
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  
  // Search and indexing
  searchableContent?: string;
  ocrText?: string;
}

export interface DocumentSearchFilter {
  entityType?: 'customer' | 'vendor' | 'driver' | 'vehicle' | 'load';
  entityId?: string;
  folderId?: string;
  categoryId?: string;
  tags?: string[];
  status?: ('draft' | 'active' | 'archived' | 'deleted')[];
  mimeTypes?: string[];
  dateRange?: {
    field: 'createdAt' | 'updatedAt' | 'expiresAt';
    from?: Date;
    to?: Date;
  };
  metadata?: {
    key: string;
    value: string;
    operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  }[];
  searchText?: string;
}

export interface DocumentSearchResult {
  documents: Document[];
  totalCount: number;
  facets: {
    categories: { id: string; name: string; count: number }[];
    tags: { name: string; count: number }[];
    mimeTypes: { type: string; count: number }[];
    folders: { id: string; name: string; count: number }[];
  };
}

export interface DocumentStats {
  totalDocuments: number;
  totalSize: number;
  documentsByCategory: { categoryId: string; count: number }[];
  documentsByType: { mimeType: string; count: number }[];
  recentActivity: { action: string; documentId: string; timestamp: Date }[];
}

export interface EnhancedDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  folder: string;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  description?: string;
  tags?: string[];
}

// Enhanced document metadata for key-value pairs
export interface DocumentMetadataKeyValue {
  id: string;
  documentId: string;
  key: string;
  value: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'json';
  isSearchable: boolean;
  createdAt: Date;
  updatedAt: Date;
}