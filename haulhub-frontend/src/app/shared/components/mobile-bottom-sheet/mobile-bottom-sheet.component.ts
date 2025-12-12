import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface BottomSheetAction {
  label: string;
  color?: 'primary' | 'accent' | 'warn';
  handler: () => void;
}

@Component({
  selector: 'app-mobile-bottom-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './mobile-bottom-sheet.component.html',
  styleUrls: ['./mobile-bottom-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileBottomSheetComponent {
  @Input() open: boolean = false;
  @Input() title: string = '';
  @Input() actions: BottomSheetAction[] = [];
  
  @Output() openChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();

  private startY: number = 0;
  private currentY: number = 0;
  private isDragging: boolean = false;

  closeSheet(): void {
    this.open = false;
    this.openChange.emit(false);
    this.close.emit();
  }

  onHandleTouchStart(event: TouchEvent): void {
    this.startY = event.touches[0].clientY;
    this.isDragging = true;
  }

  onHandleTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    
    this.currentY = event.touches[0].clientY;
    const deltaY = this.currentY - this.startY;
    
    // Only allow dragging down
    if (deltaY > 0) {
      event.preventDefault();
    }
  }

  onHandleTouchEnd(): void {
    if (!this.isDragging) return;
    
    const deltaY = this.currentY - this.startY;
    
    // Close if dragged down more than 100px
    if (deltaY > 100) {
      this.closeSheet();
    }
    
    this.isDragging = false;
    this.startY = 0;
    this.currentY = 0;
  }

  onActionClick(action: BottomSheetAction): void {
    action.handler();
    this.closeSheet();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.open) {
      this.closeSheet();
    }
  }
}
