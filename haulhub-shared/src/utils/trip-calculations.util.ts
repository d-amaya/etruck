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
 * @returns Total expenses including driver payment, lorry owner payment, fuel costs, and additional fees
 */
export function calculateTripExpenses(trip: Trip): number {
  let totalExpenses = 0;

  // Base payments
  totalExpenses += trip.lorryOwnerPayment || 0;
  totalExpenses += trip.driverPayment || 0;

  // Fuel costs (calculated from fuel data if available)
  if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
    const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
    const fuelCost = totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost;
    totalExpenses += fuelCost;
  }

  // Additional fees
  totalExpenses += trip.lumperFees || 0;
  totalExpenses += trip.detentionFees || 0;

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
 * @param trip - The trip object containing fuel and mileage information
 * @returns Calculated fuel cost, or 0 if fuel data is incomplete
 */
export function calculateFuelCost(trip: Trip): number {
  if (!trip.fuelAvgCost || !trip.fuelAvgGallonsPerMile) {
    return 0;
  }

  const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
  return totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost;
}

/**
 * Checks if a trip has sufficient fuel data for cost calculation
 * 
 * @param trip - The trip object to check
 * @returns True if trip has fuel cost and gallons per mile data
 */
export function hasFuelData(trip: Trip): boolean {
  return !!(trip.fuelAvgCost && trip.fuelAvgGallonsPerMile);
}
