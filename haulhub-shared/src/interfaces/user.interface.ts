import { UserRole } from '../enums/user-role.enum';
import { VerificationStatus } from '../enums/verification-status.enum';

export interface User {
  userId: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  driverLicenseNumber?: string; // Required for Driver role, used to match with trips
  createdAt: string;
  updatedAt: string;
}
