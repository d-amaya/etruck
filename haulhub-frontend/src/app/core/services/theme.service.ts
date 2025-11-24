import { Injectable } from '@angular/core';

/**
 * Theme service for managing HaulHub design system
 * Provides access to design tokens and utility functions
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  // =============================================================================
  // COLOR PALETTE
  // =============================================================================

  readonly colors = {
    primary: {
      blue: '#1976D2',
      dark: '#0D47A1',
      light: '#BBDEFB'
    },
    neutral: {
      900: '#212121',
      700: '#616161',
      500: '#9E9E9E',
      300: '#E0E0E0',
      100: '#F5F5F5',
      50: '#FAFAFA'
    },
    status: {
      scheduled: '#E3F2FD',
      pickedUp: '#FFF3E0',
      inTransit: '#F3E5F5',
      delivered: '#E8F5E9',
      paid: '#E0F2F1'
    },
    semantic: {
      success: '#4CAF50',
      error: '#F44336',
      warning: '#FF9800',
      info: '#2196F3'
    },
    white: '#FFFFFF',
    black: '#000000'
  };

  // =============================================================================
  // SPACING SYSTEM
  // =============================================================================

  readonly spacing = {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
    xxxl: '64px'
  };

  // =============================================================================
  // TYPOGRAPHY
  // =============================================================================

  readonly typography = {
    fontFamily: {
      primary: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
      mono: "'Roboto Mono', 'Courier New', monospace"
    },
    fontSize: {
      h1: '32px',
      h2: '24px',
      h3: '20px',
      h4: '18px',
      body: '14px',
      small: '12px',
      xs: '10px'
    },
    fontWeight: {
      light: 300,
      regular: 400,
      medium: 500,
      bold: 700
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75
    }
  };

  // =============================================================================
  // SHADOWS & BORDERS
  // =============================================================================

  readonly shadows = {
    sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
    md: '0 2px 6px rgba(0, 0, 0, 0.15)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.18)'
  };

  readonly borderRadius = {
    sm: '2px',
    md: '4px',
    lg: '8px'
  };

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get status color for trip status
   */
  getStatusColor(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Scheduled': this.colors.status.scheduled,
      'PickedUp': this.colors.status.pickedUp,
      'InTransit': this.colors.status.inTransit,
      'Delivered': this.colors.status.delivered,
      'Paid': this.colors.status.paid
    };
    
    return statusMap[status] || this.colors.neutral[100];
  }

  /**
   * Get status CSS class for trip status
   */
  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Scheduled': 'status-scheduled',
      'PickedUp': 'status-picked-up',
      'InTransit': 'status-in-transit',
      'Delivered': 'status-delivered',
      'Paid': 'status-paid'
    };
    
    return statusMap[status] || '';
  }

  /**
   * Format currency with consistent styling
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Format currency with decimals
   */
  formatCurrencyDetailed(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Format date consistently
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Format date and time
   */
  formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Get semantic color based on value (positive/negative)
   */
  getSemanticColor(value: number): string {
    if (value > 0) return this.colors.semantic.success;
    if (value < 0) return this.colors.semantic.error;
    return this.colors.neutral[500];
  }

  /**
   * Get contrast text color for background
   */
  getContrastColor(backgroundColor: string): string {
    // Simple contrast calculation - in production, use a proper contrast library
    const lightColors = [
      this.colors.status.scheduled,
      this.colors.status.pickedUp,
      this.colors.status.inTransit,
      this.colors.status.delivered,
      this.colors.status.paid,
      this.colors.neutral[50],
      this.colors.neutral[100],
      this.colors.white
    ];
    
    return lightColors.includes(backgroundColor) 
      ? this.colors.neutral[900] 
      : this.colors.white;
  }

  /**
   * Generate CSS custom properties for dynamic theming
   */
  getCSSCustomProperties(): { [key: string]: string } {
    return {
      '--color-primary': this.colors.primary.blue,
      '--color-primary-dark': this.colors.primary.dark,
      '--color-primary-light': this.colors.primary.light,
      '--color-neutral-900': this.colors.neutral[900],
      '--color-neutral-700': this.colors.neutral[700],
      '--color-neutral-500': this.colors.neutral[500],
      '--color-neutral-300': this.colors.neutral[300],
      '--color-neutral-100': this.colors.neutral[100],
      '--color-neutral-50': this.colors.neutral[50],
      '--color-success': this.colors.semantic.success,
      '--color-error': this.colors.semantic.error,
      '--color-warning': this.colors.semantic.warning,
      '--color-info': this.colors.semantic.info,
      '--spacing-xs': this.spacing.xs,
      '--spacing-sm': this.spacing.sm,
      '--spacing-md': this.spacing.md,
      '--spacing-lg': this.spacing.lg,
      '--spacing-xl': this.spacing.xl,
      '--spacing-xxl': this.spacing.xxl,
      '--border-radius-sm': this.borderRadius.sm,
      '--border-radius-md': this.borderRadius.md,
      '--border-radius-lg': this.borderRadius.lg,
      '--shadow-sm': this.shadows.sm,
      '--shadow-md': this.shadows.md,
      '--shadow-lg': this.shadows.lg
    };
  }
}