import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsEnum, IsObject, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDocumentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  fileName: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  mimeType: string;

  @IsString()
  storageUrl: string;

  @IsString()
  checksum: string;

  @IsEnum(['customer', 'vendor', 'driver', 'vehicle', 'load'])
  entityType: 'customer' | 'vendor' | 'driver' | 'vehicle' | 'load';

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

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived', 'deleted'])
  status?: 'draft' | 'active' | 'archived' | 'deleted';

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsString()
  createdBy: string;

  @IsString()
  updatedBy: string;

  @IsOptional()
  @IsString()
  searchableContent?: string;

  @IsOptional()
  @IsString()
  ocrText?: string;
}