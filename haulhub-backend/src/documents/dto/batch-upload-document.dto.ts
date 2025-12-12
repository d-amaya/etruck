import { IsString, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export class BatchUploadDocumentDto {
  @IsEnum(['customer', 'vendor', 'driver', 'vehicle', 'load', 'trip', 'truck', 'trailer'])
  entityType: 'customer' | 'vendor' | 'driver' | 'vehicle' | 'load' | 'trip' | 'truck' | 'trailer';

  @IsString()
  entityId: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  permissions?: {
    canView: string[];
    canEdit: string[];
    canDelete: string[];
    canShare: string[];
    isPublic: boolean;
  };

  @IsString()
  uploadedBy: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export interface BatchUploadResult {
  successful: Array<{
    fileName: string;
    documentId: string;
    storageUrl: string;
  }>;
  failed: Array<{
    fileName: string;
    error: string;
  }>;
  totalFiles: number;
  successCount: number;
  failureCount: number;
}
