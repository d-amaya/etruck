import { BankingValidation } from '../interfaces/enhanced-driver.interface';

/**
 * Common US bank names for validation
 */
export const COMMON_US_BANKS = [
  'Bank of America',
  'JPMorgan Chase',
  'Wells Fargo',
  'Citibank',
  'U.S. Bank',
  'PNC Bank',
  'Capital One',
  'TD Bank',
  'Bank of New York Mellon',
  'State Street Corporation',
  'American Express',
  'Ally Bank',
  'USAA',
  'Charles Schwab Bank',
  'Goldman Sachs Bank',
  'HSBC Bank USA',
  'Regions Bank',
  'KeyBank',
  'Fifth Third Bank',
  'Huntington Bank'
];

/**
 * Validate banking information
 */
export function validateBankingInfo(
  bankName: string,
  bankAccountNumber: string
): BankingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate bank name
  if (!bankName || bankName.trim().length === 0) {
    errors.push('Bank name is required.');
  } else if (bankName.trim().length < 2) {
    errors.push('Bank name must be at least 2 characters long.');
  } else if (bankName.trim().length > 100) {
    errors.push('Bank name must be less than 100 characters long.');
  }

  // Validate account number
  if (!bankAccountNumber || bankAccountNumber.trim().length === 0) {
    errors.push('Bank account number is required.');
  } else {
    const cleanAccountNumber = bankAccountNumber.replace(/\D/g, ''); // Remove non-digits
    
    if (cleanAccountNumber.length < 4) {
      errors.push('Bank account number must be at least 4 digits long.');
    } else if (cleanAccountNumber.length > 20) {
      errors.push('Bank account number must be less than 20 digits long.');
    }

    // Check for obviously invalid patterns
    if (cleanAccountNumber === '0000000000' || 
        cleanAccountNumber === '1111111111' || 
        cleanAccountNumber === '1234567890') {
      errors.push('Bank account number appears to be invalid.');
    }

    // Check if all digits are the same
    if (cleanAccountNumber.length > 0 && 
        cleanAccountNumber.split('').every(digit => digit === cleanAccountNumber[0])) {
      warnings.push('Bank account number has all identical digits. Please verify accuracy.');
    }
  }

  // Warning if bank name is not in common list
  if (bankName && !COMMON_US_BANKS.some(bank => 
    bank.toLowerCase().includes(bankName.toLowerCase()) || 
    bankName.toLowerCase().includes(bank.toLowerCase())
  )) {
    warnings.push('Bank name not recognized. Please verify spelling and accuracy.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Format account number for display (mask sensitive digits)
 */
export function formatAccountNumberForDisplay(accountNumber: string): string {
  if (!accountNumber) return '';
  
  const cleanNumber = accountNumber.replace(/\D/g, '');
  
  if (cleanNumber.length <= 4) {
    return '*'.repeat(cleanNumber.length);
  }
  
  // Show last 4 digits, mask the rest
  const lastFour = cleanNumber.slice(-4);
  const maskedPortion = '*'.repeat(cleanNumber.length - 4);
  
  return maskedPortion + lastFour;
}

/**
 * Validate EIN (Employer Identification Number)
 */
export function validateEIN(ein: string): { isValid: boolean; error?: string } {
  if (!ein) {
    return { isValid: false, error: 'EIN is required.' };
  }

  // Remove any formatting (hyphens, spaces)
  const cleanEIN = ein.replace(/[-\s]/g, '');

  // EIN should be exactly 9 digits
  if (!/^\d{9}$/.test(cleanEIN)) {
    return { isValid: false, error: 'EIN must be exactly 9 digits.' };
  }

  // EIN cannot start with certain prefixes
  const firstTwoDigits = cleanEIN.substring(0, 2);
  const invalidPrefixes = ['00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89'];
  
  if (invalidPrefixes.includes(firstTwoDigits)) {
    return { isValid: false, error: 'Invalid EIN format.' };
  }

  return { isValid: true };
}

/**
 * Format EIN for display (XX-XXXXXXX)
 */
export function formatEIN(ein: string): string {
  if (!ein) return '';
  
  const cleanEIN = ein.replace(/\D/g, '');
  
  if (cleanEIN.length !== 9) return ein;
  
  return `${cleanEIN.substring(0, 2)}-${cleanEIN.substring(2)}`;
}