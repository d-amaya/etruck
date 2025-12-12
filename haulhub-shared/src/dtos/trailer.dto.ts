import { IsNotEmpty, IsString, IsNumber, Min, Max, IsBoolean, IsOptional } from 'class-validator';

export class RegisterTrailerDto {
  @IsString()
  @IsNotEmpty({ message: 'Trailer name is required' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'VIN is required' })
  vin!: string;

  @IsNumber()
  @Min(1900, { message: 'Year must be 1900 or later' })
  @Max(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
  year!: number;

  @IsString()
  @IsNotEmpty({ message: 'Brand is required' })
  brand!: string;

  @IsString()
  @IsNotEmpty({ message: 'Color is required' })
  color!: string;

  @IsString()
  @IsNotEmpty({ message: 'License plate is required' })
  licensePlate!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTrailerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  vin?: string;

  @IsNumber()
  @Min(1900, { message: 'Year must be 1900 or later' })
  @Max(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  licensePlate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VerifyTrailerDto {
  decision!: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
  reason?: string;
}

export class UpdateTrailerStatusDto {
  @IsBoolean()
  @IsNotEmpty({ message: 'Active status is required' })
  isActive!: boolean;
}