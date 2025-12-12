import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;
}
