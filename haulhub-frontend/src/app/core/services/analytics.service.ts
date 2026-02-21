import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';

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

  constructor(private http: HttpClient, private authService: AuthService, private orderService: OrderService) {}

  private toUTCDateString(d: Date, endOfDay = false): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return endOfDay ? `${y}-${m}-${day}T23:59:59.999Z` : `${y}-${m}-${day}T00:00:00.000Z`;
  }

  getUnifiedAnalytics(startDate?: Date, endDate?: Date, pageSize = 10): Observable<any> {
    const filters: any = { includeAggregates: 'true', includeDetailedAnalytics: 'true', limit: pageSize };
    if (startDate) filters.startDate = this.toUTCDateString(startDate);
    if (endDate) filters.endDate = this.toUTCDateString(endDate, true);

    return this.orderService.getOrders(filters).pipe(
      map((response: any) => ({
        ...response.detailedAnalytics,
        paymentReport: response.paymentReport,
        entityIds: response.entityIds || [],
        orders: response.orders || [],
        aggregates: response.aggregates,
        lastEvaluatedKey: response.lastEvaluatedKey,
      }))
    );
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
