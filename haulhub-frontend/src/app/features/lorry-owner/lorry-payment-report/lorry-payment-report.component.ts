import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TripService } from '../../../core/services/trip.service';
import { LorryOwnerPaymentReport, PaymentReportFilters } from '@haulhub/shared';

@Component({
  selector: 'app-lorry-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './lorry-payment-report.component.html',
  styleUrls: ['./lorry-payment-report.component.scss']
})
export class LorryPaymentReportComponent implements OnInit {
  filterForm: FormGroup;
  report: LorryOwnerPaymentReport | null = null;
  loading = false;

  // Table columns
  tripColumns: string[] = [
    'scheduledPickupDatetime',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'lorryId',
    'driverName',
    'lorryOwnerPayment',
    'status'
  ];

  lorryColumns: string[] = ['lorryId', 'totalPayment', 'tripCount'];
  dispatcherColumns: string[] = ['dispatcherId', 'totalPayment', 'tripCount'];

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    });
  }

  ngOnInit(): void {
    // Set default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.filterForm.patchValue({
      startDate: firstDay,
      endDate: lastDay
    });

    this.loadReport();
  }

  loadReport(): void {
    if (this.filterForm.invalid) {
      return;
    }

    this.loading = true;
    const formValue = this.filterForm.value;
    
    const filters: PaymentReportFilters = {};
    
    if (formValue.startDate) {
      filters.startDate = formValue.startDate.toISOString();
    }
    
    if (formValue.endDate) {
      filters.endDate = formValue.endDate.toISOString();
    }

    this.tripService.getPaymentReport(filters).subscribe({
      next: (report) => {
        this.report = report as LorryOwnerPaymentReport;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading payment report:', error);
        this.snackBar.open('Failed to load payment report', 'Close', {
          duration: 3000
        });
        this.loading = false;
      }
    });
  }

  onFilterSubmit(): void {
    this.loadReport();
  }

  onClearFilters(): void {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.filterForm.patchValue({
      startDate: firstDay,
      endDate: lastDay
    });
    
    this.loadReport();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getLorryGroupedData(): Array<{ lorryId: string; totalPayment: number; tripCount: number }> {
    if (!this.report?.groupedByLorry) {
      return [];
    }
    
    return Object.entries(this.report.groupedByLorry).map(([lorryId, data]) => ({
      lorryId,
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
  }

  getDispatcherGroupedData(): Array<{ dispatcherId: string; totalPayment: number; tripCount: number }> {
    if (!this.report?.groupedByDispatcher) {
      return [];
    }
    
    return Object.entries(this.report.groupedByDispatcher).map(([dispatcherId, data]) => ({
      dispatcherId,
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
  }
}
