import { IsArray, IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class BulkPaymentProcessDto {
  @IsArray()
  @IsNotEmpty()
  tripIds: string[];

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
