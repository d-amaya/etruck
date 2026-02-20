import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import {
  Order, Broker, CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto,
  OrderFilters, OrderStatus, PaymentReport,
} from '@haulhub/shared';

export interface Truck {
  truckId: string;
  carrierId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  isActive: boolean;
}

export interface Trailer {
  trailerId: string;
  carrierId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  reefer: string | null;
  isActive: boolean;
}

export interface Driver {
  userId: string;
  carrierId: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  corpName?: string;
  cdlClass?: string;
  cdlState?: string;
  nationalId?: string;
  isActive: boolean;
}

export interface TripsResponse {
  trips: Order[];
  lastEvaluatedKey?: string;
}

export interface PaymentSummary {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalFuelCost: number;
  totalProfit: number;
}

export interface PaymentsTimeline {
  labels: string[];
  brokerPayments: number[];
  driverPayments: number[];
  fuelCosts: number[];
  profit: number[];
}

@Injectable({ providedIn: 'root' })
export class TripService {
  constructor(
    private apiService: ApiService,
    private adminService: AdminService,
  ) {}

  createTrip(data: CreateOrderDto): Observable<Order> {
    return this.apiService.post<Order>('/orders', data);
  }

  getTrips(filters?: Partial<OrderFilters>): Observable<TripsResponse> {
    const { lastEvaluatedKey, ...query } = filters || {} as any;
    const options = lastEvaluatedKey
      ? { headers: { 'x-pagination-token': lastEvaluatedKey } as Record<string, string> }
      : undefined;
    return this.apiService.get<TripsResponse>('/orders', query, options);
  }

  getTripById(tripId: string): Observable<Order> {
    return this.apiService.get<Order>(`/orders/${tripId}`);
  }

  updateTrip(tripId: string, data: Partial<UpdateOrderDto>): Observable<Order> {
    return this.apiService.patch<Order>(`/orders/${tripId}`, data);
  }

  updateTripStatus(tripId: string, data: UpdateOrderStatusDto): Observable<Order> {
    return this.apiService.patch<Order>(`/orders/${tripId}/status`, data);
  }

  deleteTrip(tripId: string): Observable<{ message: string }> {
    return this.apiService.delete<{ message: string }>(`/orders/${tripId}`);
  }

  getTrucksByCarrier(): Observable<Truck[]> {
    return this.apiService.get<Truck[]>('/carrier/trucks');
  }

  getTrailersByCarrier(): Observable<Trailer[]> {
    return this.apiService.get<Trailer[]>('/carrier/trailers');
  }

  getDriversByCarrier(): Observable<Driver[]> {
    return this.apiService.get<Driver[]>('/carrier/users', { role: 'DRIVER' });
  }

  getDispatchersByCarrier(): Observable<any[]> {
    return this.apiService.get<any[]>('/carrier/users', { role: 'DISPATCHER' });
  }

  getBrokers(): Observable<Broker[]> {
    return this.adminService.getAllBrokers(true);
  }

  parseTimestamp(iso: string | null): Date | null {
    if (!iso) return null;
    try { return new Date(iso); } catch { return null; }
  }

  formatTimestamp(iso: string | null): string {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-US')} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } catch { return 'N/A'; }
  }

  formatDate(iso: string | null): string {
    if (!iso) return 'N/A';
    try { return new Date(iso).toLocaleDateString('en-US'); } catch { return 'N/A'; }
  }

  formatTime(iso: string | null): string {
    if (!iso) return 'N/A';
    try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); } catch { return 'N/A'; }
  }

  toISOTimestamp(date: Date): string {
    return date.toISOString().split('.')[0] + 'Z';
  }

  getPaymentReport(filters?: Partial<OrderFilters>): Observable<PaymentReport> {
    return this.apiService.get<PaymentReport>('/orders/reports/payments', filters);
  }

  getTripSummaryByStatus(filters?: Partial<OrderFilters>): Observable<Record<OrderStatus, number>> {
    return this.apiService.get<Record<OrderStatus, number>>('/orders/dashboard/summary-by-status', filters);
  }

  getPaymentSummary(filters?: Partial<OrderFilters>): Observable<PaymentSummary> {
    return this.apiService.get<PaymentSummary>('/orders/dashboard/payment-summary', filters);
  }

  getDashboardExport(filters?: Partial<OrderFilters>): Observable<any> {
    return this.apiService.get('/orders/dashboard/export', filters);
  }

  getPaymentsTimeline(filters?: Partial<OrderFilters>): Observable<PaymentsTimeline> {
    return this.apiService.get<PaymentsTimeline>('/orders/dashboard/payments-timeline', filters);
  }

  getTopPerformers(filters?: Partial<OrderFilters>): Observable<any> {
    return this.apiService.get('/orders/dashboard/top-performers', filters);
  }

  getDashboard(filters?: Partial<OrderFilters>): Observable<any> {
    const { lastEvaluatedKey, ...query } = filters || {} as any;
    const options = lastEvaluatedKey
      ? { headers: { 'x-pagination-token': lastEvaluatedKey } as Record<string, string> }
      : undefined;
    return this.apiService.get('/orders/dashboard', query, options);
  }
}
