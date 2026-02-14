import { Trip } from '../interfaces/trip.interface';

/**
 * Trip Financial Calculations Utility
 * 
 * Centralizes all trip-related financial calculations to ensure consistency
 * across the application.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate driver payment: rate ($/mile) × total miles
 */
export function calculateDriverPayment(driverRate: number, mileageTotal: number): number {
  return round2(driverRate * mileageTotal);
}

/**
 * Calculate percentage-based payment: rate (%) × broker payment
 * Used for Dispatcher and Truck Owner
 */
export function calculatePercentagePayment(ratePercent: number, brokerPayment: number): number {
  return round2((ratePercent / 100) * brokerPayment);
}

/**
 * Calculates the total expenses for a trip including all cost components
 */
export function calculateTripExpenses(trip: Trip): number {
  let totalExpenses = 0;

  totalExpenses += trip.driverPayment || 0;
  totalExpenses += trip.truckOwnerPayment || 0;
  totalExpenses += trip.dispatcherPayment || 0;
  totalExpenses += calculateFuelCost(trip);
  totalExpenses += trip.lumperValue || 0;
  totalExpenses += trip.detentionValue || 0;

  return round2(totalExpenses);
}

/**
 * Calculates the profit or loss for a trip
 * Profit = Broker Payment - Total Expenses
 */
export function calculateTripProfit(trip: Trip): number {
  const revenue = trip.brokerPayment || 0;
  const expenses = calculateTripExpenses(trip);
  return round2(revenue - expenses);
}

/**
 * Calculates fuel cost: Total Miles × Gallons Per Mile × Cost Per Gallon
 */
export function calculateFuelCost(trip: Trip): number {
  if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil && (trip.mileageTotal || trip.mileageOrder)) {
    const totalMiles = trip.mileageTotal || trip.mileageOrder || 0;
    return round2(totalMiles * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost);
  }
  return trip.fuelCost || 0;
}

/**
 * Checks if a trip has fuel cost data
 */
export function hasFuelData(trip: Trip): boolean {
  if (trip.fuelCost && trip.fuelCost > 0) return true;
  return !!(trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil && (trip.mileageTotal || trip.mileageOrder));
}
