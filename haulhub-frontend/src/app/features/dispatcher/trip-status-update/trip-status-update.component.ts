import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TripService } from '../../../core/services';
import { Trip, TripStatus } from '@haulhub/shared';

@Component({
  selector: 'app-trip-status-update',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  providers: [MatSnackBar],
  templateUrl: './trip-status-update.component.html',
  styleUrls: ['./trip-status-update.component.scss']
})
export class TripStatusUpdateComponent implements OnInit {
  trip?: Trip;
  statusForm: FormGroup;
  loading = true;
  submitting = false;
  error?: string;
  
  statusOptions = Object.values(TripStatus);
  TripStatus = TripStatus;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private tripService: TripService,
    private snackBar: MatSnackBar
  ) {
    this.statusForm = this.fb.group({
      status: ['', Validators.required]
    });
  }

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
        this.statusForm.patchValue({
          status: trip.status
        });
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trip:', error);
        this.error = error.error?.message || 'Failed to load trip details';
        this.loading = false;
      }
    });
  }

  onSubmit(): void {
    if (this.statusForm.invalid || !this.trip) {
      return;
    }

    const newStatus = this.statusForm.value.status;
    
    if (newStatus === this.trip.status) {
      this.snackBar.open('Status is already set to this value', 'Close', {
        duration: 3000
      });
      return;
    }

    this.submitting = true;
    this.tripService.updateTripStatus(this.trip.tripId, { status: newStatus }).subscribe({
      next: () => {
        this.snackBar.open('Trip status updated successfully', 'Close', {
          duration: 3000
        });
        this.router.navigate(['/dispatcher/trips']);
      },
      error: (error) => {
        console.error('Error updating trip status:', error);
        this.snackBar.open(
          error.error?.message || 'Failed to update trip status',
          'Close',
          { duration: 5000 }
        );
        this.submitting = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/dispatcher/trips']);
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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
