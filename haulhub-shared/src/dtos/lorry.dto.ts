import { IsNotEmpty, IsString, IsNumber, Min, Max } from 'class-validator';

export class RegisterLorryDto {
  @IsString()
  @IsNotEmpty({ message: 'Lorry ID (license plate) is required' })
  lorryId!: string; // license plate

  @IsString()
  @IsNotEmpty({ message: 'Make is required' })
  make!: string;

  @IsString()
  @IsNotEmpty({ message: 'Model is required' })
  model!: string;

  @IsNumber()
  @Min(1900, { message: 'Year must be 1900 or later' })
  @Max(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
  year!: number;
}

export class UpdateLorryDto {
  make?: string;
  model?: string;
  year?: number;
}

export class VerifyLorryDto {
  decision!: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
  reason?: string;
}

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'File name is required' })
  fileName!: string;

  @IsNumber()
  @Min(1, { message: 'File size must be greater than 0' })
  @Max(10 * 1024 * 1024, { message: 'File size must not exceed 10MB' })
  fileSize!: number;

  @IsString()
  @IsNotEmpty({ message: 'Content type is required' })
  contentType!: string;
}

export class PresignedUrlResponse {
  uploadUrl!: string;
  documentId!: string;
  expiresIn!: number;
}
