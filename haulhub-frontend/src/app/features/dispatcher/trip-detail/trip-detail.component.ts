import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { TripService } from '../../../core/services';
import { Trip, TripStatus } from '@haulhub/shared';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule
  ],
  templateUrl: './trip-detail.component.html',
  styleUrls: ['./trip-detail.component.scss']
})
export class TripDetailComponent implements OnInit {
  trip?: Trip;
  loading = true;
  error?: string;
  TripStatus = TripStatus;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService
  ) {}

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.loadTrip(tripId);
    } else {
      this.error = 'No trip ID provided';
      this.loading = false;
    }
  }

  private loadTrip(tripId: string): void {
    this.loading = true;
    this.tripService.getTripById(tripId).subscribe({
      next: (trip) => {
        this.trip = trip;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trip:', error);
        this.error = error.error?.message || 'Failed to load trip details';
        this.loading = false;
      }
    });
  }

  onBackToTrips(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }

  onEditTrip(): void {
    if (this.trip) {
      this.router.navigate(['/dispatcher/trips', this.trip.tripId, 'edit']);
    }
  }

  onUpdateStatus(): void {
    if (this.trip) {
      this.router.navigate(['/dispatcher/trips', this.trip.tripId, 'status']);
    }
  }

  getStatusClass(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'status-scheduled';
      case TripStatus.PickedUp:
        return 'status-picked-up';
      case TripStatus.InTransit:
        return 'status-in-transit';
      case TripStatus.Delivered:
        return 'status-delivered';
      case TripStatus.Paid:
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'Scheduled';
      case TripStatus.PickedUp:
        return 'Picked Up';
      case TripStatus.InTransit:
        return 'In Transit';
      case TripStatus.Delivered:
        return 'Delivered';
      case TripStatus.Paid:
        return 'Paid';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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

  calculateProfit(): number {
    if (!this.trip) return 0;
    return this.trip.brokerPayment - this.trip.lorryOwnerPayment - this.trip.driverPayment;
  }
}
