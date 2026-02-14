import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DriverAssetCacheService } from '../../driver-asset-cache.service';

@Component({
  selector: 'app-driver-trip-edit-dialog',
  templateUrl: './driver-trip-edit-dialog.component.html',
  styleUrls: ['./driver-trip-edit-dialog.component.scss']
})
export class DriverTripEditDialogComponent {
  editForm: FormGroup;
  statusOptions = ['Scheduled', 'Picked Up', 'In Transit', 'Delivered'];
  deliveredStatus = 'Delivered';

  constructor(
    private fb: FormBuilder,
    private assetCache: DriverAssetCacheService,
    public dialogRef: MatDialogRef<DriverTripEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { trip: any }
  ) {
    this.editForm = this.fb.group({
      status: [data.trip.orderStatus || data.trip.status, Validators.required],
      deliveryTimestamp: ['']
    });

    // Add/remove deliveryTimestamp validation when status changes
    this.editForm.get('status')?.valueChanges.subscribe(status => {
      const ctrl = this.editForm.get('deliveryTimestamp')!;
      if (status === 'Delivered') {
        ctrl.setValidators(Validators.required);
      } else {
        ctrl.clearValidators();
        ctrl.setValue('');
      }
      ctrl.updateValueAndValidity();
    });
  }

  get trip() {
    return this.data.trip;
  }

  getTruckDisplay(): string {
    return this.assetCache.getTruckName(this.trip.truckId);
  }

  getTrailerDisplay(): string {
    return this.assetCache.getTrailerName(this.trip.trailerId);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.editForm.valid) {
      const result: any = {
        status: this.editForm.value.status
      };
      if (this.editForm.value.deliveryTimestamp) {
        result.deliveryTimestamp = new Date(this.editForm.value.deliveryTimestamp).toISOString().split('.')[0] + 'Z';
      }
      this.dialogRef.close(result);
    }
  }
}
