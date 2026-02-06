import { Injectable } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import { Trip, Broker, CreateTripDto, TripFilters, PaymentReport, PaymentReportFilters, UpdateTripStatusDto, TripStatus } from '@haulhub/shared';

export interface TripsResponse {
  trips: Trip[];
  lastEvaluatedKey?: string;
  assets?: {
    brokers: Array<{ brokerId: string; brokerName: string }>;
    trucks: Array<{ truckId: string; plate: string; brand: string; year: number }>;
    trailers: Array<{ trailerId: string; plate: string; brand: string; year: number }>;
    drivers: Array<{ userId: string; name: string; email: string }>;
  };
}

export interface PaymentSummary {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalTruckOwnerPayments: number;
  totalProfit: number;
}

export interface PaymentsTimeline {
  labels: string[];
  brokerPayments: number[];
  driverPayments: number[];
  truckOwnerPayments: number[];
  profit: number[];
}

export interface Truck {
  truckId: string;
  carrierId: string;
  truckOwnerId: string;
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
  nationalId?: string; // Driver license number
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TripService {
  constructor(
    private apiService: ApiService,
    private adminService: AdminService
  ) {}

  // ============================================================================
  // Trip CRUD Operations
  // ============================================================================

  createTrip(tripData: CreateTripDto): Observable<Trip> {
    return this.apiService.post<Trip>('/trips', tripData);
  }

  getTrips(filters?: TripFilters): Observable<TripsResponse> {
    return this.apiService.get<TripsResponse>('/trips', filters);
  }

  getTripById(tripId: string): Observable<Trip> {
    return this.apiService.get<Trip>(`/trips/${tripId}`);
  }

  updateTrip(tripId: string, tripData: Partial<CreateTripDto>): Observable<Trip> {
    return this.apiService.patch<Trip>(`/trips/${tripId}`, tripData);
  }

  updateTripStatus(tripId: string, statusData: UpdateTripStatusDto): Observable<Trip> {
    return this.apiService.patch<Trip>(`/trips/${tripId}/status`, statusData);
  }

  deleteTrip(tripId: string): Observable<{ message: string }> {
    return this.apiService.delete<{ message: string }>(`/trips/${tripId}`);
  }

  // ============================================================================
  // Asset Loading Methods (for dropdowns in trip creation/editing)
  // ============================================================================

  /**
   * Get all trucks for a carrier
   * Used to populate truck dropdown in trip creation/editing forms
   */
  getTrucksByCarrier(carrierId?: string): Observable<Truck[]> {
    // Backend uses carrierId from JWT token, not from URL
    return this.apiService.get<Truck[]>(`/lorries`);
  }

  /**
   * Get all trailers for a carrier
   * Used to populate trailer dropdown in trip creation/editing forms
   */
  getTrailersByCarrier(carrierId?: string): Observable<Trailer[]> {
    // Backend uses carrierId from JWT token, not from URL
    return this.apiService.get<Trailer[]>(`/lorries/trailers`);
  }

  /**
   * Get all drivers for a carrier
   * Used to populate driver dropdown in trip creation/editing forms
   */
  getDriversByCarrier(carrierId?: string): Observable<Driver[]> {
    // Backend uses carrierId from JWT token
    return this.apiService.get<Driver[]>(`/lorries/drivers`);
  }

  /**
   * Get all active brokers
   * Used to populate broker dropdown in trip creation/editing forms
   */
  getBrokers(): Observable<Broker[]> {
    return this.adminService.getAllBrokers(true);
  }

  // ============================================================================
  // Timestamp Utilities
  // ============================================================================

  /**
   * Parse ISO 8601 timestamp to Date object
   * @param isoTimestamp - ISO 8601 timestamp string (e.g., "2025-01-15T14:30:45Z")
   * @returns Date object or null if timestamp is null/invalid
   */
  parseTimestamp(isoTimestamp: string | null): Date | null {
    if (!isoTimestamp) return null;
    try {
      return new Date(isoTimestamp);
    } catch {
      return null;
    }
  }

  /**
   * Format ISO 8601 timestamp for user-friendly display
   * @param isoTimestamp - ISO 8601 timestamp string
   * @returns Formatted string like "01/15/2025 at 2:30 PM" or "N/A" if null
   */
  formatTimestamp(isoTimestamp: string | null): string {
    if (!isoTimestamp) return 'N/A';
    
    const date = this.parseTimestamp(isoTimestamp);
    if (!date) return 'N/A';
    
    // Display date: "01/15/2025"
    const dateStr = date.toLocaleDateString('en-US');
    
    // Display time: "2:30 PM"
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    return `${dateStr} at ${timeStr}`;
  }

  /**
   * Format ISO 8601 timestamp for date display only
   * @param isoTimestamp - ISO 8601 timestamp string
   * @returns Formatted string like "01/15/2025" or "N/A" if null
   */
  formatDate(isoTimestamp: string | null): string {
    if (!isoTimestamp) return 'N/A';
    
    const date = this.parseTimestamp(isoTimestamp);
    if (!date) return 'N/A';
    
    return date.toLocaleDateString('en-US');
  }

  /**
   * Format ISO 8601 timestamp for time display only
   * @param isoTimestamp - ISO 8601 timestamp string
   * @returns Formatted string like "2:30 PM" or "N/A" if null
   */
  formatTime(isoTimestamp: string | null): string {
    if (!isoTimestamp) return 'N/A';
    
    const date = this.parseTimestamp(isoTimestamp);
    if (!date) return 'N/A';
    
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Convert Date object to ISO 8601 timestamp string (without milliseconds)
   * @param date - Date object
   * @returns ISO 8601 timestamp string like "2025-01-15T14:30:45Z"
   */
  toISOTimestamp(date: Date): string {
    return date.toISOString().split('.')[0] + 'Z';
  }

  // ============================================================================
  // Reports and Dashboard
  // ============================================================================

  getPaymentReport(filters?: PaymentReportFilters): Observable<PaymentReport> {
    return this.apiService.get<PaymentReport>('/trips/reports/payments', filters);
  }

  getTripSummaryByStatus(filters?: TripFilters): Observable<Record<TripStatus, number>> {
    return this.apiService.get<Record<TripStatus, number>>('/trips/dashboard/summary-by-status', filters);
  }

  getPaymentSummary(filters?: TripFilters): Observable<PaymentSummary> {
    return this.apiService.get<PaymentSummary>('/trips/dashboard/payment-summary', filters);
  }

  getPaymentsTimeline(filters?: TripFilters): Observable<PaymentsTimeline> {
    return this.apiService.get<PaymentsTimeline>('/trips/dashboard/payments-timeline', filters);
  }

  getTopPerformers(filters?: TripFilters): Observable<{
    topBrokers: Array<{ name: string; revenue: number; count: number }>;
    topDrivers: Array<{ name: string; trips: number }>;
    topTrucks: Array<{ name: string; trips: number }>;
  }> {
    return this.apiService.get('/trips/dashboard/top-performers', filters);
  }

  getDashboard(filters?: TripFilters): Observable<{
    chartAggregates: {
      statusSummary: Record<TripStatus, number>;
      paymentSummary: PaymentSummary;
      topPerformers: {
        topBrokers: Array<{ name: string; revenue: number; count: number }>;
        topDrivers: Array<{ name: string; trips: number }>;
        topTrucks: Array<{ name: string; trips: number }>;
      };
    };
    trips: Trip[];
    lastEvaluatedKey?: string;
  }> {
    return this.apiService.get('/trips/dashboard', filters);
  }
}
