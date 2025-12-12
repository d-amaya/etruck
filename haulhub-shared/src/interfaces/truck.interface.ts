import { VehicleVerificationStatus } from '../enums/vehicle-verification-status.enum';

export interface TruckDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

export interface Truck {
  truckId: string;
  ownerId: string;
  name: string;
  vin: string;
  year: number;
  brand: string;
  color: string;
  licensePlate: string;
  verificationStatus: VehicleVerificationStatus;
  verificationDocuments: TruckDocumentMetadata[];
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}