import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface DrawerSection {
  title: string;
  items: DrawerItem[];
}

export interface DrawerItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
  active?: boolean;
}

@Component({
  selector: 'app-mobile-drawer',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './mobile-drawer.component.html',
  styleUrls: ['./mobile-drawer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDrawerComponent {
  @Input() open: boolean = false;
  @Input() title: string = 'Menu';
  @Input() subtitle?: string;
  @Input() sections: DrawerSection[] = [];
  
  @Output() openChange = new EventEmitter<boolean>();
  @Output() itemClick = new EventEmitter<DrawerItem>();

  close(): void {
    this.open = false;
    this.openChange.emit(false);
  }

  onBackdropClick(): void {
    this.close();
  }

  onItemClick(item: DrawerItem): void {
    if (item.action) {
      item.action();
    }
    this.itemClick.emit(item);
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.open) {
      this.close();
    }
  }
}
