import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Broker } from '@haulhub/shared';

export interface EditBrokerDialogData {
  broker: Broker;
}

export interface EditBrokerDialogResult {
  brokerName: string;
  isActive: boolean;
}

@Component({
  selector: 'app-edit-broker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule
  ],
  templateUrl: './edit-broker-dialog.component.html',
  styleUrls: ['./edit-broker-dialog.component.scss']
})
export class EditBrokerDialogComponent {
  brokerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<EditBrokerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditBrokerDialogData
  ) {
    this.brokerForm = this.fb.group({
      brokerName: [data.broker.brokerName, [Validators.required, Validators.minLength(2)]],
      isActive: [data.broker.isActive]
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.brokerForm.valid) {
      const result: EditBrokerDialogResult = {
        brokerName: this.brokerForm.value.brokerName.trim(),
        isActive: this.brokerForm.value.isActive
      };
      this.dialogRef.close(result);
    }
  }

  getErrorMessage(fieldName: string): string {
    const field = this.brokerForm.get(fieldName);
    if (field?.hasError('required')) {
      return 'This field is required';
    }
    if (field?.hasError('minlength')) {
      return 'Broker name must be at least 2 characters';
    }
    return '';
  }
}
