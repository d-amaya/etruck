import { IsString, IsNotEmpty, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class CreateBrokerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  brokerName!: string;
}

export class UpdateBrokerDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  brokerName?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
