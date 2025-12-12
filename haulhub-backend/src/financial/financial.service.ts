import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { EnhancedDriverService } from '../users/enhanced-driver.service';
import { Trip, TripStatus, UserRole } from '@haulhub/shared';

export interface MileageBreakdown {
  loadedMiles: number;
  emptyMiles: number;
  totalMiles: number;
  deadheadPercentage: number;
}

export interface FinancialBreakdown {
  grossRevenue: number;
  fuelCosts: number;
  lumperFees: number;
  detentionCharges: number;
  otherExpenses: number;
  totalExpenses: number;
  netRevenue: number;
  profitMargin: number;
}

export interface DriverPaymentCalculation {
  basePay: number;
  mileageBonus: number;
  performanceBonus: number;
  advances: number;
  deductions: number;
  netPay: number;
}

export interface InvoiceStatus {
  invoiceId: string;
  tripId: string;
  amount: number;
  dueDate: Date;
  status: 'pending' | 'paid' | 'overdue' | 'disputed';
  daysOverdue?: number;
}

export interface OutstandingPayments {
  totalOutstanding: number;
  overdueAmount: number;
  currentAmount: number;
  invoices: InvoiceStatus[];
}

@Injectable()
export class FinancialService {
  constructor(
    private readonly tripsService: TripsService,
    private readonly usersService: UsersService,
    private readonly enhancedDriverService: EnhancedDriverService,
  ) {}

  /**
   * Calculate comprehensive mileage breakdown for a trip
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async calculateMileageBreakdown(tripId: string, userId: string, userRole: UserRole): Promise<MileageBreakdown> {
    const trip = await this.tripsService.getTripById(tripId, userId, userRole);

    // For now, we'll use the basic distance field
    // In a full implementation, this would include loaded vs empty miles
    const totalMiles = trip.distance || 0;
    const loadedMiles = totalMiles * 0.8; // Assume 80% loaded miles
    const emptyMiles = totalMiles * 0.2; // Assume 20% empty miles
    const deadheadPercentage = totalMiles > 0 ? (emptyMiles / totalMiles) * 100 : 0;

    return {
      loadedMiles,
      emptyMiles,
      totalMiles,
      deadheadPercentage,
    };
  }

  /**
   * Calculate detailed financial breakdown for a trip
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  async calculateFinancialBreakdown(tripId: string, userId: string, userRole: UserRole): Promise<FinancialBreakdown> {
    const trip = await this.tripsService.getTripById(tripId, userId, userRole);

    const grossRevenue = trip.brokerPayment || 0;
    const fuelCosts = 0; // Fuel cost tracking not yet implemented
    const lumperFees = trip.lumperFees || 0;
    const detentionCharges = trip.detentionFees || 0;
    const otherExpenses = 0; // Other expenses not yet implemented

    const totalExpenses = fuelCosts + lumperFees + detentionCharges + otherExpenses;
    const netRevenue = grossRevenue - totalExpenses;
    const profitMargin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;

    return {
      grossRevenue,
      fuelCosts,
      lumperFees,
      detentionCharges,
      otherExpenses,
      totalExpenses,
      netRevenue,
      profitMargin,
    };
  }

  /**
   * Calculate driver payment with advances and deductions
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */
  async calculateDriverPayment(tripId: string, driverId: string): Promise<DriverPaymentCalculation> {
    const trip = await this.tripsService.getTripById(tripId, driverId, UserRole.Driver);
    const driverProfile = await this.enhancedDriverService.getEnhancedDriverProfile(driverId);
    const advances = await this.enhancedDriverService.getDriverAdvances(driverId);

    const basePay = trip.driverPayment || 0;
    const mileageBonus = this.calculateMileageBonus(trip, driverProfile.perMileRate || 0);
    const performanceBonus = this.calculatePerformanceBonus(trip);
    
    // Calculate total active advances
    const totalAdvances = advances
      .filter(advance => advance.status === 'Active')
      .reduce((sum, advance) => sum + advance.amount, 0);

    const deductions = this.calculateDeductions(trip);
    const netPay = basePay + mileageBonus + performanceBonus - totalAdvances - deductions;

    return {
      basePay,
      mileageBonus,
      performanceBonus,
      advances: totalAdvances,
      deductions,
      netPay,
    };
  }

