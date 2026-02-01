import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Trailer, VehicleVerificationStatus } from '@haulhub/shared';

@Component({
  selector: 'app-trailer-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule
  ],
  templateUrl: './trailer-list.component.html',
  styleUrls: ['./trailer-list.component.scss']
})
export class TrailerListComponent implements OnInit {
  trailers: Trailer[] = [];
  loading = false;
  displayedColumns: string[] = ['plate', 'brand', 'year', 'color', 'reefer', 'verificationStatus', 'isActive', 'actions'];

  constructor(
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTrailers();
  }

  loadTrailers(): void {
    this.loading = true;
    // TODO: Call API to load trailers
    // For now, use empty array
    setTimeout(() => {
      this.trailers = [];
      this.loading = false;
    }, 500);
  }

  onRegisterTrailer(): void {
    this.router.navigate(['/truck-owner/trailers/register']);
  }

  onViewTrailer(trailer: Trailer): void {
    this.router.navigate(['/truck-owner/trailers', trailer.trailerId]);
  }

  onToggleActive(trailer: Trailer, event: MatSlideToggleChange): void {
    const newStatus = event.checked;
    
    // TODO: Call API to update trailer active status
    setTimeout(() => {
      trailer.isActive = newStatus;
      this.snackBar.open(
        `Trailer ${newStatus ? 'activated' : 'deactivated'} successfully`,
        'Close',
        { duration: 3000 }
      );
    }, 500);
  }

  getVerificationStatusColor(status: VehicleVerificationStatus): string {
    switch (status) {
      case VehicleVerificationStatus.Approved:
        return 'primary';
      case VehicleVerificationStatus.Pending:
        return 'accent';
      case VehicleVerificationStatus.Rejected:
        return 'warn';
      case VehicleVerificationStatus.NeedsMoreEvidence:
        return 'warn';
      default:
        return '';
    }
  }

  getVerificationStatusLabel(status: VehicleVerificationStatus): string {
    switch (status) {
      case VehicleVerificationStatus.Approved:
        return 'Approved';
      case VehicleVerificationStatus.Pending:
        return 'Pending';
      case VehicleVerificationStatus.Rejected:
        return 'Rejected';
      case VehicleVerificationStatus.NeedsMoreEvidence:
        return 'Needs More Evidence';
      default:
        return status;
    }
  }
}
