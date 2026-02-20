import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Order, OrderStatus } from '@haulhub/shared';

export interface StatusUpdateDialogData {
  trip: Order;
}

export interface StatusUpdateDialogResult {
  status: OrderStatus;
  deliveryTimestamp?: string;
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
    MatIconModule,
    MatInputModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>update</mat-icon>
      Update Trip Status
    </h2>
    
    <mat-dialog-content>
      <div class="trip-info">
        <p><strong>Pickup:</strong> {{ data.trip.pickupCity }}, {{ data.trip.pickupState }}</p>
        <p><strong>Delivery:</strong> {{ data.trip.deliveryCity }}, {{ data.trip.deliveryState }}</p>
        <p><strong>Current Status:</strong> {{ getStatusLabel(data.trip.orderStatus) }}</p>
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

        <mat-form-field *ngIf="statusForm.get('status')?.value === deliveredStatus" 
                        appearance="outline" class="full-width">
          <mat-label>Delivery Date & Time</mat-label>
          <input matInput type="datetime-local" formControlName="deliveryTimestamp">
          <mat-hint>When the delivery was completed</mat-hint>
          <mat-error *ngIf="statusForm.get('deliveryTimestamp')?.hasError('required')">
            Delivery date & time is required
          </mat-error>
        </mat-form-field>
      </form>

      <div class="status-info">
        <mat-icon>info</mat-icon>
        <p>As a driver, you can update the status to Picked Up, In Transit, or Delivered. Timestamps will be automatically recorded.</p>
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
  allowedStatuses: OrderStatus[] = [
    OrderStatus.PickingUp,
    OrderStatus.Transit,
    OrderStatus.Delivered
  ];
  deliveredStatus = OrderStatus.Delivered;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<StatusUpdateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StatusUpdateDialogData
  ) {
    this.statusForm = this.fb.group({
      status: ['', Validators.required],
      deliveryTimestamp: ['']
    });

    // Set default value based on current status
    this.setDefaultStatus();

    // Add/remove deliveryTimestamp validation when status changes
    this.statusForm.get('status')?.valueChanges.subscribe(status => {
      const ctrl = this.statusForm.get('deliveryTimestamp')!;
      if (status === OrderStatus.Delivered) {
        ctrl.setValidators(Validators.required);
      } else {
        ctrl.clearValidators();
        ctrl.setValue('');
      }
      ctrl.updateValueAndValidity();
    });
  }

  private setDefaultStatus(): void {
    const currentStatus = this.data.trip.orderStatus;
    
    // Suggest next logical status
    if (currentStatus === OrderStatus.Scheduled) {
      this.statusForm.patchValue({ status: OrderStatus.PickingUp });
    } else if (currentStatus === OrderStatus.PickingUp) {
      this.statusForm.patchValue({ status: OrderStatus.Transit });
    } else if (currentStatus === OrderStatus.Transit) {
      this.statusForm.patchValue({ status: OrderStatus.Delivered });
    }
  }

  getStatusLabel(status: string): string {
    return status;
  }

  onSubmit(): void {
    if (this.statusForm.valid) {
      const result: StatusUpdateDialogResult = {
        status: this.statusForm.value.status
      };
      if (this.statusForm.value.deliveryTimestamp) {
        result.deliveryTimestamp = new Date(this.statusForm.value.deliveryTimestamp).toISOString().split('.')[0] + 'Z';
      }
      this.dialogRef.close(result);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
