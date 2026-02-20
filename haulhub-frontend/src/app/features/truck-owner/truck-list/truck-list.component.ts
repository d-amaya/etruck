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
import { Truck } from '@haulhub/shared';
const VehicleVerificationStatus = { Approved: 'Approved', Pending: 'Pending', Rejected: 'Rejected', NeedsMoreEvidence: 'NeedsMoreEvidence' } as const;
type VehicleVerificationStatus = typeof VehicleVerificationStatus[keyof typeof VehicleVerificationStatus];

@Component({
  selector: 'app-truck-list',
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
  templateUrl: './truck-list.component.html',
  styleUrls: ['./truck-list.component.scss']
})
export class TruckListComponent implements OnInit {
  trucks: Truck[] = [];
  loading = false;
  displayedColumns: string[] = ['plate', 'brand', 'year', 'color', 'verificationStatus', 'isActive', 'actions'];

  constructor(
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTrucks();
  }

  loadTrucks(): void {
    this.loading = true;
    // TODO: Call API to load trucks
    // For now, use empty array
    setTimeout(() => {
      this.trucks = [];
      this.loading = false;
    }, 500);
  }

  onRegisterTruck(): void {
    this.router.navigate(['/truck-owner/trucks/register']);
  }

  onViewTruck(truck: Truck): void {
    this.router.navigate(['/truck-owner/trucks', truck.truckId]);
  }

  onToggleActive(truck: Truck, event: MatSlideToggleChange): void {
    const newStatus = event.checked;
    
    // TODO: Call API to update truck active status
    setTimeout(() => {
      truck.isActive = newStatus;
      this.snackBar.open(
        `Truck ${newStatus ? 'activated' : 'deactivated'} successfully`,
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
