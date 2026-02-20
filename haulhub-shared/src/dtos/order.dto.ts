import { IsOptional, IsString, IsEnum, IsNumber, IsNotEmpty, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../enums/order-status.enum';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  adminId!: string;

  @IsString()
  @IsNotEmpty()
  carrierId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  truckId!: string;

  @IsString()
  @IsNotEmpty()
  trailerId!: string;

  @IsString()
  @IsNotEmpty()
  brokerId!: string;

  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @IsString()
  @IsNotEmpty()
  brokerLoad!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledTimestamp!: string;

  @Type(() => Number)
  @IsNumber()
  orderRate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mileageEmpty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  driverRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelGasAvgCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelGasAvgGallxMil?: number;

  // Pickup location
  @IsOptional() @IsString() pickupCompany?: string;
  @IsOptional() @IsString() pickupPhone?: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsString() pickupCity?: string;
  @IsOptional() @IsString() pickupState?: string;
  @IsOptional() @IsString() pickupZip?: string;
  @IsOptional() @IsString() pickupNotes?: string;

  // Delivery location
  @IsOptional() @IsString() deliveryCompany?: string;
  @IsOptional() @IsString() deliveryPhone?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() deliveryCity?: string;
  @IsOptional() @IsString() deliveryState?: string;
  @IsOptional() @IsString() deliveryZip?: string;
  @IsOptional() @IsString() deliveryNotes?: string;

  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lumperValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  detentionValue?: number;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() adminId?: string;
  @IsOptional() @IsString() carrierId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() truckId?: string;
  @IsOptional() @IsString() trailerId?: string;
  @IsOptional() @IsString() brokerId?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() brokerLoad?: string;

  @IsOptional() @IsDateString() scheduledTimestamp?: string;

  @IsOptional() @Type(() => Number) @IsNumber() orderRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() adminRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() dispatcherRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() driverRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mileageOrder?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mileageEmpty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() fuelGasAvgCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() fuelGasAvgGallxMil?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lumperValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() detentionValue?: number;

  // Pickup location
  @IsOptional() @IsString() pickupCompany?: string;
  @IsOptional() @IsString() pickupPhone?: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsString() pickupCity?: string;
  @IsOptional() @IsString() pickupState?: string;
  @IsOptional() @IsString() pickupZip?: string;
  @IsOptional() @IsString() pickupNotes?: string;

  // Delivery location
  @IsOptional() @IsString() deliveryCompany?: string;
  @IsOptional() @IsString() deliveryPhone?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() deliveryCity?: string;
  @IsOptional() @IsString() deliveryState?: string;
  @IsOptional() @IsString() deliveryZip?: string;
  @IsOptional() @IsString() deliveryNotes?: string;

  @IsOptional() @IsString() notes?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  orderStatus!: OrderStatus;

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() deliveryTimestamp?: string;
}

export class OrderFilters {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() brokerId?: string;
  @IsOptional() @IsString() dispatcherId?: string;
  @IsOptional() @IsString() carrierId?: string;
  @IsOptional() @IsString() adminId?: string;
  @IsOptional() @IsString() truckId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsEnum(OrderStatus) orderStatus?: OrderStatus;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number;
  @IsOptional() @IsString() lastEvaluatedKey?: string;
}
