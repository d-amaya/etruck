import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonLoaderComponent } from './skeleton-loader.component';

@Component({
  selector: 'app-dashboard-charts-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonLoaderComponent],
  template: `
    <div class="dashboard-charts-skeleton">
      <div class="charts-grid">
        <div class="chart-container">
          <app-skeleton-loader type="text" width="40%" height="1.25rem"></app-skeleton-loader>
          <app-skeleton-loader type="chart" style="margin-top: 1rem;"></app-skeleton-loader>
        </div>
        
        <div class="chart-container">
          <app-skeleton-loader type="text" width="45%" height="1.25rem"></app-skeleton-loader>
          <app-skeleton-loader type="chart" style="margin-top: 1rem;"></app-skeleton-loader>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./dashboard-charts-skeleton.component.scss']
})
export class DashboardChartsSkeletonComponent {}