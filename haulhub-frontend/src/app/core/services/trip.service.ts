import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import { Trip, Broker, CreateTripDto, TripFilters, PaymentReport, PaymentReportFilters, UpdateTripStatusDto } from '@haulhub/shared';

export interface TripsResponse {
  trips: Trip[];
  lastEvaluatedKey?: string;
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

  getTrips(filters?: TripFilters): Observable<Trip[]> {
    return this.apiService.get<TripsResponse>('/trips', filters).pipe(
      map(response => response.trips)
    );
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
}
