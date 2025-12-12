import { VehicleVerificationStatus } from '../enums/vehicle-verification-status.enum';

export interface TrailerDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

export interface Trailer {
  trailerId: string;
  ownerId: string;
  name: string;
  vin: string;
  year: number;
  brand: string;
  color: string;
  licensePlate: string;
  verificationStatus: VehicleVerificationStatus;
  verificationDocuments: TrailerDocumentMetadata[];
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}