import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { LorryService, TripService } from '../../../core/services';
import { Lorry, LorryVerificationStatus, Trip } from '@haulhub/shared';

@Component({
  selector: 'app-lorry-owner-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  lorries: Lorry[] = [];
  recentTrips: Trip[] = [];
  loading = true;
  loadingTrips = true;
  displayedColumns: string[] = ['lorryId', 'make', 'model', 'year', 'status', 'actions'];
  LorryVerificationStatus = LorryVerificationStatus;

  // Summary statistics
  totalLorries = 0;
  approvedLorries = 0;
  pendingLorries = 0;
  recentTripsCount = 0;

  constructor(
    private lorryService: LorryService,
    private tripService: TripService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadLorries();
    this.loadRecentTrips();
  }

  private loadLorries(): void {
    this.loading = true;
    this.lorryService.getLorries().subscribe({
      next: (lorries) => {
        this.lorries = lorries;
        this.calculateStatistics();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading lorries:', error);
        this.snackBar.open('Failed to load lorries. Please try again.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.loading = false;
      }
    });
  }

  private loadRecentTrips(): void {
    this.loadingTrips = true;
    // Get trips from the last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    this.tripService.getTrips({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }).subscribe({
      next: (trips) => {
        // Take only the 5 most recent trips
        this.recentTrips = trips.slice(0, 5);
        this.recentTripsCount = trips.length;
        this.loadingTrips = false;
      },
      error: (error) => {
        console.error('Error loading trips:', error);
        // Don't show error for trips as it's not critical for the dashboard
        this.loadingTrips = false;
      }
    });
  }

  private calculateStatistics(): void {
    this.totalLorries = this.lorries.length;
    this.approvedLorries = this.lorries.filter(
      l => l.verificationStatus === LorryVerificationStatus.Approved
    ).length;
    this.pendingLorries = this.lorries.filter(
      l => l.verificationStatus === LorryVerificationStatus.Pending ||
           l.verificationStatus === LorryVerificationStatus.NeedsMoreEvidence
    ).length;
  }

  onRegisterLorry(): void {
    this.router.navigate(['/lorry-owner/register']);
  }

  onViewLorries(): void {
    this.router.navigate(['/lorry-owner/lorries']);
  }

  onViewTrips(): void {
    this.router.navigate(['/lorry-owner/trips']);
  }

  onViewPayments(): void {
    this.router.navigate(['/lorry-owner/payments']);
  }

  getStatusColor(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Approved:
        return 'primary';
      case LorryVerificationStatus.Pending:
        return 'accent';
      case LorryVerificationStatus.Rejected:
        return 'warn';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'accent';
      default:
        return '';
    }
  }

  getStatusLabel(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Approved:
        return 'Approved';
      case LorryVerificationStatus.Pending:
        return 'Pending';
      case LorryVerificationStatus.Rejected:
        return 'Rejected';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'Needs More Evidence';
      default:
        return status;
    }
  }

  onViewLorryDetails(lorry: Lorry): void {
    this.router.navigate(['/lorry-owner/lorries', lorry.lorryId]);
  }
}
