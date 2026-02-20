import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
type Lorry = any;
type LorryDocumentMetadata = any;
import { AdminService } from '../../../../core/services/admin.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface DocumentViewerDialogData {
  lorry: Lorry;
}

@Component({
  selector: 'app-document-viewer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatSnackBarModule
  ],
  templateUrl: './document-viewer-dialog.component.html',
  styleUrls: ['./document-viewer-dialog.component.scss']
})
export class DocumentViewerDialogComponent implements OnInit {
  selectedDocument: LorryDocumentMetadata | null = null;
  documentUrl: SafeResourceUrl | null = null;
  loading = false;
  error: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<DocumentViewerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DocumentViewerDialogData,
    private adminService: AdminService,
    private sanitizer: DomSanitizer,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Auto-select first document if available
    if (this.data.lorry.verificationDocuments.length > 0) {
      this.selectDocument(this.data.lorry.verificationDocuments[0]);
    }
  }

  selectDocument(document: LorryDocumentMetadata): void {
    this.selectedDocument = document;
    this.loading = true;
    this.error = null;
    this.documentUrl = null;

    this.adminService.getDocumentViewUrl(this.data.lorry.lorryId, document.documentId).subscribe({
      next: (response) => {
        this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(response.url);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading document:', error);
        this.error = 'Failed to load document. Please try again.';
        this.loading = false;
        this.snackBar.open('Failed to load document', 'Close', { duration: 3000 });
      }
    });
  }

  openInNewTab(): void {
    if (this.selectedDocument) {
      this.adminService.getDocumentViewUrl(this.data.lorry.lorryId, this.selectedDocument.documentId).subscribe({
        next: (response) => {
          window.open(response.url, '_blank');
        },
        error: (error) => {
          console.error('Error opening document:', error);
          this.snackBar.open('Failed to open document', 'Close', { duration: 3000 });
        }
      });
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  isImageFile(contentType: string): boolean {
    return contentType.startsWith('image/');
  }

  isPdfFile(contentType: string): boolean {
    return contentType === 'application/pdf';
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
