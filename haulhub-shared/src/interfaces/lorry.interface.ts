import { LorryVerificationStatus } from '../enums/lorry-verification-status.enum';

export interface DocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}

export interface Lorry {
  lorryId: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  verificationStatus: LorryVerificationStatus;
  verificationDocuments: DocumentMetadata[];
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
