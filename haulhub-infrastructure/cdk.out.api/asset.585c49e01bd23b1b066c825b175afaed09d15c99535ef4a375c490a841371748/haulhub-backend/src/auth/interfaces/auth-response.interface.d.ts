import { UserRole } from '@haulhub/shared';
export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
    role: UserRole;
    email: string;
    fullName: string;
}
export interface RefreshAuthResponse extends Omit<AuthResponse, 'refreshToken'> {
}
