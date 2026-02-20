export interface TrailerDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

export interface Trailer {
  trailerId: string;
  carrierId: string;
  name: string;
  vin: string;
  year: number;
  brand: string;
  color: string;
  plate: string;
  isActive: boolean;
  documents?: TrailerDocumentMetadata[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  lastModifiedBy?: string;
}
