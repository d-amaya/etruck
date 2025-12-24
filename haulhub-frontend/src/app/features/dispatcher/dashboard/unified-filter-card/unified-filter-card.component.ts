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

  maxDate = new Date();
  minDate = new Date();

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private sharedFilterService: SharedFilterService
  ) {
    this.minDate.setFullYear(this.minDate.getFullYear() - 5);

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

    this.filterForm.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(formValue => {
        if (this.filterForm.valid) {
          this.sharedFilterService.updateFilters({
            dateRange: {
              startDate: formValue.startDate,
              endDate: formValue.endDate
            }
          });
        }
      });
  }

  setDatePreset(preset: string): void {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let startDate: Date;
    let endDate = today;

    switch (preset) {
      case '30days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '365days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 365);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        return;
    }

    this.filterForm.patchValue({ startDate, endDate });
  }

  isPresetActive(preset: string): boolean {
    const startDate = this.filterForm.get('startDate')?.value;
    const endDate = this.filterForm.get('endDate')?.value;
    
    if (!startDate || !endDate) return false;

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let expectedStart: Date;
    let expectedEnd = today;

    switch (preset) {
      case '30days':
        expectedStart = new Date(today);
        expectedStart.setDate(expectedStart.getDate() - 30);
        expectedStart.setHours(0, 0, 0, 0);
        break;
      case 'month':
        expectedStart = new Date(today.getFullYear(), today.getMonth(), 1);
        expectedStart.setHours(0, 0, 0, 0);
        break;
      case 'year':
        expectedStart = new Date(today.getFullYear(), 0, 1);
        expectedStart.setHours(0, 0, 0, 0);
        break;
      case '365days':
        expectedStart = new Date(today);
        expectedStart.setDate(expectedStart.getDate() - 365);
        expectedStart.setHours(0, 0, 0, 0);
        break;
      default:
        return false;
    }

    // Compare both start and end dates to properly detect active preset
    const startMatches = startDate.toDateString() === expectedStart.toDateString();
    const endMatches = endDate.toDateString() === expectedEnd.toDateString();
    
    return startMatches && endMatches;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
