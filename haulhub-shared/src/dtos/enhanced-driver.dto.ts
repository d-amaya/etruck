import { CDLClass } from '../enums/cdl-class.enum';

/**
 * DTO for updating enhanced driver profile
 */
export interface UpdateEnhancedDriverDto {
  // CDL Information
  cdlClass?: CDLClass;
  cdlIssued?: string; // ISO date string
  cdlExpires?: string; // ISO date string
  cdlState?: string; // US state abbreviation
  
  // Corporate Information
  corpName?: string;
  ein?: string;
  
  // Personal Information (will be encrypted)
  dob?: string; // ISO date string
  ssn?: string;
  
  // Banking Information (will be encrypted)
  bankName?: string;
  bankAccountNumber?: string;
  
  // Rate Information
  perMileRate?: number;
  
  // Status
  isActive?: boolean;
  notes?: string;
}

/**
 * DTO for updating enhanced dispatcher profile
 */
export interface UpdateEnhancedDispatcherDto {
  // Corporate Information
  corpName?: string;
  ein?: string;
  
  // Business Address
  businessAddress?: string;
  businessCity?: string;
  businessState?: string;
  businessZip?: string;
  
  // Personal Information (will be encrypted)
  ssn?: string;
  
  // Rate Information
  defaultRate?: number;
  
  // Status
  isActive?: boolean;
  notes?: string;
}

/**
 * DTO for CDL validation request
 */
export interface ValidateCDLDto {
  cdlClass: CDLClass;
  cdlIssued: string;
  cdlExpires: string;
  cdlState: string;
}

/**
 * DTO for banking information validation request
 */
export interface ValidateBankingDto {
  bankName: string;
  bankAccountNumber: string;
}

/**
 * DTO for recording driver advance payments
 */
export interface RecordAdvanceDto {
  driverId?: string; // Optional for profile endpoint, required for specific driver endpoint
  tripId?: string; // Optional - advance can be associated with a specific trip
  amount: number; // Advance amount in dollars
  description?: string; // Optional description of the advance
  advanceDate?: string; // ISO date string, defaults to current date
}