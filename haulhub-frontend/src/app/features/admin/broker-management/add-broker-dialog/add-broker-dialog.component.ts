import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface AddBrokerDialogResult {
  brokerName: string;
}

@Component({
  selector: 'app-add-broker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './add-broker-dialog.component.html',
  styleUrls: ['./add-broker-dialog.component.scss']
})
export class AddBrokerDialogComponent {
  brokerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<AddBrokerDialogComponent>
  ) {
    this.brokerForm = this.fb.group({
      brokerName: ['', [Validators.required, Validators.minLength(2)]]
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.brokerForm.valid) {
      const result: AddBrokerDialogResult = {
        brokerName: this.brokerForm.value.brokerName.trim()
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
