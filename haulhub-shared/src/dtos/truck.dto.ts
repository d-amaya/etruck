import { IsNotEmpty, IsString, IsNumber, Min, Max, IsBoolean, IsOptional } from 'class-validator';

export class CreateTruckDto {
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

  @IsOptional()
  @IsNumber()
  fuelGasAvgGallxMil?: number;

  @IsOptional()
  @IsNumber()
  fuelGasAvgCost?: number;
}

export class UpdateTruckDto {
  @IsString() @IsOptional() plate?: string;
  @IsString() @IsOptional() brand?: string;

  @IsNumber()
  @Min(1900, { message: 'Year must be 1900 or later' })
  @Max(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
  @IsOptional()
  year?: number;

  @IsString() @IsOptional() vin?: string;
  @IsString() @IsOptional() color?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() notes?: string;
  @IsNumber() @IsOptional() fuelGasAvgGallxMil?: number;
  @IsNumber() @IsOptional() fuelGasAvgCost?: number;
}

export class UpdateTruckStatusDto {
  @IsBoolean()
  @IsNotEmpty({ message: 'Active status is required' })
  isActive!: boolean;
}
