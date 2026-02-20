export interface TruckDocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

export interface Truck {
  truckId: string;
  carrierId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  isActive: boolean;
  fuelGasAvgGallxMil?: number;
  fuelGasAvgCost?: number;
  documents?: TruckDocumentMetadata[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  lastModifiedBy?: string;
}
