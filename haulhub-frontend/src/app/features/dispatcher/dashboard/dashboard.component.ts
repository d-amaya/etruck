import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TripService } from '../../../core/services';
import { Trip, TripStatus } from '@haulhub/shared';

@Component({
  selector: 'app-dispatcher-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;
  recentTrips: Trip[] = [];
  tripSummary = {
    total: 0,
    scheduled: 0,
    inProgress: 0,
    delivered: 0,
    paid: 0
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
    this.tripService.getTrips({ limit: 10 }).subscribe({
      next: (trips) => {
        this.recentTrips = trips;
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
      paid: trips.filter(t => t.status === TripStatus.Paid).length
    };
  }

  onCreateTrip(): void {
    this.router.navigate(['/dispatcher/trips/create']);
  }

  onViewAllTrips(): void {
    this.router.navigate(['/dispatcher/trips']);
  }

  onViewReports(): void {
    this.router.navigate(['/dispatcher/payment-reports']);
  }

  getStatusClass(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'status-scheduled';
      case TripStatus.PickedUp:
      case TripStatus.InTransit:
        return 'status-in-progress';
      case TripStatus.Delivered:
        return 'status-delivered';
      case TripStatus.Paid:
        return 'status-paid';
      default:
        return '';
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
}
