import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

export interface MobileCardAction {
  label: string;
  icon?: string;
  color?: 'primary' | 'accent' | 'warn';
  handler: () => void;
}

export interface MobileCardDetail {
  icon?: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-mobile-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './mobile-card.component.html',
  styleUrls: ['./mobile-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileCardComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() badge?: { text: string; color: string };
  @Input() details: MobileCardDetail[] = [];
  @Input() expandedDetails: MobileCardDetail[] = [];
  @Input() actions: MobileCardAction[] = [];
  @Input() expandable: boolean = false;
  @Input() expanded: boolean = false;
  
  @Output() cardClick = new EventEmitter<void>();
  @Output() expandToggle = new EventEmitter<boolean>();

  onCardClick(): void {
    if (this.expandable) {
      this.toggleExpand();
    }
    this.cardClick.emit();
  }

  toggleExpand(): void {
    this.expanded = !this.expanded;
    this.expandToggle.emit(this.expanded);
  }

  onActionClick(action: MobileCardAction, event: Event): void {
    event.stopPropagation();
    action.handler();
  }
}
