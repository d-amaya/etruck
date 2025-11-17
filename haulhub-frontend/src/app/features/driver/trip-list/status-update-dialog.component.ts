import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Trip, TripStatus } from '@haulhub/shared';

export interface StatusUpdateDialogData {
  trip: Trip;
}

export interface StatusUpdateDialogResult {
  status: TripStatus;
}

@Component({
  selector: 'app-status-update-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>update</mat-icon>
      Update Trip Status
    </h2>
    
    <mat-dialog-content>
      <div class="trip-info">
        <p><strong>Pickup:</strong> {{ data.trip.pickupLocation }}</p>
        <p><strong>Dropoff:</strong> {{ data.trip.dropoffLocation }}</p>
        <p><strong>Current Status:</strong> {{ getStatusLabel(data.trip.status) }}</p>
      </div>

      <form [formGroup]="statusForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>New Status</mat-label>
          <mat-select formControlName="status" required>
            <mat-option *ngFor="let status of allowedStatuses" [value]="status">
              {{ getStatusLabel(status) }}
            </mat-option>
          </mat-select>
          <mat-icon matPrefix>info</mat-icon>
          <mat-error *ngIf="statusForm.get('status')?.hasError('required')">
            Please select a status
          </mat-error>
        </mat-form-field>
      </form>

      <div class="status-info">
        <mat-icon>info</mat-icon>
        <p>As a driver, you can update the status to Picked Up, In Transit, or Delivered.</p>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onSubmit()"
        [disabled]="!statusForm.valid">
        Update Status
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .trip-info {
      margin-bottom: 20px;
      padding: 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }

    .trip-info p {
      margin: 8px 0;
    }

    .full-width {
      width: 100%;
    }

    .status-info {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 16px;
      padding: 12px;
      background-color: #e3f2fd;
      border-radius: 4px;
      color: #1976d2;
    }

    .status-info mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .status-info p {
      margin: 0;
      font-size: 14px;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    mat-dialog-content {
      min-width: 400px;
    }
  `]
})
export class StatusUpdateDialogComponent {
  statusForm: FormGroup;
  allowedStatuses: TripStatus[] = [
    TripStatus.PickedUp,
    TripStatus.InTransit,
    TripStatus.Delivered
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<StatusUpdateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StatusUpdateDialogData
  ) {
    this.statusForm = this.fb.group({
      status: ['', Validators.required]
    });

    // Set default value based on current status
    this.setDefaultStatus();
  }

  private setDefaultStatus(): void {
    const currentStatus = this.data.trip.status;
    
    // Suggest next logical status
    if (currentStatus === TripStatus.Scheduled) {
      this.statusForm.patchValue({ status: TripStatus.PickedUp });
    } else if (currentStatus === TripStatus.PickedUp) {
      this.statusForm.patchValue({ status: TripStatus.InTransit });
    } else if (currentStatus === TripStatus.InTransit) {
      this.statusForm.patchValue({ status: TripStatus.Delivered });
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

  onSubmit(): void {
    if (this.statusForm.valid) {
      const result: StatusUpdateDialogResult = {
        status: this.statusForm.value.status
      };
      this.dialogRef.close(result);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
