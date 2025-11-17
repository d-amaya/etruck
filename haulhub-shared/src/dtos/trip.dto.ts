import { IsOptional, IsString, IsEnum, IsNumber, IsPositive, IsNotEmpty, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TripStatus } from '../enums/trip-status.enum';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  pickupLocation!: string;

  @IsString()
  @IsNotEmpty()
  dropoffLocation!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledPickupDatetime!: string;

  @IsString()
  @IsNotEmpty()
  brokerId!: string;

  @IsString()
  @IsNotEmpty()
  lorryId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  driverName!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  brokerPayment!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  lorryOwnerPayment!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  driverPayment!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  distance?: number;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @IsOptional()
  @IsDateString()
  scheduledPickupDatetime?: string;

  @IsOptional()
  @IsString()
  brokerId?: string;

  @IsOptional()
  @IsString()
  lorryId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  brokerPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  lorryOwnerPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  driverPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  distance?: number;
}

export class UpdateTripStatusDto {
  @IsEnum(TripStatus)
  @IsNotEmpty()
  status!: TripStatus;
}

export class TripFilters {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  brokerId?: string;

  @IsOptional()
  @IsString()
  lorryId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  lastEvaluatedKey?: string;
}
