import { Document, DocumentFolder, DocumentMetadataKeyValue } from '../interfaces/enhanced-document.interface';

/**
 * Utility functions for document management operations
 */
export class DocumentManagementUtils {
  /**
   * Validates if a file type is allowed
   */
  static isAllowedFileType(mimeType: string, allowedTypes?: string[]): boolean {
    const defaultAllowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    const typesToCheck = allowedTypes || defaultAllowedTypes;
    return typesToCheck.includes(mimeType);
  }

  /**
   * Validates file size against limits
   */
  static isValidFileSize(fileSize: number, maxSizeBytes = 50 * 1024 * 1024): boolean {
    return fileSize > 0 && fileSize <= maxSizeBytes;
  }

  /**
   * Formats file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Gets file extension from filename
   */
  static getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  }

  /**
   * Gets file icon class based on mime type
   */
  static getFileIcon(mimeType: string): string {
    const iconMap: Record<string, string> = {
      'application/pdf': 'file-pdf',
      'image/jpeg': 'file-image',
      'image/png': 'file-image',
      'image/gif': 'file-image',
      'image/webp': 'file-image',
      'text/plain': 'file-text',
      'application/msword': 'file-word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-word',
      'application/vnd.ms-excel': 'file-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'file-excel',
      'application/zip': 'file-archive',
      'application/x-zip-compressed': 'file-archive'
    };
    
    return iconMap[mimeType] || 'file';
  }

  /**
   * Builds folder path from folder hierarchy
   */
  static buildFolderPath(folders: DocumentFolder[], folderId?: string): string {
    if (!folderId) return '/';
    
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return '/';
    
    return folder.path;
  }

  /**
   * Gets folder hierarchy for breadcrumb navigation
   */
  static getFolderBreadcrumbs(folders: DocumentFolder[], folderId?: string): DocumentFolder[] {
    if (!folderId) return [];
    
    const breadcrumbs: DocumentFolder[] = [];
    let currentFolder = folders.find(f => f.id === folderId);
    
    while (currentFolder) {
      breadcrumbs.unshift(currentFolder);
      currentFolder = currentFolder.parentId 
        ? folders.find(f => f.id === currentFolder!.parentId)
        : undefined;
    }
    
    return breadcrumbs;
  }

  /**
   * Validates document metadata value based on type
   */
  static validateMetadataValue(value: string, type: DocumentMetadataKeyValue['type']): boolean {
    switch (type) {
      case 'text':
        return typeof value === 'string' && value.length > 0;
      case 'number':
        return !isNaN(Number(value));
      case 'date':
        return !isNaN(Date.parse(value));
      case 'boolean':
        return value === 'true' || value === 'false';
      case 'json':
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Converts metadata value to appropriate type
   */
  static convertMetadataValue(value: string, type: DocumentMetadataKeyValue['type']): any {
    switch (type) {
      case 'text':
        return value;
      case 'number':
        return Number(value);
      case 'date':
        return new Date(value);
      case 'boolean':
        return value === 'true';
      case 'json':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  /**
   * Generates a unique filename to avoid conflicts
   */
  static generateUniqueFilename(originalName: string, existingNames: string[]): string {
    if (!existingNames.includes(originalName)) {
      return originalName;
    }
    
    const extension = this.getFileExtension(originalName);
    const baseName = originalName.replace(`.${extension}`, '');
    
    let counter = 1;
    let newName = `${baseName} (${counter}).${extension}`;
    
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName} (${counter}).${extension}`;
    }
    
    return newName;
  }

  /**
   * Filters documents based on search criteria
   */
  static filterDocuments(documents: Document[], searchText: string): Document[] {
    if (!searchText.trim()) return documents;
    
    const searchLower = searchText.toLowerCase();
    
    return documents.filter(doc => 
      doc.name.toLowerCase().includes(searchLower) ||
      doc.description?.toLowerCase().includes(searchLower) ||
      doc.fileName.toLowerCase().includes(searchLower) ||
      doc.tags.some((tag: string) => tag.toLowerCase().includes(searchLower)) ||
      doc.searchableContent?.toLowerCase().includes(searchLower) ||
      doc.ocrText?.toLowerCase().includes(searchLower)
    );
  }

  /**
   * Sorts documents by specified criteria
   */
  static sortDocuments(
    documents: Document[], 
    sortBy: 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'mimeType',
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Document[] {
    return [...documents].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'fileSize':
          comparison = a.fileSize - b.fileSize;
          break;
        case 'mimeType':
          comparison = a.mimeType.localeCompare(b.mimeType);
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Groups documents by category
   */
  static groupDocumentsByCategory(documents: Document[]): Record<string, Document[]> {
    return documents.reduce((groups, doc) => {
      const categoryId = doc.categoryId || 'uncategorized';
      if (!groups[categoryId]) {
        groups[categoryId] = [];
      }
      groups[categoryId].push(doc);
      return groups;
    }, {} as Record<string, Document[]>);
  }

  /**
   * Calculates document statistics
   */
  static calculateDocumentStats(documents: Document[]): {
    totalCount: number;
    totalSize: number;
    averageSize: number;
    typeDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
  } {
    const totalCount = documents.length;
    const totalSize = documents.reduce((sum, doc) => sum + doc.fileSize, 0);
    const averageSize = totalCount > 0 ? totalSize / totalCount : 0;
    
    const typeDistribution = documents.reduce((dist, doc) => {
      dist[doc.mimeType] = (dist[doc.mimeType] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);
    
    const statusDistribution = documents.reduce((dist, doc) => {
      dist[doc.status] = (dist[doc.status] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);
    
    return {
      totalCount,
      totalSize,
      averageSize,
      typeDistribution,
      statusDistribution
    };
  }

  /**
   * Validates document permissions for a user
   */
  static hasPermission(
    document: Document, 
    userId: string, 
    permission: 'view' | 'edit' | 'delete' | 'share'
  ): boolean {
    const permissions = document.permissions;
    
    // Check if document is public and permission is view
    if (permissions.isPublic && permission === 'view') {
      return true;
    }
    
    // Check specific permission arrays
    switch (permission) {
      case 'view':
        return permissions.canView.includes(userId);
      case 'edit':
        return permissions.canEdit.includes(userId);
      case 'delete':
        return permissions.canDelete.includes(userId);
      case 'share':
        return permissions.canShare.includes(userId);
      default:
        return false;
    }
  }

  /**
   * Generates document checksum (placeholder - would use crypto in real implementation)
   */
  static async generateChecksum(file: { name: string; size: number; lastModified?: number }): Promise<string> {
    // In a real implementation, this would use crypto.subtle.digest
    // For now, return a simple hash based on file properties
    const content = `${file.name}_${file.size}_${file.lastModified || Date.now()}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}