import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { LorryService } from '../../../core/services';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';
import { UploadDocumentDialogComponent } from './upload-document-dialog/upload-document-dialog.component';

@Component({
  selector: 'app-lorry-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './lorry-list.component.html',
  styleUrls: ['./lorry-list.component.scss']
})
export class LorryListComponent implements OnInit {
  lorries: Lorry[] = [];
  loading = true;
  displayedColumns: string[] = ['lorryId', 'make', 'model', 'year', 'status', 'documents', 'actions'];
  LorryVerificationStatus = LorryVerificationStatus;

  constructor(
    private lorryService: LorryService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadLorries();
  }

  private loadLorries(): void {
    this.loading = true;
    this.lorryService.getLorries().subscribe({
      next: (lorries) => {
        this.lorries = lorries;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading lorries:', error);
        this.snackBar.open('Failed to load lorries. Please try again.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.loading = false;
      }
    });
  }

  getStatusColor(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Approved:
        return 'primary';
      case LorryVerificationStatus.Pending:
        return 'accent';
      case LorryVerificationStatus.Rejected:
        return 'warn';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'accent';
      default:
        return '';
    }
  }

  getStatusLabel(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Approved:
        return 'Approved';
      case LorryVerificationStatus.Pending:
        return 'Pending';
      case LorryVerificationStatus.Rejected:
        return 'Rejected';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'Needs More Evidence';
      default:
        return status;
    }
  }

  getStatusIcon(status: LorryVerificationStatus): string {
    switch (status) {
      case LorryVerificationStatus.Approved:
        return 'check_circle';
      case LorryVerificationStatus.Pending:
        return 'schedule';
      case LorryVerificationStatus.Rejected:
        return 'cancel';
      case LorryVerificationStatus.NeedsMoreEvidence:
        return 'info';
      default:
        return 'help';
    }
  }

  canUploadDocuments(lorry: Lorry): boolean {
    return lorry.verificationStatus === LorryVerificationStatus.Pending ||
           lorry.verificationStatus === LorryVerificationStatus.NeedsMoreEvidence ||
           lorry.verificationStatus === LorryVerificationStatus.Rejected;
  }

  onUploadDocuments(lorry: Lorry): void {
    const dialogRef = this.dialog.open(UploadDocumentDialogComponent, {
      width: '500px',
      data: { lorry }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Reload lorries to get updated document list
        this.loadLorries();
      }
    });
  }

  onViewTrips(lorry: Lorry): void {
    // Navigate to trips list filtered by this lorry
    this.router.navigate(['/lorry-owner/trips'], {
      queryParams: { lorryId: lorry.lorryId }
    });
  }

  onRegisterNewLorry(): void {
    this.router.navigate(['/lorry-owner/register']);
  }

  onBackToDashboard(): void {
    this.router.navigate(['/lorry-owner/dashboard']);
  }

  getDocumentCount(lorry: Lorry): number {
    return lorry.verificationDocuments?.length || 0;
  }

  hasRejectionReason(lorry: Lorry): boolean {
    return !!lorry.rejectionReason && lorry.verificationStatus === LorryVerificationStatus.Rejected;
  }

  getRejectionTooltip(lorry: Lorry): string {
    return lorry.rejectionReason || '';
  }
}
