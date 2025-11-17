import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Lorry, RegisterLorryDto, PresignedUrlResponse, UploadDocumentDto } from '@haulhub/shared';

@Injectable({
  providedIn: 'root'
})
export class LorryService {
  constructor(private apiService: ApiService) {}

  /**
   * Get all lorries for the current lorry owner
   */
  getLorries(): Observable<Lorry[]> {
    return this.apiService.get<Lorry[]>('/lorries');
  }

  /**
   * Get a specific lorry by ID
   */
  getLorryById(lorryId: string): Observable<Lorry> {
    return this.apiService.get<Lorry>(`/lorries/${encodeURIComponent(lorryId)}`);
  }

  /**
   * Register a new lorry
   */
  registerLorry(lorryData: RegisterLorryDto): Observable<Lorry> {
    return this.apiService.post<Lorry>('/lorries', lorryData);
  }

  /**
   * Request a presigned URL for document upload
   */
  requestDocumentUploadUrl(lorryId: string, documentData: UploadDocumentDto): Observable<PresignedUrlResponse> {
    return this.apiService.post<PresignedUrlResponse>(
      `/lorries/${encodeURIComponent(lorryId)}/documents`,
      documentData
    );
  }

  /**
   * Upload document directly to S3 using presigned URL
   */
  uploadDocumentToS3(presignedUrl: string, file: File): Observable<any> {
    return new Observable(observer => {
      fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      })
        .then(response => {
          if (response.ok) {
            observer.next(response);
            observer.complete();
          } else {
            observer.error(new Error(`Upload failed with status ${response.status}`));
          }
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Get presigned URL to view a document
   */
  getDocumentViewUrl(lorryId: string, documentId: string): Observable<{ viewUrl: string }> {
    return this.apiService.get<{ viewUrl: string }>(
      `/lorries/${encodeURIComponent(lorryId)}/documents/${documentId}`
    );
  }
}
