import { UserRole } from '../enums/user-role.enum';

export class RegisterDto {
  email!: string;
  password!: string;
  fullName!: string;
  phoneNumber?: string;
  role!: UserRole;
  driverLicenseNumber?: string; // Required for Driver role
}

export class LoginDto {
  email!: string;
  password!: string;
}

export class RefreshTokenDto {
  refreshToken!: string;
}

export class AuthResponse {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
  userId!: string;
  role!: UserRole;
  email!: string;
  fullName!: string;
  carrierId?: string;
  nationalId?: string;
}
