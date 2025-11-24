import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-loader" [ngClass]="type" [style.width]="width" [style.height]="height">
      <div class="skeleton-shimmer"></div>
    </div>
  `,
  styleUrls: ['./skeleton-loader.component.scss']
})
export class SkeletonLoaderComponent {
  @Input() type: 'text' | 'card' | 'table-row' | 'chart' | 'button' = 'text';
  @Input() width: string = '100%';
  @Input() height: string = '1rem';
}