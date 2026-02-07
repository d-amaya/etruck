import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { TripFilters, TripStatus, UserRole } from '@haulhub/shared';

@Injectable()
export class CarrierService {
  constructor(private readonly tripsService: TripsService) {}

  /**
   * Get unified dashboard data (aggregates + paginated trips)
   * 
   * This consolidates multiple endpoints into one for better performance:
   * - Status summary (trip counts by status)
   * - Payment summary (revenue, expenses, profit)
   * - Top performers (brokers, drivers, trucks)
   * - Paginated trips for the table
   * 
   * Performance: Reduces API calls from 4+ to 1
   */
  async getDashboard(
    carrierId: string,
    filters: TripFilters,
  ): Promise<{
    chartAggregates: {
      statusSummary: Record<TripStatus, number>;
      paymentSummary: any;
      topPerformers: any;
    };
    trips: any[];
    lastEvaluatedKey?: string;
  }> {
    // Get ALL trips for aggregation (no pagination)
    const allTrips = await this.tripsService.getAllTripsForAggregation(
      carrierId,
      UserRole.Carrier,
      filters,
    );

    // Calculate all aggregates from the same dataset
    const statusSummary = this.calculateStatusSummary(allTrips);
    const paymentSummary = this.calculatePaymentSummary(allTrips);
    const topPerformers = this.calculateTopPerformers(allTrips);

    // Get paginated trips for the table
    const paginatedResult = await this.tripsService.getTrips(
      carrierId,
      UserRole.Carrier,
      filters,
    );

    return {
      chartAggregates: {
        statusSummary,
        paymentSummary,
        topPerformers,
      },
      trips: paginatedResult.trips,
      lastEvaluatedKey: paginatedResult.lastEvaluatedKey,
    };
  }

  private calculateStatusSummary(trips: any[]): Record<TripStatus, number> {
    const summary: Record<string, number> = {};
    for (const status of Object.values(TripStatus)) {
      summary[status] = 0;
    }
    trips.forEach(trip => {
      const status = trip.orderStatus || TripStatus.Scheduled;
      summary[status] = (summary[status] || 0) + 1;
    });
    return summary as Record<TripStatus, number>;
  }

  private calculatePaymentSummary(trips: any[]): any {
    let totalBrokerPayments = 0;
    let totalDriverPayments = 0;
    let totalTruckOwnerPayments = 0;
    let totalLumperFees = 0;
    let totalDetentionFees = 0;
    let totalFuelCost = 0;

    trips.forEach(trip => {
      totalBrokerPayments += trip.brokerPayment || 0;
      totalDriverPayments += trip.driverPayment || 0;
      totalTruckOwnerPayments += trip.truckOwnerPayment || 0;
      totalLumperFees += trip.lumperValue || 0;
      totalDetentionFees += trip.detentionValue || 0;
      
      if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil && trip.mileageTotal) {
        totalFuelCost += trip.fuelGasAvgCost * trip.fuelGasAvgGallxMil * trip.mileageTotal;
      }
    });

    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalTruckOwnerPayments - totalAdditionalFees - totalFuelCost;

    return {
      totalBrokerPayments,
      totalDriverPayments,
      totalTruckOwnerPayments,
      totalLumperFees,
      totalDetentionFees,
      totalAdditionalFees,
      totalFuelCost,
      totalProfit,
    };
  }

  private calculateTopPerformers(trips: any[]): any {
    const brokerPerformance = new Map<string, { revenue: number; count: number; id: string }>();
    const driverPerformance = new Map<string, { trips: number; id: string }>();
    const truckPerformance = new Map<string, { trips: number; id: string }>();
    const dispatcherPerformance = new Map<string, { profit: number; count: number; id: string }>();

    trips.forEach(trip => {
      if (trip.brokerId) {
        const existing = brokerPerformance.get(trip.brokerId);
        if (existing) {
          existing.revenue += trip.brokerPayment || 0;
          existing.count++;
        } else {
          brokerPerformance.set(trip.brokerId, {
            revenue: trip.brokerPayment || 0,
            count: 1,
            id: trip.brokerId,
          });
        }
      }

      if (trip.driverId) {
        const existing = driverPerformance.get(trip.driverId);
        if (existing) {
          existing.trips++;
        } else {
          driverPerformance.set(trip.driverId, {
            trips: 1,
            id: trip.driverId,
          });
        }
      }

      if (trip.truckId) {
        const existing = truckPerformance.get(trip.truckId);
        if (existing) {
          existing.trips++;
        } else {
          truckPerformance.set(trip.truckId, {
            trips: 1,
            id: trip.truckId,
          });
        }
      }

      if (trip.dispatcherId) {
        const tripProfit = (trip.brokerPayment || 0) - (trip.driverPayment || 0) - (trip.truckOwnerPayment || 0) - (trip.lumperValue || 0) - (trip.detentionValue || 0);
        const existing = dispatcherPerformance.get(trip.dispatcherId);
        if (existing) {
          existing.profit += tripProfit;
          existing.count++;
        } else {
          dispatcherPerformance.set(trip.dispatcherId, {
            profit: tripProfit,
            count: 1,
            id: trip.dispatcherId,
          });
        }
      }
    });

    const topBrokers = Array.from(brokerPerformance.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(b => ({ id: b.id, revenue: b.revenue, count: b.count }));

    const topDrivers = Array.from(driverPerformance.values())
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 5)
      .map(d => ({ id: d.id, trips: d.trips }));

    const topTrucks = Array.from(truckPerformance.values())
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 5)
      .map(t => ({ id: t.id, trips: t.trips }));

    const topDispatchers = Array.from(dispatcherPerformance.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
      .map(d => ({ id: d.id, profit: d.profit, count: d.count }));

    return {
      topBrokers,
      topDrivers,
      topTrucks,
      topDispatchers,
    };
  }
}
