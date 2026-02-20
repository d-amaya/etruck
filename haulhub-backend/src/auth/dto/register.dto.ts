import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, IsOptional, ValidateIf } from 'class-validator';
import { UserRole } from '@haulhub/shared';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName!: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsEnum(UserRole, { message: 'Invalid role. Must be Dispatcher, Carrier, or Driver' })
  @IsNotEmpty({ message: 'Role is required' })
  role!: UserRole;

  @ValidateIf((o) => o.driverLicenseNumber !== undefined && o.driverLicenseNumber !== null && o.driverLicenseNumber !== '')
  @IsString()
  @MinLength(3, { message: 'Driver license number must be at least 3 characters' })
  driverLicenseNumber?: string;
}
