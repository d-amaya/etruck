import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface SaveSearchDialogData {
  entityType: string;
  filters: any;
}

export interface SaveSearchDialogResult {
  name: string;
  description?: string;
  isDefault: boolean;
}

@Component({
  selector: 'app-save-search-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule
  ],
  templateUrl: './save-search-dialog.component.html',
  styleUrls: ['./save-search-dialog.component.scss']
})
export class SaveSearchDialogComponent {
  saveForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<SaveSearchDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SaveSearchDialogData
  ) {
    this.saveForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', Validators.maxLength(200)],
      isDefault: [false]
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.saveForm.valid) {
      this.dialogRef.close(this.saveForm.value);
    }
  }

  getEntityTypeLabel(): string {
    switch (this.data.entityType) {
      case 'trip':
        return 'trips';
      case 'driver':
        return 'drivers';
      case 'truck':
        return 'trucks';
      case 'trailer':
        return 'trailers';
      case 'invoice':
        return 'invoices';
      default:
        return 'items';
    }
  }
}
