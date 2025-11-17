import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminService } from '../../../core/services/admin.service';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';
import { VerificationDialogComponent } from './verification-dialog/verification-dialog.component';
import { DocumentViewerDialogComponent } from './document-viewer-dialog/document-viewer-dialog.component';

@Component({
  selector: 'app-lorry-verification',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './lorry-verification.component.html',
  styleUrls: ['./lorry-verification.component.scss']
})
export class LorryVerificationComponent implements OnInit {
  loading = true;
  error: string | null = null;
  lorries: Lorry[] = [];
  displayedColumns: string[] = ['lorryId', 'make', 'model', 'year', 'ownerId', 'status', 'documents', 'actions'];

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadPendingLorries();
  }

  loadPendingLorries(): void {
    this.loading = true;
    this.error = null;

    this.adminService.getPendingLorries().subscribe({
      next: (lorries) => {
        this.lorries = lorries;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading pending lorries:', error);
        this.error = 'Failed to load pending lorries. Please try again.';
        this.loading = false;
        this.snackBar.open('Failed to load pending lorries', 'Close', { duration: 3000 });
      }
    });
  }

  getStatusColor(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Pending:
        return 'accent';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'warn';
      default:
        return 'primary';
    }
  }

  viewDocuments(lorry: Lorry): void {
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '800px',
      data: { lorry }
    });
  }

  openVerificationDialog(lorry: Lorry): void {
    const dialogRef = this.dialog.open(VerificationDialogComponent, {
      width: '500px',
      data: { lorry }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.verifyLorry(lorry.lorryId, result.decision, result.reason);
      }
    });
  }

  verifyLorry(lorryId: string, decision: 'Approved' | 'Rejected' | 'NeedsMoreEvidence', reason?: string): void {
    this.adminService.verifyLorry(lorryId, decision, reason).subscribe({
      next: () => {
        this.snackBar.open(`Lorry ${decision.toLowerCase()} successfully`, 'Close', { duration: 3000 });
        this.loadPendingLorries(); // Refresh the list
      },
      error: (error) => {
        console.error('Error verifying lorry:', error);
        this.snackBar.open('Failed to verify lorry. Please try again.', 'Close', { duration: 3000 });
      }
    });
  }
}
