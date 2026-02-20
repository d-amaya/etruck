import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { AdminDashboardStateService, LoadingState, ErrorState } from './admin-state.service';
import { AdminFilterService } from './admin-filter.service';
import { AdminOrderTableComponent } from './admin-order-table/admin-order-table.component';
import { AdminAnalyticsWrapperComponent } from './admin-analytics-wrapper.component';
import { AdminPaymentsWrapperComponent } from './admin-payments-wrapper.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingOverlayComponent } from '../../../shared/components/loading-overlay/loading-overlay.component';
import { TripTableSkeletonComponent } from '../../../shared/components/skeleton-loader/trip-table-skeleton.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatProgressSpinnerModule, MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule,
    AdminOrderTableComponent, AdminAnalyticsWrapperComponent, AdminPaymentsWrapperComponent,
    ErrorStateComponent, LoadingOverlayComponent, TripTableSkeletonComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  loadingState: LoadingState = { isLoading: false, isInitialLoad: false, isFilterUpdate: false, loadingMessage: 'Loading...' };
  errorState: ErrorState = { hasError: false, errorMessage: '', canRetry: false, retryCount: 0 };

  currentViewMode: 'table' | 'analytics' | 'payments' = 'table';

  filterForm: FormGroup;
  dateRangeError: string | null = null;
  activePreset: string | null = 'currentMonth';
  private presetJustSet = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private dashboardState: AdminDashboardStateService,
    private adminFilterService: AdminFilterService,
    private cdr: ChangeDetectorRef
  ) {
    this.adminFilterService.setStateService(this.dashboardState);
    this.filterForm = this.fb.group({
      startDate: [null], endDate: [null]
    }, { validators: this.dateRangeValidator.bind(this) });
  }

  ngOnInit(): void {
    this.dashboardState.loading$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.loadingState = s; this.cdr.detectChanges(); });
    this.dashboardState.error$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.errorState = s; this.cdr.detectChanges(); });

    const current = this.adminFilterService.getCurrentFilters();
    this.filterForm.patchValue({ startDate: current.dateRange.startDate, endDate: current.dateRange.endDate }, { emitEvent: false });

    this.filterForm.valueChanges.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe(v => {
      if (this.filterForm.valid) {
        this.adminFilterService.updateFilters({ dateRange: { startDate: v.startDate, endDate: v.endDate } });
      }
      if (!this.presetJustSet) this.activePreset = null;
      this.presetJustSet = false;
    });
  }

  private dateRangeValidator(control: AbstractControl): ValidationErrors | null {
    const s = control.get('startDate')?.value;
    const e = control.get('endDate')?.value;
    if (!s || !e) { this.dateRangeError = null; return null; }
    const diff = Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 86400000);
    if (diff > 365) { this.dateRangeError = 'Date range cannot exceed 1 year'; return { dateRangeExceeded: true }; }
    this.dateRangeError = null;
    return null;
  }

  setDatePreset(preset: string): void {
    const today = new Date();
    let startDate: Date, endDate: Date;
    switch (preset) {
      case 'lastMonth':
        startDate = new Date(today); startDate.setDate(startDate.getDate() - 30); startDate.setHours(0,0,0,0);
        endDate = new Date(today); endDate.setHours(23,59,59,999); break;
      case 'currentWeek':
        startDate = new Date(today); const day = startDate.getDay(); startDate.setDate(startDate.getDate() - (day === 0 ? 6 : day - 1)); startDate.setHours(0,0,0,0);
        endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 6); endDate.setHours(23,59,59,999); break;
      case 'currentMonth':
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999); break;
    }
    this.presetJustSet = true;
    this.activePreset = preset;
    this.filterForm.patchValue({ startDate, endDate }, { emitEvent: false });
    this.adminFilterService.updateFilters({ dateRange: { startDate, endDate } }, true);
  }

  onRetry(): void { this.dashboardState.clearError(); }
  setViewMode(mode: 'table' | 'analytics' | 'payments'): void { this.currentViewMode = mode; }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
