import { UserRole } from '../enums/user-role.enum';
import { AccountStatus } from '../enums/account-status.enum';

export interface User {
  userId: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  accountStatus: AccountStatus;
  carrierId?: string;
  driverLicenseNumber?: string;
  rate?: number;
  subscribedCarrierIds?: string[];
  subscribedAdminIds?: string[];
  isActive?: boolean;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastModifiedBy?: string;
}
