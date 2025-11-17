export declare class RegisterLorryDto {
    lorryId: string;
    make: string;
    model: string;
    year: number;
}
export declare class UpdateLorryDto {
    make?: string;
    model?: string;
    year?: number;
}
export declare class VerifyLorryDto {
    decision: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
    reason?: string;
}
export declare class UploadDocumentDto {
    fileName: string;
    fileSize: number;
    contentType: string;
}
export declare class PresignedUrlResponse {
    uploadUrl: string;
    documentId: string;
    expiresIn: number;
}
