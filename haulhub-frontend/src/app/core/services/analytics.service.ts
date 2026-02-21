import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { UserRole } from '@haulhub/shared';

export interface FleetOverview {
  drivers: {
    total: number;
    active: number;
    onTrip: number;
    utilization: number;
  };
  vehicles: {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    utilization: number;
  };
  trips: {
    total: number;
    completed: number;
    inProgress: number;
    planned: number;
  };
}

export interface TripAnalytics {
  totalTrips: number;
  completedTrips: number;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  averageDistance: number;
  averageRevenue: number;
  onTimeDeliveryRate: number;
  fuelEfficiency: number;
}

export interface DriverPerformance {
  driverId: string;
  driverName: string;
  totalTrips: number;
  completedTrips: number;
  totalDistance: number;
  totalRevenue: number;
  averageRevenue: number;
  onTimeDeliveryRate: number;
}

export interface VehicleUtilization {
  vehicleId: string;
  vehicleName: string;
  totalTrips: number;
  totalDistance: number;
  totalRevenue: number;
  utilizationRate: number;
  averageRevenuePerTrip: number;
}

export interface RevenueAnalytics {
  monthlyData: {
    month: string;
    revenue: number;
    expenses: number;
    profit: number;
  }[];
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  averageMonthlyRevenue: number;
}

export interface MaintenanceAlerts {
  vehicleAlerts: {
    vehicleId: string;
    alertType: string;
    message: string;
    severity: string;
  }[];
  driverAlerts: {
    driverId: string;
    driverName: string;
    alertType: string;
    message: string;
    severity: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly apiUrl = `${environment.apiUrl}/analytics`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private toUTCDateString(d: Date, endOfDay = false): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return endOfDay ? `${y}-${m}-${day}T23:59:59.999Z` : `${y}-${m}-${day}T00:00:00.000Z`;
  }

  getUnifiedAnalytics(startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    // Route to correct endpoint based on role
    const role = this.authService.userRole as string | undefined;
    const endpoint = role === UserRole.Carrier
      ? `${environment.apiUrl}/carrier/orders`
      : `${environment.apiUrl}/orders`;

    return this.http.get<any>(endpoint, { params: params.set('includeAggregates', 'true') }).pipe(
      map((res: any) => ({
        ...this.buildAnalyticsFromOrders(res.orders || [], res.aggregates || {}, role),
        _rawOrders: res.orders || [],
      }))
    );
  }

  private buildAnalyticsFromOrders(orders: any[], aggregates: any, role?: string): any {
    const driverMap = new Map<string, any[]>();
    const vehicleMap = new Map<string, any[]>();
    const brokerMap = new Map<string, any[]>();
    const dispatcherMap = new Map<string, any[]>();

    for (const o of orders) {
      if (o.driverId) { if (!driverMap.has(o.driverId)) driverMap.set(o.driverId, []); driverMap.get(o.driverId)!.push(o); }
      if (o.truckId) { if (!vehicleMap.has(o.truckId)) vehicleMap.set(o.truckId, []); vehicleMap.get(o.truckId)!.push(o); }
      if (o.brokerId) { if (!brokerMap.has(o.brokerId)) brokerMap.set(o.brokerId, []); brokerMap.get(o.brokerId)!.push(o); }
      if (o.dispatcherId) { if (!dispatcherMap.has(o.dispatcherId)) dispatcherMap.set(o.dispatcherId, []); dispatcherMap.get(o.dispatcherId)!.push(o); }
    }

    const sum = (arr: any[], f: string) => arr.reduce((s, o) => s + (o[f] || 0), 0);
    const completed = (arr: any[]) => arr.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'ReadyToPay').length;

    // Role-aware financial calculations
    const revenue = (arr: any[]) => {
      switch (role) {
        case UserRole.Admin: return sum(arr, 'adminPayment');
        case UserRole.Dispatcher: return sum(arr, 'dispatcherPayment');
        case UserRole.Driver: return sum(arr, 'driverPayment');
        default: return sum(arr, 'carrierPayment'); // Carrier
      }
    };
    const expenses = (arr: any[]) => {
      switch (role) {
        case UserRole.Admin: return sum(arr, 'lumperValue') + sum(arr, 'detentionValue');
        case UserRole.Dispatcher: return 0;
        case UserRole.Driver: return 0;
        default: return sum(arr, 'driverPayment') + sum(arr, 'fuelCost'); // Carrier
      }
    };
    const profit = (arr: any[]) => revenue(arr) - expenses(arr);

