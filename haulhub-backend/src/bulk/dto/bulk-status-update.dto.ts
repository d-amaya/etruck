import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TripStatus } from '@haulhub/shared';

export class BulkStatusUpdateDto {
  @IsArray()
  @IsNotEmpty()
  tripIds: string[];

  @IsEnum(TripStatus)
  @IsNotEmpty()
  status: TripStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
