import { User } from './user.interface';
import { CDLClass } from '../enums/cdl-class.enum';

/**
 * Enhanced Driver Profile Interface
 * Extends the base User interface with comprehensive driver information
 * including CDL details, banking information, and corporate details
 */
export interface EnhancedDriver extends User {
  // CDL Information
  cdlClass?: CDLClass;
  cdlIssued?: string; // ISO date string
  cdlExpires?: string; // ISO date string
  cdlState?: string; // US state abbreviation (e.g., 'FL', 'CA')
  
  // Corporate Information
  corpName?: string;
  ein?: string; // Employer Identification Number
  
  // Personal Information (encrypted at rest)
  dob?: string; // Date of birth - ISO date string (encrypted)
  ssn?: string; // Social Security Number (encrypted)
  
  // Banking Information (encrypted at rest)
  bankName?: string;
  bankAccountNumber?: string; // (encrypted)
  
  // Rate Information
  perMileRate?: number; // Rate per mile in dollars
  
  // Status
  isActive: boolean;
  notes?: string;
}

/**
 * Enhanced Dispatcher Profile Interface
 * Extends the base User interface with dispatcher-specific business information
 */
export interface EnhancedDispatcher extends User {
  // Corporate Information
  corpName?: string;
  ein?: string; // Employer Identification Number
  
  // Business Address
  businessAddress?: string;
  businessCity?: string;
  businessState?: string;
  businessZip?: string;
  
  // Personal Information (encrypted at rest)
  ssn?: string; // Social Security Number (encrypted)
  
  // Rate Information
  defaultRate?: number; // Default rate for trips
  
  // Status
  isActive: boolean;
  notes?: string;
}

/**
 * Encrypted Field Wrapper
 * Used to identify fields that need encryption/decryption
 */
export interface EncryptedField {
  encrypted: string;
  keyId?: string; // KMS key ID used for encryption
}

/**
 * CDL Validation Interface
 * Used for validating CDL information
 */
export interface CDLValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Banking Information Validation Interface
 * Used for validating banking information
 */
export interface BankingValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}