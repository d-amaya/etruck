import { IsNotEmpty, IsString, IsNumber, Min, Max, IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * DTO for creating a truck in the carrier management system
 * Requirements: 4.4, 4.5, 4.6, 4.7, 4.8
 */
export class CreateTruckDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Truck owner ID is required' })
  truckOwnerId!: string;

  @IsString()
  @IsNotEmpty({ message: 'License plate is required' })
  plate!: string;

  @IsString()
  @IsNotEmpty({ message: 'Brand is required' })
  brand!: string;

  @IsNumber()
  @Min(1900, { message: 'Year must be 1900 or later' })
  @Max(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
  year!: number;

  @IsString()
  @IsNotEmpty({ message: 'VIN is required' })
  vin!: string;

  @IsString()
  @IsNotEmpty({ message: 'Color is required' })
  color!: string;
}

export class RegisterTruckDto {
  @IsString()
  @IsNotEmpty({ message: 'Truck name is required' })
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

export class UpdateTruckDto {
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

export class VerifyTruckDto {
  decision!: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
  reason?: string;
}

export class UpdateTruckStatusDto {
  @IsBoolean()
  @IsNotEmpty({ message: 'Active status is required' })
  isActive!: boolean;
}