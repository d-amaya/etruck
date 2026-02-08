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
  maxDate = new Date();
  private settingPreset = false;
  
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
    // Apply default preset on init
    this.setPreset('month');

    // Listen to form changes and update service
    this.filterForm.valueChanges
      .pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      )
      .subscribe(value => {
        if (value.startDate && value.endDate && !this.settingPreset) {
          this.filterService.updateDateFilter(value.startDate, value.endDate);
          this.activePreset = null;
        }
      });
  }

  setPreset(preset: 'week' | 'month' | 'quarter' | 'year'): void {
    this.settingPreset = true;
    this.activePreset = preset;
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
