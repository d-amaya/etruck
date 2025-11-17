export declare class UpdateProfileDto {
    fullName?: string;
    phoneNumber?: string;
}
export declare class VerifyUserDto {
    decision: 'Verified' | 'Rejected';
    reason?: string;
}