  /**
   * Get outstanding payments and invoice status
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  async getOutstandingPayments(userId: string, userRole: UserRole): Promise<OutstandingPayments> {
    // Get all trips for the user
    const { trips } = await this.tripsService.getTrips(userId, userRole, {});

    // Filter trips that are delivered but not paid
    const unpaidTrips = trips.filter(trip => 
      trip.status === TripStatus.Delivered && 
      trip.deliveredAt
    );

    const invoices: InvoiceStatus[] = unpaidTrips.map(trip => {
      const dueDate = new Date(trip.deliveredAt!);
      dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms

      const now = new Date();
      const isOverdue = now > dueDate;
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : undefined;

      let status: 'pending' | 'paid' | 'overdue' | 'disputed' = 'pending';
      if (isOverdue) {
        status = 'overdue';
      }

      return {
        invoiceId: `INV-${trip.tripId}`,
        tripId: trip.tripId,
        amount: trip.brokerPayment,
        dueDate,
        status,
        daysOverdue,
      };
    });

    const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const overdueAmount = invoices
      .filter(invoice => invoice.status === 'overdue')
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const currentAmount = totalOutstanding - overdueAmount;

    return {
      totalOutstanding,
      overdueAmount,
      currentAmount,
      invoices,
    };
  }

  /**
   * Calculate fuel efficiency metrics
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async calculateFuelEfficiency(userId: string, userRole: UserRole, startDate?: Date, endDate?: Date): Promise<{
    totalMiles: number;
    totalFuelCost: number;
    averageFuelPrice: number;
    milesPerGallon: number;
    fuelCostPerMile: number;
  }> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    const completedTrips = trips.filter(trip => trip.status === TripStatus.Delivered || trip.status === TripStatus.Paid);
    const totalMiles = completedTrips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
    const totalFuelCost = 0; // Fuel cost tracking not yet implemented

    const averageFuelPrice = 3.50; // Default fuel price per gallon
    const estimatedGallonsUsed = totalFuelCost / averageFuelPrice;
    const milesPerGallon = estimatedGallonsUsed > 0 ? totalMiles / estimatedGallonsUsed : 0;
    const fuelCostPerMile = totalMiles > 0 ? totalFuelCost / totalMiles : 0;

    return {
      totalMiles,
      totalFuelCost,
      averageFuelPrice,
      milesPerGallon,
      fuelCostPerMile,
    };
  }

  /**
   * Generate revenue analysis report
   * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
   */
  async generateRevenueAnalysis(userId: string, userRole: UserRole, startDate?: Date, endDate?: Date): Promise<{
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    revenueByMonth: Array<{
      month: string;
      revenue: number;
      expenses: number;
      profit: number;
    }>;
    topPerformingRoutes: Array<{
      route: string;
      revenue: number;
      tripCount: number;
    }>;
  }> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    const totalRevenue = trips.reduce((sum, trip) => sum + (trip.brokerPayment || 0), 0);
    const totalExpenses = trips.reduce((sum, trip) => 
      sum + (trip.lumperFees || 0) + (trip.detentionFees || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Group by month
    const monthlyData = new Map<string, { revenue: number; expenses: number }>();
    trips.forEach(trip => {
      const date = new Date(trip.scheduledPickupDatetime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { revenue: 0, expenses: 0 });
      }
      
      const data = monthlyData.get(monthKey)!;
      data.revenue += trip.brokerPayment || 0;
      data.expenses += (trip.lumperFees || 0) + (trip.detentionFees || 0);
    });

    const revenueByMonth = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        profit: data.revenue - data.expenses,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Top performing routes
    const routeData = new Map<string, { revenue: number; tripCount: number }>();
    trips.forEach(trip => {
      const route = `${trip.pickupLocation} → ${trip.dropoffLocation}`;
      if (!routeData.has(route)) {
        routeData.set(route, { revenue: 0, tripCount: 0 });
      }
      const data = routeData.get(route)!;
      data.revenue += trip.brokerPayment || 0;
      data.tripCount += 1;
    });

    const topPerformingRoutes = Array.from(routeData.entries())
      .map(([route, data]) => ({ route, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      revenueByMonth,
      topPerformingRoutes,
    };
  }

  /**
   * Calculate mileage bonus based on per-mile rate
   */
  private calculateMileageBonus(trip: Trip, perMileRate: number): number {
    if (!perMileRate || !trip.distance) return 0;
    return trip.distance * perMileRate;
  }

  /**
   * Calculate performance bonus based on on-time delivery
   */
  private calculatePerformanceBonus(trip: Trip): number {
    if (trip.status !== TripStatus.Delivered || !trip.deliveredAt || !trip.scheduledPickupDatetime) {
      return 0;
    }

    const scheduled = new Date(trip.scheduledPickupDatetime);
    const delivered = new Date(trip.deliveredAt);
    
    // Add expected delivery time (assume 1 day for simplicity)
    const expectedDelivery = new Date(scheduled);
    expectedDelivery.setDate(expectedDelivery.getDate() + 1);

    // Bonus for on-time delivery
    if (delivered <= expectedDelivery) {
      return 50; // $50 bonus for on-time delivery
    }

    return 0;
  }

  /**
   * Calculate deductions (damages, violations, etc.)
   */
  private calculateDeductions(trip: Trip): number {
    // This would be based on actual deduction records
    // For now, return 0
    return 0;
  }
}