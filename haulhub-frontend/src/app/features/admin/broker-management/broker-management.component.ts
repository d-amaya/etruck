import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminService } from '../../../core/services/admin.service';
import { Broker } from '@haulhub/shared';
import { AddBrokerDialogComponent } from './add-broker-dialog/add-broker-dialog.component';
import { EditBrokerDialogComponent } from './edit-broker-dialog/edit-broker-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-broker-management',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './broker-management.component.html',
  styleUrls: ['./broker-management.component.scss']
})
export class BrokerManagementComponent implements OnInit {
  loading = true;
  error: string | null = null;
  brokers: Broker[] = [];
  displayedColumns: string[] = ['brokerName', 'brokerId', 'isActive', 'createdAt', 'actions'];

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadBrokers();
  }

  loadBrokers(): void {
    this.loading = true;
    this.error = null;

    this.adminService.getAllBrokers(false).subscribe({
      next: (brokers) => {
        this.brokers = brokers;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading brokers:', error);
        this.error = 'Failed to load brokers. Please try again.';
        this.loading = false;
        this.snackBar.open('Failed to load brokers', 'Close', { duration: 3000 });
      }
    });
  }

  getStatusColor(isActive: boolean): string {
    return isActive ? 'primary' : 'warn';
  }

  getStatusLabel(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  openAddBrokerDialog(): void {
    const dialogRef = this.dialog.open(AddBrokerDialogComponent, {
      width: '400px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createBroker(result.brokerName);
      }
    });
  }

  openEditBrokerDialog(broker: Broker): void {
    const dialogRef = this.dialog.open(EditBrokerDialogComponent, {
      width: '400px',
      data: { broker }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateBroker(broker.brokerId, result.brokerName, result.isActive);
      }
    });
  }

  openDeleteConfirmDialog(broker: Broker): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Broker',
        message: `Are you sure you want to delete "${broker.brokerName}"? This will mark the broker as inactive. Historical trip data will be preserved.`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteBroker(broker.brokerId);
      }
    });
  }

  createBroker(brokerName: string): void {
    this.adminService.createBroker(brokerName).subscribe({
      next: () => {
        this.snackBar.open('Broker created successfully', 'Close', { duration: 3000 });
        this.loadBrokers(); // Refresh the list
      },
      error: (error) => {
        console.error('Error creating broker:', error);
        this.snackBar.open('Failed to create broker. Please try again.', 'Close', { duration: 3000 });
      }
    });
  }

  updateBroker(brokerId: string, brokerName?: string, isActive?: boolean): void {
    this.adminService.updateBroker(brokerId, brokerName, isActive).subscribe({
      next: () => {
        this.snackBar.open('Broker updated successfully', 'Close', { duration: 3000 });
        this.loadBrokers(); // Refresh the list
      },
      error: (error) => {
        console.error('Error updating broker:', error);
        this.snackBar.open('Failed to update broker. Please try again.', 'Close', { duration: 3000 });
      }
    });
  }

  deleteBroker(brokerId: string): void {
    this.adminService.deleteBroker(brokerId).subscribe({
      next: () => {
        this.snackBar.open('Broker deleted successfully', 'Close', { duration: 3000 });
        this.loadBrokers(); // Refresh the list
      },
      error: (error) => {
        console.error('Error deleting broker:', error);
        this.snackBar.open('Failed to delete broker. Please try again.', 'Close', { duration: 3000 });
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
