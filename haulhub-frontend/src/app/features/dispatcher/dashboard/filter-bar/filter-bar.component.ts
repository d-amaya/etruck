import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { TripStatus, Broker } from '@haulhub/shared';
import { DashboardStateService } from '../dashboard-state.service';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import { PdfExportService } from '../../../../core/services/pdf-export.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule
  ],
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss']
})
export class FilterBarComponent implements OnInit, OnDestroy {
  filterForm: FormGroup;
  statusOptions = Object.values(TripStatus);
  brokers: Broker[] = [];
  activeFilterCount = 0;

  maxDate = new Date();
  minDate = new Date();

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private dashboardState: DashboardStateService,
    private accessibilityService: AccessibilityService,
    private pdfExportService: PdfExportService
  ) {
    // Set min date to 5 years ago
    this.minDate.setFullYear(this.minDate.getFullYear() - 5);

    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      status: [null],
      brokerId: [null],
      lorryId: [''],
      driverName: ['']
    });
  }

  ngOnInit(): void {
    this.brokers = this.dashboardState.getBrokers();

    // Initialize form with current filters from dashboard state
    const currentFilters = this.dashboardState.getCurrentFilters();
    this.filterForm.patchValue({
      startDate: currentFilters.dateRange.startDate,
      endDate: currentFilters.dateRange.endDate,
      status: currentFilters.status,
      brokerId: currentFilters.brokerId,
      lorryId: currentFilters.lorryId || '',
      driverName: currentFilters.driverName || ''
    }, { emitEvent: false }); // Don't emit event on initial load

    // Subscribe to form changes and update dashboard state with debounce
    this.filterForm.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(formValue => {
        console.log('Filter form changed:', formValue);
        this.dashboardState.updateFilters({
          dateRange: {
            startDate: formValue.startDate,
            endDate: formValue.endDate
          },
          status: formValue.status,
          brokerId: formValue.brokerId,
          lorryId: formValue.lorryId?.trim() || null,
          driverName: formValue.driverName?.trim() || null,
          driverId: null // Not used in filter bar
        });
        
        // Complete filter update loading after a short delay
        setTimeout(() => {
          this.dashboardState.completeLoad();
        }, 500);
      });

    // Track active filter count
    this.dashboardState.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.activeFilterCount = this.dashboardState.getActiveFilterCount();
      });
  }

  setDatePreset(preset: string): void {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    let startDate: Date;
    let endDate = today;

    switch (preset) {
      case 'today':
        startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0); // Start of today
        break;
      case 'week':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        startDate.setHours(0, 0, 0, 0); // Start of week
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0); // Start of month
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        startDate.setHours(0, 0, 0, 0); // Start of last month
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999); // End of last month
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0); // Start of year
        break;
      default:
        return;
    }

    this.filterForm.patchValue({ startDate, endDate });
  }

  clearFilters(): void {
    // Get default filters from dashboard state (last 30 days)
    this.dashboardState.clearFilters();
    const defaultFilters = this.dashboardState.getCurrentFilters();
    
    // Apply default filters to form
    this.filterForm.reset({
      startDate: defaultFilters.dateRange.startDate,
      endDate: defaultFilters.dateRange.endDate,
      status: null,
      brokerId: null,
      lorryId: '',
      driverName: ''
    });
  }

  exportPDF(): void {
    this.pdfExportService.exportDashboard();
  }

  getStatusLabel(status: TripStatus): string {
    if (!status) return '';
    // Format status enum to readable label
    return status.replace(/([A-Z])/g, ' $1').trim();
  }

  /**
   * Get ARIA label for filter controls
   */
  getFilterAriaLabel(filterType: string, value?: any): string {
    return this.accessibilityService.getFilterAriaLabel(filterType, value);
  }

  /**
   * Get broker name by ID for accessibility
   */
  getBrokerName(brokerId: string): string {
    if (!brokerId) return '';
    const broker = this.brokers.find(b => b.brokerId === brokerId);
    return broker ? broker.brokerName : '';
  }

  /**
   * Check if a date preset is currently active
   */
  isPresetActive(preset: string): boolean {
    const startDate = this.filterForm.get('startDate')?.value;
    const endDate = this.filterForm.get('endDate')?.value;
    
    if (!startDate || !endDate) return false;

    const today = new Date();
    let expectedStart: Date;
    let expectedEnd = today;

    switch (preset) {
      case 'today':
        expectedStart = today;
        break;
      case 'week':
        expectedStart = new Date(today);
        expectedStart.setDate(today.getDate() - today.getDay());
        break;
      case 'month':
        expectedStart = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        expectedStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        expectedEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'year':
        expectedStart = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return false;
    }

    return startDate.toDateString() === expectedStart.toDateString() &&
           endDate.toDateString() === expectedEnd.toDateString();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