    return {
      tripAnalytics: {
        totalTrips: orders.length,
        completedTrips: completed(orders),
        statusBreakdown: aggregates.statusSummary || {},
        totalRevenue: revenue(orders),
        totalExpenses: expenses(orders),
        totalProfit: profit(orders),
        totalMiles: sum(orders, 'mileageTotal'),
      },
      driverPerformance: [...driverMap.entries()].map(([driverId, trips]) => {
        const rev = revenue(trips);
        const prof = profit(trips);
        return {
          driverId, totalTrips: trips.length, completedTrips: completed(trips),
          totalDistance: sum(trips, 'mileageTotal'), totalEarnings: sum(trips, 'driverPayment'),
          totalRevenue: rev, totalProfit: prof,
          averageEarningsPerTrip: trips.length ? sum(trips, 'driverPayment') / trips.length : 0,
          completionRate: trips.length ? (completed(trips) / trips.length) * 100 : 0,
        };
      }),
      vehicleUtilization: [...vehicleMap.entries()].map(([vehicleId, trips]) => {
        const rev = revenue(trips);
        const prof = profit(trips);
        return {
          vehicleId, totalTrips: trips.length, totalDistance: sum(trips, 'mileageTotal'),
          totalRevenue: rev, totalProfit: prof,
          averageRevenue: trips.length ? rev / trips.length : 0,
        };
      }),
      brokerAnalytics: [...brokerMap.entries()].map(([brokerId, trips]) => ({
        brokerId, totalTrips: trips.length, completedTrips: completed(trips),
        totalRevenue: sum(trips, 'carrierPayment'),
        averageRevenue: trips.length ? sum(trips, 'carrierPayment') / trips.length : 0,
        totalDistance: sum(trips, 'mileageTotal'),
        completionRate: trips.length ? (completed(trips) / trips.length) * 100 : 0,
      })),
      dispatcherPerformance: [...dispatcherMap.entries()].map(([dispatcherId, trips]) => {
        const rev = revenue(trips);
        const prof = profit(trips);
        return {
          dispatcherId, totalTrips: trips.length, completedTrips: completed(trips),
          totalRevenue: rev, totalProfit: prof,
          averageProfit: trips.length ? prof / trips.length : 0,
          completionRate: trips.length ? (completed(trips) / trips.length) * 100 : 0,
        };
      }),
      fuelAnalytics: (() => {
        const fuelOrders = orders.filter(o => o.fuelCost > 0);
        const totalFuel = sum(fuelOrders, 'fuelCost');
        const totalMiles = sum(fuelOrders, 'mileageTotal');
        const totalGallons = fuelOrders.reduce((s, o) => s + ((o.fuelGasAvgGallxMil || 0) * (o.mileageTotal || 0)), 0);
        return {
          tripsWithFuelData: fuelOrders.length, totalFuelCost: totalFuel,
          averageFuelCost: fuelOrders.length ? totalFuel / fuelOrders.length : 0,
          totalGallonsUsed: totalGallons,
          averageFuelPrice: totalGallons > 0 ? totalFuel / totalGallons : 0,
          averageGallonsPerMile: totalMiles > 0 ? totalGallons / totalMiles : 0,
          vehicleFuelEfficiency: [...vehicleMap.entries()].map(([vehicleId, trips]) => {
            const vFuel = trips.filter(o => o.fuelCost > 0);
            const vGallons = vFuel.reduce((s, o) => s + ((o.fuelGasAvgGallxMil || 0) * (o.mileageTotal || 0)), 0);
            const vMiles = sum(vFuel, 'mileageTotal');
            return {
              vehicleId, totalTrips: vFuel.length, totalDistance: vMiles,
              totalFuelCost: sum(vFuel, 'fuelCost'),
              averageGallonsPerMile: vMiles > 0 ? vGallons / vMiles : 0,
              averageMPG: vGallons > 0 ? vMiles / vGallons : 0,
            };
          }).sort((a, b) => b.averageMPG - a.averageMPG),
        };
      })(),
    };
  }

  getFleetOverview(): Observable<FleetOverview> {
    return this.http.get<FleetOverview>(`${this.apiUrl}/fleet-overview`);
  }

  getTripAnalytics(startDate?: Date, endDate?: Date): Observable<TripAnalytics> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<TripAnalytics>(`${this.apiUrl}/trip-analytics`, { params });
  }

  getDriverPerformance(startDate?: Date, endDate?: Date): Observable<DriverPerformance[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<DriverPerformance[]>(`${this.apiUrl}/driver-performance`, { params });
  }

  getVehicleUtilization(startDate?: Date, endDate?: Date): Observable<VehicleUtilization[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<VehicleUtilization[]>(`${this.apiUrl}/vehicle-utilization`, { params });
  }

  getRevenueAnalytics(startDate?: Date, endDate?: Date): Observable<RevenueAnalytics> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<RevenueAnalytics>(`${this.apiUrl}/revenue-analytics`, { params });
  }

  getMaintenanceAlerts(): Observable<MaintenanceAlerts> {
    return this.http.get<MaintenanceAlerts>(`${this.apiUrl}/maintenance-alerts`);
  }

  getBrokerAnalytics(startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<any>(`${this.apiUrl}/broker-analytics`, { params });
  }

  getFuelAnalytics(startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<any>(`${this.apiUrl}/fuel-analytics`, { params });
  }

  // Carrier-specific analytics methods
  getCarrierTripAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<TripAnalytics> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<TripAnalytics>(`${this.apiUrl}/trip-analytics`, { params });
  }

  getCarrierDriverPerformance(carrierId: string, startDate?: Date, endDate?: Date): Observable<DriverPerformance[]> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<DriverPerformance[]>(`${this.apiUrl}/driver-performance`, { params });
  }

  getCarrierVehicleUtilization(carrierId: string, startDate?: Date, endDate?: Date): Observable<VehicleUtilization[]> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<VehicleUtilization[]>(`${this.apiUrl}/vehicle-utilization`, { params });
  }

  getCarrierBrokerAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<any>(`${this.apiUrl}/broker-analytics`, { params });
  }

  getCarrierFuelAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<any>(`${this.apiUrl}/fuel-analytics`, { params });
  }

  getDispatcherPerformance(startDate?: Date, endDate?: Date): Observable<any[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', this.toUTCDateString(startDate));
    }
    if (endDate) {
      params = params.set('endDate', this.toUTCDateString(endDate, true));
    }
    return this.http.get<any[]>(`${this.apiUrl}/dispatcher-performance`, { params });
  }

  resolveEntitiesForAnalytics(ids: string[]): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/entities/resolve`, { ids });
  }
}
