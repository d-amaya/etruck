import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="loading-overlay" [class.visible]="isVisible">
      <div class="loading-content">
        <mat-spinner [diameter]="40" [strokeWidth]="4"></mat-spinner>
        <p class="loading-text">{{ message }}</p>
      </div>
    </div>
  `,
  styleUrls: ['./loading-overlay.component.scss']
})
export class LoadingOverlayComponent {
  @Input() isVisible: boolean = false;
  @Input() message: string = 'Loading...';
}