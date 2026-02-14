import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SharedFilterService } from '../shared-filter.service';
import { ViewModeSelectorComponent } from '../view-mode-selector/view-mode-selector.component';

@Component({
  selector: 'app-unified-filter-card',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    ViewModeSelectorComponent
  ],
  templateUrl: './unified-filter-card.component.html',
  styleUrls: ['./unified-filter-card.component.scss']
})
export class UnifiedFilterCardComponent implements OnInit, OnDestroy {
  filterForm: FormGroup;
  dateRangeError: string | null = null;
  activePreset: string | null = 'currentMonth';
  private presetJustSet = false;

  maxDate: Date | null = null; // No maximum date - allow future dates

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private sharedFilterService: SharedFilterService
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    }, { validators: this.dateRangeValidator.bind(this) });
  }

  private dateRangeValidator(control: AbstractControl): ValidationErrors | null {
    const startDate = control.get('startDate')?.value;
    const endDate = control.get('endDate')?.value;

    if (!startDate || !endDate) {
      this.dateRangeError = null;
      return null;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 365) {
      this.dateRangeError = 'Date range cannot exceed 1 year';
      return { dateRangeExceeded: true };
    }

    this.dateRangeError = null;
    return null;
  }

  ngOnInit(): void {
    const currentFilters = this.sharedFilterService.getCurrentFilters();
    this.filterForm.patchValue({
      startDate: currentFilters.dateRange.startDate,
      endDate: currentFilters.dateRange.endDate
    }, { emitEvent: false });

    // Determine which preset is active on init
    this.updateActivePreset();

    // Push current dates to dashboard state (ensures API uses correct dates after navigation)
    if (currentFilters.dateRange.startDate && currentFilters.dateRange.endDate) {
      this.sharedFilterService.updateFilters({
        dateRange: currentFilters.dateRange
      });
    }

    this.filterForm.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(formValue => {
        if (this.filterForm.valid) {
          // Always update the shared filter service
          this.sharedFilterService.updateFilters({
            dateRange: {
              startDate: formValue.startDate,
              endDate: formValue.endDate
            }
          });
        }
        
        // Only update active preset if it wasn't just set by a button click
        if (!this.presetJustSet) {
          this.updateActivePreset();
        }
        this.presetJustSet = false;
      });
  }

  setDatePreset(preset: string): void {
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (preset) {
      case 'lastMonth':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'currentWeek':
        startDate = new Date(today);
        const day = startDate.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday as start of week
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'currentMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      default:
        return;
    }

    this.presetJustSet = true;
    this.activePreset = preset;
    this.filterForm.patchValue({ startDate, endDate }, { emitEvent: false });
    
    // Force update even if dates are similar
    this.sharedFilterService.updateFilters({
      dateRange: { startDate, endDate }
    }, true);
  }

  private updateActivePreset(): void {
    const presets = ['lastMonth', 'currentWeek', 'currentMonth'];
    this.activePreset = null;
    
    for (const preset of presets) {
      if (this.isPresetActive(preset)) {
        this.activePreset = preset;
        break;
      }
    }
  }

  isPresetActive(preset: string): boolean {
    const startDate = this.filterForm.get('startDate')?.value;
    const endDate = this.filterForm.get('endDate')?.value;
    
    if (!startDate || !endDate) return false;

    const isSameDay = (date1: Date, date2: Date): boolean => {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };

    const today = new Date();
    let expectedStart: Date;
    let expectedEnd: Date;

    switch (preset) {
      case 'lastMonth':
        expectedStart = new Date(today);
        expectedStart.setDate(expectedStart.getDate() - 30);
        expectedEnd = new Date(today);
        break;
      case 'currentWeek':
        expectedStart = new Date(today);
        const dayOfWeek = expectedStart.getDay();
        const mondayDiff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        expectedStart.setDate(expectedStart.getDate() - mondayDiff);
        expectedEnd = new Date(expectedStart);
        expectedEnd.setDate(expectedEnd.getDate() + 6);
        break;
      case 'currentMonth':
        expectedStart = new Date(today.getFullYear(), today.getMonth(), 1);
        expectedEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return false;
    }

    return isSameDay(startDate, expectedStart) && isSameDay(endDate, expectedEnd);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
