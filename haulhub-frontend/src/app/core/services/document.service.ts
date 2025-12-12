import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface DocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  folder: string;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  uploadedBy: string;
  uploadedAt: string;
  s3Key: string;
  tags?: Record<string, string>;
}

export interface DocumentFolder {
  folderId: string;
  name: string;
  entityType: EntityType;
  entityId: string;
  parentFolderId?: string;
  createdAt: string;
}

export enum DocumentCategory {
  Registration = 'Registration',
  Insurance = 'Insurance',
  Inspection = 'Inspection',
  CDL = 'CDL',
  Invoice = 'Invoice',
  Receipt = 'Receipt',
  Other = 'Other'
}

export enum EntityType {
  Driver = 'Driver',
  Truck = 'Truck',
  Trailer = 'Trailer',
  Trip = 'Trip',
  User = 'User'
}

export interface UploadDocumentRequest {
  file: File;
  folder: string;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  tags?: Record<string, string>;
}

export interface DocumentSearchFilters {
  entityType?: EntityType;
  entityId?: string;
  folder?: string;
  category?: DocumentCategory;
  fileName?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private apiUrl = `${environment.apiUrl}/documents`;
  private documentsSubject = new BehaviorSubject<DocumentMetadata[]>([]);
  public documents$ = this.documentsSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Upload a single document
   */
  uploadDocument(request: UploadDocumentRequest): Observable<DocumentMetadata> {
    const formData = new FormData();
    formData.append('file', request.file);
    formData.append('folder', request.folder);
    formData.append('category', request.category);
    formData.append('entityType', request.entityType);
    formData.append('entityId', request.entityId);
    
    if (request.tags) {
      formData.append('tags', JSON.stringify(request.tags));
    }

    return this.http.post<DocumentMetadata>(`${this.apiUrl}/upload`, formData).pipe(
      tap(doc => this.addDocumentToCache(doc))
    );
  }

  /**
   * Upload multiple documents in batch
   */
  uploadMultipleDocuments(requests: UploadDocumentRequest[]): Observable<DocumentMetadata[]> {
    const formData = new FormData();
    
    requests.forEach((request, index) => {
      formData.append(`files`, request.file);
      formData.append(`metadata[${index}]`, JSON.stringify({
        folder: request.folder,
        category: request.category,
        entityType: request.entityType,
        entityId: request.entityId,
        tags: request.tags
      }));
    });

    return this.http.post<DocumentMetadata[]>(`${this.apiUrl}/upload-batch`, formData).pipe(
      tap(docs => docs.forEach(doc => this.addDocumentToCache(doc)))
    );
  }

  /**
   * Get documents for a specific entity
   */
  getDocumentsByEntity(entityType: EntityType, entityId: string): Observable<DocumentMetadata[]> {
    return this.http.get<DocumentMetadata[]>(`${this.apiUrl}/entity/${entityType}/${entityId}`).pipe(
      tap(docs => this.documentsSubject.next(docs))
    );
  }

  /**
   * Search documents with filters
   */
  searchDocuments(filters: DocumentSearchFilters): Observable<DocumentMetadata[]> {
    return this.http.post<DocumentMetadata[]>(`${this.apiUrl}/search`, filters).pipe(
      tap(docs => this.documentsSubject.next(docs))
    );
  }

  /**
   * Get presigned URL for document download
   */
  getDocumentDownloadUrl(documentId: string): Observable<{ url: string; expiresAt: string }> {
    return this.http.get<{ url: string; expiresAt: string }>(`${this.apiUrl}/${documentId}/download-url`);
  }

  /**
   * Delete a document
   */
  deleteDocument(documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${documentId}`).pipe(
      tap(() => this.removeDocumentFromCache(documentId))
    );
  }

  /**
   * Create a folder
   */
  createFolder(folder: Omit<DocumentFolder, 'folderId' | 'createdAt'>): Observable<DocumentFolder> {
    return this.http.post<DocumentFolder>(`${this.apiUrl}/folders`, folder);
  }

  /**
   * Get folders for an entity
   */
  getFoldersByEntity(entityType: EntityType, entityId: string): Observable<DocumentFolder[]> {
    return this.http.get<DocumentFolder[]>(`${this.apiUrl}/folders/entity/${entityType}/${entityId}`);
  }

  /**
   * Update document metadata
   */
  updateDocumentMetadata(documentId: string, updates: Partial<DocumentMetadata>): Observable<DocumentMetadata> {
    return this.http.patch<DocumentMetadata>(`${this.apiUrl}/${documentId}`, updates).pipe(
      tap(doc => this.updateDocumentInCache(doc))
    );
  }

  /**
   * Move document to different folder
   */
  moveDocument(documentId: string, newFolder: string): Observable<DocumentMetadata> {
    return this.http.patch<DocumentMetadata>(`${this.apiUrl}/${documentId}/move`, { folder: newFolder }).pipe(
      tap(doc => this.updateDocumentInCache(doc))
    );
  }

  // Cache management methods
  private addDocumentToCache(doc: DocumentMetadata): void {
    const current = this.documentsSubject.value;
    this.documentsSubject.next([...current, doc]);
  }

  private removeDocumentFromCache(documentId: string): void {
    const current = this.documentsSubject.value;
    this.documentsSubject.next(current.filter(d => d.documentId !== documentId));
  }

  private updateDocumentInCache(doc: DocumentMetadata): void {
    const current = this.documentsSubject.value;
    const index = current.findIndex(d => d.documentId === doc.documentId);
    if (index !== -1) {
      current[index] = doc;
      this.documentsSubject.next([...current]);
    }
  }

  /**
   * Clear the document cache
   */
  clearCache(): void {
    this.documentsSubject.next([]);
  }
}
