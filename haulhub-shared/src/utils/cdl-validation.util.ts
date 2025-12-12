import { CDLClass } from '../enums/cdl-class.enum';
import { CDLValidation } from '../interfaces/enhanced-driver.interface';

/**
 * US States and their abbreviations for CDL validation
 */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC' // District of Columbia
];

/**
 * Validate CDL information
 */
export function validateCDL(
  cdlClass: CDLClass,
  cdlIssued: string,
  cdlExpires: string,
  cdlState: string
): CDLValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate CDL Class
  if (!Object.values(CDLClass).includes(cdlClass)) {
    errors.push('Invalid CDL class. Must be A, B, or C.');
  }

  // Validate CDL State
  if (!US_STATES.includes(cdlState.toUpperCase())) {
    errors.push('Invalid CDL state. Must be a valid US state abbreviation.');
  }

  // Validate dates
  const issuedDate = new Date(cdlIssued);
  const expiresDate = new Date(cdlExpires);
  const currentDate = new Date();

  if (isNaN(issuedDate.getTime())) {
    errors.push('Invalid CDL issued date format.');
  }

  if (isNaN(expiresDate.getTime())) {
    errors.push('Invalid CDL expiration date format.');
  }

  if (!isNaN(issuedDate.getTime()) && !isNaN(expiresDate.getTime())) {
    // Check if issued date is before expiration date
    if (issuedDate >= expiresDate) {
      errors.push('CDL issued date must be before expiration date.');
    }

    // Check if issued date is not in the future
    if (issuedDate > currentDate) {
      errors.push('CDL issued date cannot be in the future.');
    }

    // Check if CDL is expired
    if (expiresDate < currentDate) {
      errors.push('CDL has expired.');
    }

    // Warning if CDL expires within 90 days
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(currentDate.getDate() + 90);
    if (expiresDate <= ninetyDaysFromNow && expiresDate >= currentDate) {
      warnings.push('CDL expires within 90 days.');
    }

    // Check if CDL is too old (issued more than 20 years ago)
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(currentDate.getFullYear() - 20);
    if (issuedDate < twentyYearsAgo) {
      warnings.push('CDL was issued more than 20 years ago. Please verify accuracy.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check if CDL is expired
 */
export function isCDLExpired(cdlExpires: string): boolean {
  const expiresDate = new Date(cdlExpires);
  const currentDate = new Date();
  return expiresDate < currentDate;
}

/**
 * Check if CDL expires soon (within specified days)
 */
export function isCDLExpiringSoon(cdlExpires: string, daysThreshold: number = 90): boolean {
  const expiresDate = new Date(cdlExpires);
  const currentDate = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(currentDate.getDate() + daysThreshold);
  
  return expiresDate <= thresholdDate && expiresDate >= currentDate;
}

/**
 * Get CDL expiration status
 */
export function getCDLExpirationStatus(cdlExpires: string): 'valid' | 'expiring_soon' | 'expired' {
  if (isCDLExpired(cdlExpires)) {
    return 'expired';
  }
  
  if (isCDLExpiringSoon(cdlExpires)) {
    return 'expiring_soon';
  }
  
  return 'valid';
}