import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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

  constructor(private http: HttpClient) {}

  getFleetOverview(): Observable<FleetOverview> {
    return this.http.get<FleetOverview>(`${this.apiUrl}/fleet-overview`);
  }

  getTripAnalytics(startDate?: Date, endDate?: Date): Observable<TripAnalytics> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<TripAnalytics>(`${this.apiUrl}/trip-analytics`, { params });
  }

  getDriverPerformance(startDate?: Date, endDate?: Date): Observable<DriverPerformance[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<DriverPerformance[]>(`${this.apiUrl}/driver-performance`, { params });
  }

  getVehicleUtilization(startDate?: Date, endDate?: Date): Observable<VehicleUtilization[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<VehicleUtilization[]>(`${this.apiUrl}/vehicle-utilization`, { params });
  }

  getRevenueAnalytics(startDate?: Date, endDate?: Date): Observable<RevenueAnalytics> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<RevenueAnalytics>(`${this.apiUrl}/revenue-analytics`, { params });
  }

  getMaintenanceAlerts(): Observable<MaintenanceAlerts> {
    return this.http.get<MaintenanceAlerts>(`${this.apiUrl}/maintenance-alerts`);
  }

  getBrokerAnalytics(startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<any>(`${this.apiUrl}/broker-analytics`, { params });
  }

  getFuelAnalytics(startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<any>(`${this.apiUrl}/fuel-analytics`, { params });
  }

  // Carrier-specific analytics methods
  getCarrierTripAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<TripAnalytics> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<TripAnalytics>(`${this.apiUrl}/trip-analytics`, { params });
  }

  getCarrierDriverPerformance(carrierId: string, startDate?: Date, endDate?: Date): Observable<DriverPerformance[]> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<DriverPerformance[]>(`${this.apiUrl}/driver-performance`, { params });
  }

  getCarrierVehicleUtilization(carrierId: string, startDate?: Date, endDate?: Date): Observable<VehicleUtilization[]> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<VehicleUtilization[]>(`${this.apiUrl}/vehicle-utilization`, { params });
  }

  getCarrierBrokerAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<any>(`${this.apiUrl}/broker-analytics`, { params });
  }

  getCarrierFuelAnalytics(carrierId: string, startDate?: Date, endDate?: Date): Observable<any> {
    let params = new HttpParams().set('carrierId', carrierId);
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<any>(`${this.apiUrl}/fuel-analytics`, { params });
  }

  getDispatcherPerformance(startDate?: Date, endDate?: Date): Observable<any[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<any[]>(`${this.apiUrl}/dispatcher-performance`, { params });
  }
}
