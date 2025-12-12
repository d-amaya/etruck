import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';

export interface MobileNavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  active?: boolean;
}

@Component({
  selector: 'app-mobile-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatBadgeModule],
  templateUrl: './mobile-navigation.component.html',
  styleUrls: ['./mobile-navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileNavigationComponent {
  @Input() items: MobileNavItem[] = [];
  @Input() activeRoute: string = '';
  @Output() itemClick = new EventEmitter<MobileNavItem>();

  onItemClick(item: MobileNavItem): void {
    this.itemClick.emit(item);
  }

  isActive(item: MobileNavItem): boolean {
    return item.route === this.activeRoute || item.active === true;
  }
}
