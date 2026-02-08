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

  constructor(
    private fb: FormBuilder,
    private assetCache: DriverAssetCacheService,
    public dialogRef: MatDialogRef<DriverTripEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { trip: any }
  ) {
    this.editForm = this.fb.group({
      status: [data.trip.orderStatus || data.trip.status, Validators.required],
      notes: [data.trip.notes || '']
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
      this.dialogRef.close(this.editForm.value);
    }
  }
}
