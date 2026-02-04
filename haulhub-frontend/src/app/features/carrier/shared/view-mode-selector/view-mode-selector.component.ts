import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CarrierFilterService, ViewMode } from '../carrier-filter.service';

@Component({
  selector: 'app-carrier-view-mode-selector',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './view-mode-selector.component.html',
  styleUrls: ['./view-mode-selector.component.scss']
})
export class CarrierViewModeSelectorComponent implements OnInit, OnDestroy {
  selectedMode: ViewMode = 'table';
  private destroy$ = new Subject<void>();

  constructor(private filterService: CarrierFilterService) {}

  ngOnInit(): void {
    this.filterService.viewMode$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.selectedMode = mode;
      });
  }

  onViewModeChange(mode: ViewMode): void {
    this.filterService.setViewMode(mode);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
