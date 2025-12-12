import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { EntityType } from './create-note.dto';

export class SearchNotesDto {
  @IsString()
  @IsOptional()
  searchTerm?: string;

  @IsEnum(EntityType)
  @IsOptional()
  entityType?: EntityType;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  entityIds?: string[];
}
