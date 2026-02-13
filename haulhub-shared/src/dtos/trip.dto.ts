import { IsOptional, IsString, IsEnum, IsNumber, IsPositive, IsNotEmpty, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TripStatus } from '../enums/trip-status.enum';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  orderConfirmation!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledTimestamp!: string;

  @IsOptional()
  @IsDateString()
  pickupTimestamp?: string | null;

  @IsOptional()
  @IsDateString()
  deliveryTimestamp?: string | null;

  @IsString()
  @IsNotEmpty()
  brokerId!: string;

  @IsString()
  @IsNotEmpty()
  truckId!: string;

  @IsString()
  @IsNotEmpty()
  trailerId!: string;

  @IsOptional()
  @IsString()
  truckOwnerId?: string;

  @IsString()
  @IsNotEmpty()
  carrierId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  brokerPayment!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  truckOwnerPayment!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  driverPayment!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  mileageOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageEmpty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageTotal?: number;

  // Pickup location details
  @IsOptional()
  @IsString()
  pickupCompany?: string;

  @IsOptional()
  @IsString()
  pickupPhone?: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  pickupCity?: string;

  @IsOptional()
  @IsString()
  pickupState?: string;

  @IsOptional()
  @IsString()
  pickupZip?: string;

  @IsOptional()
  @IsString()
  pickupNotes?: string;

  // Delivery location details
  @IsOptional()
  @IsString()
  deliveryCompany?: string;

  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  deliveryState?: string;

  @IsOptional()
  @IsString()
  deliveryZip?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Legacy fields for backward compatibility
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @Type(() => Number)
  @IsNumber()
  fuelGasAvgCost!: number;

  @Type(() => Number)
  @IsNumber()
  fuelGasAvgGallxMil!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lumperValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  detentionValue?: number;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  orderConfirmation?: string;

  @IsOptional()
  @IsDateString()
  scheduledTimestamp?: string;

  @IsOptional()
  @IsDateString()
  pickupTimestamp?: string | null;

  @IsOptional()
  @IsDateString()
  deliveryTimestamp?: string | null;

  @IsOptional()
  @IsString()
  brokerId?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  orderStatus?: TripStatus;

  @IsOptional()
  @IsString()
  truckId?: string;

  @IsOptional()
  @IsString()
  trailerId?: string;

  @IsOptional()
  @IsString()
  truckOwnerId?: string;

  @IsOptional()
  @IsString()
  carrierId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  brokerPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  truckOwnerPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  driverPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  driverRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  mileageOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageEmpty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageTotal?: number;

  // Pickup location details
  @IsOptional()
  @IsString()
  pickupCompany?: string;

  @IsOptional()
  @IsString()
  pickupPhone?: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  pickupCity?: string;

  @IsOptional()
  @IsString()
  pickupState?: string;

  @IsOptional()
  @IsString()
  pickupZip?: string;

  @IsOptional()
  @IsString()
  pickupNotes?: string;

  // Delivery location details
  @IsOptional()
  @IsString()
  deliveryCompany?: string;

  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  deliveryState?: string;

  @IsOptional()
  @IsString()
  deliveryZip?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Legacy fields for backward compatibility
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelGasAvgCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelGasAvgGallxMil?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lumperValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  detentionValue?: number;

  // Additional eTrucky fields
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  orderRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  brokerRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  truckOwnerRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dispatcherRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dispatcherPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  factoryRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  orderAverage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  brokerAdvance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  driverAdvance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  factoryAdvance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  brokerCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  factoryCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  orderExpenses?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  orderRevenue?: number;
}

export class UpdateTripStatusDto {
  @IsEnum(TripStatus)
  @IsNotEmpty()
  orderStatus!: TripStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  deliveryTimestamp?: string;
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
  dispatcherId?: string;

  @IsOptional()
  @IsString()
  truckId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  orderStatus?: TripStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  lastEvaluatedKey?: string;
}
