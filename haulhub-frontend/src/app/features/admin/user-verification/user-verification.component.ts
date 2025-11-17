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
import { User, VerificationStatus, UserRole } from '@haulhub/shared';
import { UserVerificationDialogComponent } from './user-verification-dialog/user-verification-dialog.component';

@Component({
  selector: 'app-user-verification',
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
  templateUrl: './user-verification.component.html',
  styleUrls: ['./user-verification.component.scss']
})
export class UserVerificationComponent implements OnInit {
  loading = true;
  error: string | null = null;
  users: User[] = [];
  displayedColumns: string[] = ['fullName', 'email', 'phoneNumber', 'role', 'status', 'createdAt', 'actions'];

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadPendingUsers();
  }

  loadPendingUsers(): void {
    this.loading = true;
    this.error = null;

    this.adminService.getPendingUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading pending users:', error);
        this.error = 'Failed to load pending users. Please try again.';
        this.loading = false;
        this.snackBar.open('Failed to load pending users', 'Close', { duration: 3000 });
      }
    });
  }

  getStatusColor(status: VerificationStatus): string {
    switch (status) {
      case VerificationStatus.Pending:
        return 'accent';
      case VerificationStatus.Rejected:
        return 'warn';
      case VerificationStatus.Verified:
        return 'primary';
      default:
        return 'primary';
    }
  }

  getRoleLabel(role: UserRole): string {
    switch (role) {
      case UserRole.Dispatcher:
        return 'Dispatcher';
      case UserRole.LorryOwner:
        return 'Lorry Owner';
      case UserRole.Driver:
        return 'Driver';
      case UserRole.Admin:
        return 'Admin';
      default:
        return role;
    }
  }

  openVerificationDialog(user: User): void {
    const dialogRef = this.dialog.open(UserVerificationDialogComponent, {
      width: '500px',
      data: { user }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.verifyUser(user.userId, result.decision, result.reason);
      }
    });
  }

  verifyUser(userId: string, decision: 'Verified' | 'Rejected', reason?: string): void {
    this.adminService.verifyUser(userId, decision, reason).subscribe({
      next: () => {
        this.snackBar.open(`User ${decision.toLowerCase()} successfully`, 'Close', { duration: 3000 });
        this.loadPendingUsers(); // Refresh the list
      },
      error: (error) => {
        console.error('Error verifying user:', error);
        this.snackBar.open('Failed to verify user. Please try again.', 'Close', { duration: 3000 });
      }
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
