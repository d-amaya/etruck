import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AccessibilityService {
  private isKeyboardNavigation = false;

  constructor() {
    this.initializeKeyboardDetection();
  }

  /**
   * Initialize keyboard navigation detection
   * This helps us show focus indicators only for keyboard users
   */
  private initializeKeyboardDetection(): void {
    // Listen for keyboard events
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        this.isKeyboardNavigation = true;
        document.body.classList.add('keyboard-navigation');
        document.body.classList.remove('mouse-navigation');
      }
    });

    // Listen for mouse events
    document.addEventListener('mousedown', () => {
      this.isKeyboardNavigation = false;
      document.body.classList.add('mouse-navigation');
      document.body.classList.remove('keyboard-navigation');
    });

    // Set initial state
    document.body.classList.add('mouse-navigation');
  }

  /**
   * Check if current navigation is via keyboard
   */
  isUsingKeyboard(): boolean {
    return this.isKeyboardNavigation;
  }

  /**
   * Generate accessible ID for form controls
   */
  generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Announce message to screen readers
   */
  announceToScreenReader(message: string): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  /**
   * Set focus to element with proper handling
   */
  setFocus(element: HTMLElement): void {
    if (element) {
      element.focus();
      // Ensure focus is visible for keyboard users
      if (this.isKeyboardNavigation) {
        element.classList.add('keyboard-focused');
      }
    }
  }

  /**
   * Get ARIA label for trip status
   */
  getStatusAriaLabel(status: string): string {
    const statusLabels: { [key: string]: string } = {
      'SCHEDULED': 'Order is scheduled',
      'PICKED_UP': 'Order has been picked up',
      'IN_TRANSIT': 'Order is in transit',
      'DELIVERED': 'Order has been delivered',
      'PAID': 'Order has been paid'
    };
    return statusLabels[status] || `Trip status is ${status}`;
  }

  /**
   * Get ARIA label for action buttons
   */
  getActionAriaLabel(action: string, tripId: string, destination?: string): string {
    const actionLabels: { [key: string]: string } = {
      'view': `View details for trip ${tripId}${destination ? ` to ${destination}` : ''}`,
      'edit': `Edit order ${tripId}${destination ? ` to ${destination}` : ''}`,
      'delete': `Delete order ${tripId}${destination ? ` to ${destination}` : ''}`
    };
    return actionLabels[action] || `${action} trip ${tripId}`;
  }

  /**
   * Get ARIA label for filter controls
   */
  getFilterAriaLabel(filterType: string, value?: any): string {
    const filterLabels: { [key: string]: string } = {
      'status': 'Filter trips by status',
      'broker': 'Filter trips by broker',
      'lorryId': 'Filter trips by lorry ID',
      'driverName': 'Filter trips by driver name',
      'startDate': 'Filter trips from date',
      'endDate': 'Filter trips to date'
    };
    
    let label = filterLabels[filterType] || `Filter by ${filterType}`;
    
    if (value) {
      label += `. Current value: ${value}`;
    }
    
    return label;
  }

  /**
   * Get ARIA description for summary cards
   */
  getSummaryCardAriaDescription(status: string, count: number): string {
    return `${count} trips with ${status.toLowerCase().replace('_', ' ')} status. Click to filter by this status.`;
  }
}