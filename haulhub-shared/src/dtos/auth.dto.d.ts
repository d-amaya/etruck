import { UserRole } from '../enums/user-role.enum';
export declare class RegisterDto {
    email: string;
    password: string;
    fullName: string;
    phoneNumber?: string;
    role: UserRole;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class AuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
    role: UserRole;
    email: string;
    fullName: string;
}
