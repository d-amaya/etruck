import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-expandable-section',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './expandable-section.component.html',
  styleUrls: ['./expandable-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpandableSectionComponent {
  @Input() title: string = '';
  @Input() expanded: boolean = false;
  @Input() icon?: string;
  
  @Output() expandedChange = new EventEmitter<boolean>();

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.expandedChange.emit(this.expanded);
  }
}
