import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { LorryService } from '../../../../core/services';
import { Lorry, UploadDocumentDto } from '@haulhub/shared';

@Component({
  selector: 'app-upload-document-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './upload-document-dialog.component.html',
  styleUrls: ['./upload-document-dialog.component.scss']
})
export class UploadDocumentDialogComponent {
  selectedFile: File | null = null;
  fileError: string | null = null;
  uploading = false;
  maxFileSize = 10 * 1024 * 1024; // 10MB in bytes

  constructor(
    public dialogRef: MatDialogRef<UploadDocumentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { lorry: Lorry },
    private lorryService: LorryService,
    private snackBar: MatSnackBar
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Validate file size
      if (file.size > this.maxFileSize) {
        this.fileError = 'File size must not exceed 10MB';
        this.selectedFile = null;
        input.value = '';
        return;
      }

      // Validate file type (accept common document formats)
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        this.fileError = 'Please upload a PDF, Word document, or image file (JPG, PNG)';
        this.selectedFile = null;
        input.value = '';
        return;
      }

      this.selectedFile = file;
      this.fileError = null;
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.fileError = null;
    // Reset file input
    const fileInput = document.getElementById('dialogFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  onUpload(): void {
    if (!this.selectedFile) {
      this.fileError = 'Please select a file to upload';
      return;
    }

    const uploadDto: UploadDocumentDto = {
      fileName: this.selectedFile.name,
      fileSize: this.selectedFile.size,
      contentType: this.selectedFile.type
    };

    this.uploading = true;

    // Request presigned URL
    this.lorryService.requestDocumentUploadUrl(this.data.lorry.lorryId, uploadDto).subscribe({
      next: (response) => {
        // Upload file to S3 using presigned URL
        this.lorryService.uploadDocumentToS3(response.uploadUrl, this.selectedFile!).subscribe({
          next: () => {
            this.uploading = false;
            this.snackBar.open('Document uploaded successfully!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.dialogRef.close(true);
          },
          error: (error) => {
            console.error('Error uploading document to S3:', error);
            this.snackBar.open('Failed to upload document. Please try again.', 'Close', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.uploading = false;
          }
        });
      },
      error: (error) => {
        console.error('Error requesting upload URL:', error);
        const errorMessage = error.error?.message || 'Failed to prepare upload. Please try again.';
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.uploading = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  get fileSizeDisplay(): string {
    if (!this.selectedFile) return '';
    const sizeInMB = this.selectedFile.size / (1024 * 1024);
    return `${sizeInMB.toFixed(2)} MB`;
  }
}
