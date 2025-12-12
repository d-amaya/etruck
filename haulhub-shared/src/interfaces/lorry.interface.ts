import { LorryVerificationStatus } from '../enums/lorry-verification-status.enum';

export interface LorryDocumentMetadata {
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
  verificationDocuments: LorryDocumentMetadata[];
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
