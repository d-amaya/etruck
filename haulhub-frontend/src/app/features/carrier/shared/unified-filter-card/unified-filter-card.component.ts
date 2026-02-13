import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CarrierFilterService } from '../carrier-filter.service';
import { CarrierViewModeSelectorComponent } from '../view-mode-selector/view-mode-selector.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-carrier-unified-filter-card',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    CarrierViewModeSelectorComponent
  ],
  templateUrl: './unified-filter-card.component.html',
  styleUrls: ['./unified-filter-card.component.scss']
})
export class CarrierUnifiedFilterCardComponent implements OnInit, OnDestroy {
  filterForm: FormGroup;
  activePreset: string | null = 'month';
  maxDate: Date | null = null; // No maximum date - allow future dates
  dateRangeError: string | null = null;
  settingPreset = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private filterService: CarrierFilterService,
    public router: Router
  ) {
    const currentFilter = this.filterService.getCurrentFilter();
    this.filterForm = this.fb.group({
      startDate: [currentFilter.startDate],
      endDate: [currentFilter.endDate]
    });
  }

  ngOnInit(): void {
    // Sync form with current filter state (defaults to current week from service)
    const currentFilter = this.filterService.getCurrentFilter();
    this.filterForm.patchValue({
      startDate: currentFilter.startDate,
      endDate: currentFilter.endDate
    }, { emitEvent: false });

    // Detect if current dates match a preset
    this.activePreset = this.filterService.activePreset;

    // Push current dates to dashboard state (ensures API uses correct dates after navigation)
    if (currentFilter.startDate && currentFilter.endDate) {
      this.filterService.updateDateFilter(currentFilter.startDate, currentFilter.endDate);
    }

    // Listen to form changes and update service
    this.filterForm.valueChanges
      .pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      )
      .subscribe(value => {
        if (value.startDate && value.endDate && !this.settingPreset) {
          // Validate date range doesn't exceed 1 year
          const diffMs = Math.abs(value.endDate.getTime() - value.startDate.getTime());
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 365) {
            this.dateRangeError = 'Date range cannot exceed 1 year';
            return;
          }
          this.dateRangeError = null;
          this.filterService.updateDateFilter(value.startDate, value.endDate);
          this.activePreset = null;
          this.filterService.activePreset = null;
        }
      });
  }

  setPreset(preset: 'lastMonth' | 'currentWeek' | 'currentMonth'): void {
    this.settingPreset = true;
    this.activePreset = preset;
    this.filterService.activePreset = preset;
    this.filterService.setPreset(preset);
    
    const filter = this.filterService.getCurrentFilter();
    this.filterForm.patchValue({
      startDate: filter.startDate,
      endDate: filter.endDate
    }, { emitEvent: false });
    
    setTimeout(() => this.settingPreset = false, 600);
  }

  clearFilters(): void {
    this.activePreset = null;
    this.filterForm.reset();
    this.filterService.clearFilter();
  }

  navigateToUsers(): void {
    this.router.navigate(['/carrier/users']);
  }

  navigateToAssets(): void {
    this.router.navigate(['/carrier/assets']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
