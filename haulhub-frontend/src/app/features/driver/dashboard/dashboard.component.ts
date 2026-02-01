import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { TripService } from '../../../core/services';
import { Trip, TripStatus } from '@haulhub/shared';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;
  upcomingTrips: Trip[] = [];
  tripSummary = {
    total: 0,
    scheduled: 0,
    inProgress: 0,
    delivered: 0,
    totalEarnings: 0
  };

  constructor(
    private tripService: TripService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    this.loading = true;
    // Get upcoming trips (scheduled and in progress)
    this.tripService.getTrips({ limit: 10 }).subscribe({
      next: (response) => {
        const trips = response.trips;
        // Filter for upcoming trips (not delivered or paid)
        this.upcomingTrips = trips
          .filter(t => 
            t.status === TripStatus.Scheduled || 
            t.status === TripStatus.PickedUp || 
            t.status === TripStatus.InTransit
          )
          .slice(0, 5);
        
        this.calculateSummary(trips);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard data:', error);
        this.loading = false;
      }
    });
  }

  private calculateSummary(trips: Trip[]): void {
    this.tripSummary = {
      total: trips.length,
      scheduled: trips.filter(t => t.status === TripStatus.Scheduled).length,
      inProgress: trips.filter(t => 
        t.status === TripStatus.PickedUp || t.status === TripStatus.InTransit
      ).length,
      delivered: trips.filter(t => t.status === TripStatus.Delivered).length,
      totalEarnings: trips.reduce((sum, trip) => sum + trip.driverPayment, 0)
    };
  }

  onViewAllTrips(): void {
    this.router.navigate(['/driver/trips']);
  }

  onViewPaymentReports(): void {
    this.router.navigate(['/driver/payment-reports']);
  }

  onViewTrip(trip: Trip): void {
    this.router.navigate(['/driver/trips', trip.tripId]);
  }

  getStatusClass(status: TripStatus | string): string {
    // Handle both TripStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'status-scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
      case TripStatus.InTransit:
      case 'In Transit':
        return 'status-in-progress';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'status-delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: TripStatus | string): string {
    // Handle both TripStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'Scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
        return 'Picked Up';
      case TripStatus.InTransit:
      case 'In Transit':
        return 'In Transit';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'Delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'Paid';
      default:
        return String(status);
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}
