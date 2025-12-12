/**
 * Validates Vehicle Identification Number (VIN)
 * VIN should be 17 characters long and contain only alphanumeric characters (excluding I, O, Q)
 */
export function validateVIN(vin: string): boolean {
  if (!vin || typeof vin !== 'string') {
    return false;
  }

  // VIN should be exactly 17 characters
  if (vin.length !== 17) {
    return false;
  }

  // VIN should not contain I, O, or Q
  const invalidChars = /[IOQ]/i;
  if (invalidChars.test(vin)) {
    return false;
  }

  // VIN should only contain alphanumeric characters
  const validChars = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return validChars.test(vin);
}

/**
 * Validates US license plate format
 * Accepts various US state license plate formats
 */
export function validateLicensePlate(licensePlate: string): boolean {
  if (!licensePlate || typeof licensePlate !== 'string') {
    return false;
  }

  // Remove spaces and convert to uppercase for validation
  const cleanPlate = licensePlate.replace(/\s/g, '').toUpperCase();

  // License plate should be between 2-8 characters
  if (cleanPlate.length < 2 || cleanPlate.length > 8) {
    return false;
  }

  // Should contain only letters, numbers, and common special characters
  const validFormat = /^[A-Z0-9\-\.]{2,8}$/;
  return validFormat.test(cleanPlate);
}

/**
 * Validates vehicle year
 */
export function validateVehicleYear(year: number): boolean {
  if (!year || typeof year !== 'number') {
    return false;
  }

  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
}

/**
 * Validates vehicle name (should be non-empty string)
 */
export function validateVehicleName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  return name.trim().length > 0 && name.trim().length <= 100;
}