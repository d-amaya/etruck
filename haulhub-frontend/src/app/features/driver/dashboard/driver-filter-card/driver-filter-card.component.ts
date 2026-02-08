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
  activePreset: string = 'lastYear';
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
    const today = new Date();
    const lastYear = new Date(today);
    lastYear.setFullYear(today.getFullYear() - 1);

    this.filterForm.patchValue({
      startDate: lastYear,
      endDate: today
    }, { emitEvent: false });

    this.filterService.updateFilters({
      dateRange: {
        startDate: lastYear,
        endDate: today
      }
    });
  }

  applyPreset(preset: string): void {
    const today = new Date();
    let startDate: Date;

    switch (preset) {
      case 'last3Months':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 3);
        break;
      case 'lastMonth':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1);
        break;
      case 'lastYear':
        startDate = new Date(today);
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      default:
        return;
    }

    this.activePreset = preset;
    this.filterForm.patchValue({
      startDate,
      endDate: today
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
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if endDate is today (within 1 day)
    const isToday = Math.abs(endDate.getTime() - today.getTime()) < (24 * 60 * 60 * 1000);
    
    if (isToday) {
      if (diffDays >= 28 && diffDays <= 32) {
        this.activePreset = 'lastMonth';
      } else if (diffDays >= 88 && diffDays <= 95) {
        this.activePreset = 'last3Months';
      } else if (diffDays >= 360 && diffDays <= 370) {
        this.activePreset = 'lastYear';
      } else {
        this.activePreset = '';
      }
    } else {
      this.activePreset = '';
    }
  }
}
