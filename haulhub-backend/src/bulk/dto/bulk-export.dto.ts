import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
  JSON = 'json',
}

export enum ExportType {
  TRIPS = 'trips',
  PAYMENTS = 'payments',
  ANALYTICS = 'analytics',
  DOCUMENTS = 'documents',
}

export class BulkExportDto {
  @IsEnum(ExportType)
  @IsNotEmpty()
  exportType: ExportType;

  @IsEnum(ExportFormat)
  @IsNotEmpty()
  format: ExportFormat;

  @IsOptional()
  @IsArray()
  tripIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  brokerId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  lorryId?: string;

  @IsOptional()
  @IsArray()
  statuses?: string[];

  @IsOptional()
  @IsArray()
  columns?: string[];
}
