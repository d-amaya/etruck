import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonLoaderComponent } from './skeleton-loader.component';

@Component({
  selector: 'app-trip-summary-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonLoaderComponent],
  template: `
    <div class="trip-summary-skeleton">
      <div class="skeleton-cards">
        <div class="skeleton-card" *ngFor="let card of cards">
          <app-skeleton-loader type="text" width="60%" height="0.875rem"></app-skeleton-loader>
          <app-skeleton-loader type="text" width="40%" height="2rem" style="margin-top: 8px;"></app-skeleton-loader>
          <app-skeleton-loader type="text" width="80%" height="0.75rem" style="margin-top: 4px;"></app-skeleton-loader>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./trip-summary-skeleton.component.scss']
})
export class TripSummarySkeletonComponent {
  cards = Array(5).fill(0); // 5 status cards
}