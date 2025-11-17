import { UserRole } from '@haulhub/shared';
export declare class RegisterDto {
    email: string;
    password: string;
    fullName: string;
    phoneNumber?: string;
    role: UserRole;
}
