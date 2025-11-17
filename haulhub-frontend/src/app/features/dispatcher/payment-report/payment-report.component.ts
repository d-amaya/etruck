import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TripService } from '../../../core/services/trip.service';
import { DispatcherPaymentReport, PaymentReportFilters } from '@haulhub/shared';

@Component({
  selector: 'app-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './payment-report.component.html',
  styleUrls: ['./payment-report.component.scss']
})
export class PaymentReportComponent implements OnInit {
  filterForm: FormGroup;
  report: DispatcherPaymentReport | null = null;
  loading = false;
  activeTabIndex = 0; // Initialize to 0 for "By Broker" tab (first tab)

  // Table columns
  tripColumns: string[] = [
    'scheduledPickupDatetime',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'lorryId',
    'driverName',
    'brokerPayment',
    'lorryOwnerPayment',
    'driverPayment',
    'status'
  ];

  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  lorryColumns: string[] = ['lorryId', 'totalPayment', 'tripCount'];

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private snackBar: MatSnackBar,
    private router: Router
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

    // Add groupBy based on active tab
    if (this.activeTabIndex === 0) {
      filters.groupBy = 'broker';
    } else if (this.activeTabIndex === 1) {
      filters.groupBy = 'driver';
    } else if (this.activeTabIndex === 2) {
      filters.groupBy = 'lorry';
    }
    // activeTabIndex === 3 is "Trip Details" tab, no groupBy needed

    this.tripService.getPaymentReport(filters).subscribe({
      next: (report) => {
        this.report = report as DispatcherPaymentReport;
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

  onTabChange(event: MatTabChangeEvent): void {
    this.activeTabIndex = event.index;
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

  getBrokerGroupedData(): Array<{ brokerId: string; brokerName: string; totalPayment: number; tripCount: number }> {
    if (!this.report?.groupedByBroker) {
      return [];
    }
    
    return Object.entries(this.report.groupedByBroker).map(([brokerId, data]) => ({
      brokerId,
      brokerName: data.brokerName,
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
  }

  getDriverGroupedData(): Array<{ driverId: string; driverName: string; totalPayment: number; tripCount: number }> {
    if (!this.report?.groupedByDriver) {
      return [];
    }
    
    return Object.entries(this.report.groupedByDriver).map(([driverId, data]) => ({
      driverId,
      driverName: data.driverName,
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
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

  goBack(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }
}
