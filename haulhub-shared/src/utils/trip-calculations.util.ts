import { Trip } from '../interfaces/trip.interface';

/**
 * Trip Financial Calculations Utility
 * 
 * Centralizes all trip-related financial calculations to ensure consistency
 * across the application.
 */

/**
 * Calculates the total expenses for a trip including all cost components
 * 
 * @param trip - The trip object containing payment and cost information
 * @returns Total expenses including driver payment, truck owner payment, fuel costs, and additional fees
 */
export function calculateTripExpenses(trip: Trip): number {
  let totalExpenses = 0;

  // Base payments
  totalExpenses += trip.truckOwnerPayment || 0;
  totalExpenses += trip.driverPayment || 0;

  // Fuel costs (calculate if needed)
  totalExpenses += calculateFuelCost(trip);

  // Additional fees
  totalExpenses += trip.lumperValue || 0;
  totalExpenses += trip.detentionValue || 0;

  return totalExpenses;
}

/**
 * Calculates the profit or loss for a trip
 * 
 * Profit = Broker Payment - Total Expenses
 * 
 * @param trip - The trip object containing payment and cost information
 * @returns Profit (positive) or loss (negative) for the trip
 */
export function calculateTripProfit(trip: Trip): number {
  const revenue = trip.brokerPayment || 0;
  const expenses = calculateTripExpenses(trip);
  return revenue - expenses;
}

/**
 * Calculates fuel cost for a trip based on mileage and fuel data
 * 
 * Formula: Total Miles × Gallons Per Mile × Cost Per Gallon
 * Falls back to stored fuelCost if calculation data is not available
 * 
 * @param trip - The trip object containing fuel and mileage information
 * @returns Calculated fuel cost or stored fuelCost value
 */
export function calculateFuelCost(trip: Trip): number {
  // If we have the data to calculate, do the calculation
  if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil && (trip.mileageTotal || trip.mileageOrder)) {
    const totalMiles = trip.mileageTotal || trip.mileageOrder || 0;
    return totalMiles * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost;
  }
  
  // Otherwise return stored value
  return trip.fuelCost || 0;
}

/**
 * Checks if a trip has fuel cost data
 * 
 * @param trip - The trip object to check
 * @returns True if trip has fuel cost data (either stored or calculable)
 */
export function hasFuelData(trip: Trip): boolean {
  // Has stored fuel cost
  if (trip.fuelCost && trip.fuelCost > 0) return true;
  
  // Has data to calculate fuel cost
  return !!(trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil && (trip.mileageTotal || trip.mileageOrder));
}
