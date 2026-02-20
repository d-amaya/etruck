import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import {
  Order, Broker, CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto,
  OrderFilters, OrderStatus, PaymentReport, User,
  calcDispatcherProfit, calcCarrierProfit, calcDriverProfit, calcAdminProfit,
} from '@haulhub/shared';

export interface OrdersResponse {
  orders: Order[];
  lastEvaluatedKey?: string;
}

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

export interface ResolvedEntity {
  id: string;
  name: string;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(
    private apiService: ApiService,
    private adminService: AdminService,
  ) {}

  // ── Order CRUD ────────────────────────────────────────────

  createOrder(dto: CreateOrderDto): Observable<Order> {
    return this.apiService.post<Order>('/orders', dto);
  }

  getOrders(filters?: Partial<OrderFilters>): Observable<OrdersResponse> {
    const { lastEvaluatedKey, ...query } = filters || {} as any;
    const options = lastEvaluatedKey
      ? { headers: { 'x-pagination-token': lastEvaluatedKey } as Record<string, string> }
      : undefined;
    return this.apiService.get<OrdersResponse>('/orders', query, options);
  }

  getOrderById(orderId: string): Observable<Order> {
    return this.apiService.get<Order>(`/orders/${orderId}`);
  }

  updateOrder(orderId: string, dto: Partial<UpdateOrderDto>): Observable<Order> {
    return this.apiService.patch<Order>(`/orders/${orderId}`, dto);
  }

  updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto): Observable<Order> {
    return this.apiService.patch<Order>(`/orders/${orderId}/status`, dto);
  }

  deleteOrder(orderId: string): Observable<{ message: string }> {
    return this.apiService.delete<{ message: string }>(`/orders/${orderId}`);
  }

  // ── Asset Loading ─────────────────────────────────────────

  getTrucksByCarrier(carrierId: string): Observable<{ trucks: Truck[] }> {
    return this.apiService.get<{ trucks: Truck[] }>(`/carrier/trucks`);
  }

  getTrailersByCarrier(carrierId: string): Observable<{ trailers: Trailer[] }> {
    return this.apiService.get<{ trailers: Trailer[] }>(`/carrier/trailers`);
  }

  getDriversByCarrier(carrierId: string): Observable<{ users: Driver[] }> {
    return this.apiService.get<{ users: Driver[] }>(`/carrier/users`, { role: 'DRIVER' });
  }

  getBrokers(): Observable<Broker[]> {
    return this.adminService.getAllBrokers(true);
  }

  // ── Entity Resolution ─────────────────────────────────────

  resolveEntities(ids: string[]): Observable<ResolvedEntity[]> {
    return this.apiService.post<ResolvedEntity[]>('/entities/resolve', { ids });
  }

  getSubscriptions(): Observable<{ subscribedCarrierIds: string[]; subscribedAdminIds: string[] }> {
    return this.apiService.get('/users/subscriptions');
  }

  updateSubscriptions(data: { subscribedCarrierIds?: string[]; subscribedAdminIds?: string[] }): Observable<any> {
    return this.apiService.patch('/users/subscriptions', data);
  }

  // ── Reports ───────────────────────────────────────────────

  getPaymentReport(filters?: Partial<OrderFilters>): Observable<PaymentReport> {
    return this.apiService.get<PaymentReport>('/orders/reports/payments', filters);
  }

  // ── Timestamp Utilities ───────────────────────────────────

  formatTimestamp(iso: string | null): string {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-US')} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } catch { return 'N/A'; }
  }

  formatDate(iso: string | null): string {
    if (!iso) return 'N/A';
    try { return new Date(iso).toLocaleDateString('en-US'); }
    catch { return 'N/A'; }
  }

  toISOTimestamp(date: Date): string {
    return date.toISOString().split('.')[0] + 'Z';
  }
}
