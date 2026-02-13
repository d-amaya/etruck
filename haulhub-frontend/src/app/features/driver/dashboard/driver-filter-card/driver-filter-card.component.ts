import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { DriverSharedFilterService } from '../driver-shared-filter.service';

@Component({
  selector: 'app-driver-filter-card',
  templateUrl: './driver-filter-card.component.html',
  styleUrls: ['./driver-filter-card.component.scss']
})
export class DriverFilterCardComponent implements OnInit, OnDestroy {
  filterForm: FormGroup;
  dateRangeError: string | null = null;
  activePreset: string | null = 'lastMonth';
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private filterService: DriverSharedFilterService
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    
    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.onDateRangeChange();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setDefaultDateRange(): void {
    this.applyPreset('currentWeek');
  }

  applyPreset(preset: string): void {
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
        const diff = day === 0 ? 6 : day - 1;
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

    this.activePreset = preset;
    this.filterForm.patchValue({
      startDate,
      endDate
    });
  }

  onDateRangeChange(): void {
    const { startDate, endDate } = this.filterForm.value;

    if (!startDate || !endDate) {
      this.dateRangeError = null;
      return;
    }

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 365) {
      this.dateRangeError = 'Date range cannot exceed 1 year';
      return;
    }

    this.dateRangeError = null;
    this.detectActivePreset(startDate, endDate);

    this.filterService.updateFilters({
      dateRange: {
        startDate,
        endDate
      }
    });
  }

  private detectActivePreset(startDate: Date, endDate: Date): void {
    const today = new Date();
    const startDiffDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const endDiffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    const startIsToday = Math.abs(startDate.getTime() - today.getTime()) < (24 * 60 * 60 * 1000);
    const endIsToday = Math.abs(endDate.getTime() - today.getTime()) < (24 * 60 * 60 * 1000);
    
    if (startIsToday && endDiffDays >= 6 && endDiffDays <= 8) {
      this.activePreset = 'nextWeek';
    } else if (startIsToday && endDiffDays >= 28 && endDiffDays <= 32) {
      this.activePreset = 'nextMonth';
    } else if (endIsToday) {
      if (startDiffDays >= 28 && startDiffDays <= 32) {
        this.activePreset = 'lastMonth';
      } else if (startDiffDays >= 88 && startDiffDays <= 95) {
        this.activePreset = 'last3Months';
      } else {
        this.activePreset = '';
      }
    } else {
      this.activePreset = '';
    }
  }
}
