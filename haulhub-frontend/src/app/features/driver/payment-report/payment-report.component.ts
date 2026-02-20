import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { TripService } from '../../../core/services';
import { DriverPaymentReport, PaymentReportFilters, TripPaymentDetail } from '../../../core/services/trip.service';

@Component({
  selector: 'app-driver-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatExpansionModule,
    MatDividerModule
  ],
  templateUrl: './payment-report.component.html',
  styleUrls: ['./payment-report.component.scss']
})
export class PaymentReportComponent implements OnInit {
  filterForm: FormGroup;
  loading = false;
  report: DriverPaymentReport | null = null;
  
  displayedColumns: string[] = [
    'scheduledTimestamp',
    'pickupCity',
    'deliveryCity',
    'truckId',
    'brokerName',
    'driverPayment',
    'mileageOrder',
    'orderStatus'
  ];

  constructor(
    private tripService: TripService,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    });
  }

  ngOnInit(): void {
    // Load report with default date range (current month)
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    this.filterForm.patchValue({
      startDate,
      endDate
    });
    
    this.loadReport();
  }

  loadReport(): void {
    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getPaymentReport(filters).subscribe({
      next: (report) => {
        this.report = report as DriverPaymentReport;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading payment report:', error);
        this.loading = false;
      }
    });
  }

  private buildFilters(): PaymentReportFilters {
    const formValue = this.filterForm.value;
    const filters: PaymentReportFilters = {
      // groupBy: 'dispatcher'
    };

    if (formValue.startDate) {
      const d = new Date(formValue.startDate);
      filters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }

    if (formValue.endDate) {
      const d = new Date(formValue.endDate);
      filters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    return filters;
  }

  onApplyFilters(): void {
    this.loadReport();
  }

  onClearFilters(): void {
    this.filterForm.reset({
      startDate: null,
      endDate: null
    });
    this.loadReport();
  }

  getDispatcherEntries(): Array<{ dispatcherId: string; data: { totalPayment: number; tripCount: number } }> {
    if (!this.report?.groupedByDispatcher) {
      return [];
    }
    
    return Object.entries((this.report as any).groupedByDispatcher).map(([dispatcherId, data]: any) => ({
      dispatcherId,
      data
    }));
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDistance(distance?: number): string {
    if (!distance) {
      return 'N/A';
    }
    return `${distance.toFixed(1)} mi`;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'Scheduled':
        return 'Scheduled';
      case 'PickedUp':
        return 'Picked Up';
      case 'InTransit':
        return 'In Transit';
      case 'Delivered':
        return 'Delivered';
      case 'Paid':
        return 'Paid';
      default:
        return status;
    }
  }

  hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(formValue.startDate || formValue.endDate);
  }
}
