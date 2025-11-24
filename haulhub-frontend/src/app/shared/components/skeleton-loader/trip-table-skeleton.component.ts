import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonLoaderComponent } from './skeleton-loader.component';

@Component({
  selector: 'app-trip-table-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonLoaderComponent],
  template: `
    <div class="trip-table-skeleton">
      <div class="skeleton-table">
        <!-- Table Header -->
        <div class="skeleton-header">
          <div class="skeleton-header-cell" *ngFor="let header of headers">
            <app-skeleton-loader type="text" width="80%" height="0.875rem"></app-skeleton-loader>
          </div>
        </div>
        
        <!-- Table Rows -->
        <div class="skeleton-row" *ngFor="let row of rows">
          <div class="skeleton-cell" *ngFor="let cell of headers">
            <app-skeleton-loader 
              type="text" 
              [width]="getCellWidth(cell)" 
              height="0.875rem">
            </app-skeleton-loader>
          </div>
        </div>
      </div>
      
      <!-- Pagination Skeleton -->
      <div class="skeleton-pagination">
        <app-skeleton-loader type="text" width="120px" height="1rem"></app-skeleton-loader>
        <div class="skeleton-pagination-controls">
          <app-skeleton-loader type="button" width="32px" height="32px"></app-skeleton-loader>
          <app-skeleton-loader type="text" width="60px" height="1rem"></app-skeleton-loader>
          <app-skeleton-loader type="button" width="32px" height="32px"></app-skeleton-loader>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./trip-table-skeleton.component.scss']
})
export class TripTableSkeletonComponent {
  headers = ['Date', 'Broker', 'Route', 'Lorry', 'Driver', 'Status', 'Payment', 'Actions'];
  rows = Array(8).fill(0); // Show 8 skeleton rows
  
  getCellWidth(header: string): string {
    const widths: { [key: string]: string } = {
      'Date': '90%',
      'Broker': '85%',
      'Route': '95%',
      'Lorry': '80%',
      'Driver': '85%',
      'Status': '70%',
      'Payment': '75%',
      'Actions': '60%'
    };
    return widths[header] || '80%';
  }
}