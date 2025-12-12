import { IsOptional, IsString, IsArray, IsEnum, IsBoolean, IsDateString, IsObject } from 'class-validator';

export class BulkUpdateDocumentDto {
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
  @IsEnum(['draft', 'active', 'archived', 'deleted'])
  status?: 'draft' | 'active' | 'archived' | 'deleted';

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

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
  updatedBy: string;
}