import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Lorry } from '@haulhub/shared';

export interface VerificationDialogData {
  lorry: Lorry;
}

export interface VerificationDialogResult {
  decision: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
  reason?: string;
}

@Component({
  selector: 'app-verification-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule
  ],
  templateUrl: './verification-dialog.component.html',
  styleUrls: ['./verification-dialog.component.scss']
})
export class VerificationDialogComponent {
  verificationForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<VerificationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VerificationDialogData
  ) {
    this.verificationForm = this.fb.group({
      decision: ['', Validators.required],
      reason: ['']
    });

    // Add validator for reason when decision is Rejected or NeedsMoreEvidence
    this.verificationForm.get('decision')?.valueChanges.subscribe(decision => {
      const reasonControl = this.verificationForm.get('reason');
      if (decision === 'Rejected' || decision === 'NeedsMoreEvidence') {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      reasonControl?.updateValueAndValidity();
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.verificationForm.valid) {
      const result: VerificationDialogResult = {
        decision: this.verificationForm.value.decision,
        reason: this.verificationForm.value.reason || undefined
      };
      this.dialogRef.close(result);
    }
  }

  isReasonRequired(): boolean {
    const decision = this.verificationForm.get('decision')?.value;
    return decision === 'Rejected' || decision === 'NeedsMoreEvidence';
  }
}
