import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import { Trip, Broker, CreateTripDto, TripFilters, PaymentReport, PaymentReportFilters, UpdateTripStatusDto, TripStatus } from '@haulhub/shared';

export interface TripsResponse {
  trips: Trip[];
  lastEvaluatedKey?: string;
}

export interface PaymentSummary {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalLorryOwnerPayments: number;
  totalProfit: number;
}

export interface PaymentsTimeline {
  labels: string[];
  brokerPayments: number[];
  driverPayments: number[];
  lorryOwnerPayments: number[];
  profit: number[];
}

@Injectable({
  providedIn: 'root'
})
export class TripService {
  constructor(
    private apiService: ApiService,
    private adminService: AdminService
  ) {}

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

  getBrokers(): Observable<Broker[]> {
    return this.adminService.getAllBrokers(true);
  }

  getPaymentReport(filters?: PaymentReportFilters): Observable<PaymentReport> {
    return this.apiService.get<PaymentReport>('/trips/reports/payments', filters);
  }

  // Dashboard endpoints
  getTripSummaryByStatus(filters?: TripFilters): Observable<Record<TripStatus, number>> {
    return this.apiService.get<Record<TripStatus, number>>('/trips/dashboard/summary-by-status', filters);
  }

  getPaymentSummary(filters?: TripFilters): Observable<PaymentSummary> {
    return this.apiService.get<PaymentSummary>('/trips/dashboard/payment-summary', filters);
  }

  getPaymentsTimeline(filters?: TripFilters): Observable<PaymentsTimeline> {
    return this.apiService.get<PaymentsTimeline>('/trips/dashboard/payments-timeline', filters);
  }

  deleteTrip(tripId: string): Observable<{ message: string }> {
    return this.apiService.delete<{ message: string }>(`/trips/${tripId}`);
  }
}
