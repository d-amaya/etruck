import { VehicleVerificationStatus } from '../enums/vehicle-verification-status.enum';

export interface TruckDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

/**
 * Truck interface for eTrucky schema
 * Stored in eTrucky-Trucks table
 */
export interface Truck {
  truckId: string;
  carrierId: string;
  truckOwnerId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  isActive: boolean;
  verificationStatus?: VehicleVerificationStatus;
  verificationDocuments?: TruckDocumentMetadata[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Legacy truck interface (for backward compatibility)
 */
export interface LegacyTruck {
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