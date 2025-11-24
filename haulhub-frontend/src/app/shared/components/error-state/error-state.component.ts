import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="error-state">
      <div class="error-content">
        <mat-icon class="error-icon">error_outline</mat-icon>
        <h3 class="error-title">{{ title }}</h3>
        <p class="error-message">{{ message }}</p>
        <button 
          mat-raised-button 
          color="primary" 
          (click)="onRetry()"
          [disabled]="isRetrying"
          class="retry-button">
          <mat-icon>refresh</mat-icon>
          {{ isRetrying ? 'Retrying...' : 'Try Again' }}
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./error-state.component.scss']
})
export class ErrorStateComponent {
  @Input() title: string = 'Something went wrong';
  @Input() message: string = 'We encountered an error while loading the data. Please try again.';
  @Input() isRetrying: boolean = false;
  @Output() retry = new EventEmitter<void>();
  
  onRetry(): void {
    this.retry.emit();
  }
}