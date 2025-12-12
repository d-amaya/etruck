import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum EntityType {
  DRIVER = 'DRIVER',
  TRUCK = 'TRUCK',
  TRAILER = 'TRAILER',
  TRIP = 'TRIP',
  USER = 'USER',
  DISPATCHER = 'DISPATCHER',
}

export class CreateNoteDto {
  @IsEnum(EntityType)
  @IsNotEmpty()
  entityType: EntityType;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;
}
