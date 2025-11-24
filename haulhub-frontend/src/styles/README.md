# HaulHub Design System

A professional corporate design system for the HaulHub transportation management application.

## Overview

The HaulHub design system provides a consistent, professional visual language with muted colors, clean typography, and generous whitespace suitable for corporate environments.

## Files Structure

```
src/styles/
├── _variables.scss    # Design tokens (colors, spacing, typography)
├── _typography.scss   # Typography system and utilities
├── _spacing.scss      # Spacing utilities (margin, padding, gap)
├── _layout.scss       # Layout utilities (flexbox, grid, positioning)
├── _components.scss   # Material component overrides
└── README.md         # This documentation
```

## Color Palette

### Primary Colors
- **Primary Blue**: `#1976D2` - Used for primary actions, links
- **Primary Dark**: `#0D47A1` - Used for hover states
- **Primary Light**: `#BBDEFB` - Used for backgrounds

### Neutral Colors (Professional Gray Scale)
- **Neutral 900**: `#212121` - Primary text
- **Neutral 700**: `#616161` - Secondary text
- **Neutral 500**: `#9E9E9E` - Disabled text
- **Neutral 300**: `#E0E0E0` - Borders
- **Neutral 100**: `#F5F5F5` - Light backgrounds
- **Neutral 50**: `#FAFAFA` - Page background

### Status Colors (Muted Professional)
- **Scheduled**: `#E3F2FD` (Light blue)
- **Picked Up**: `#FFF3E0` (Light amber)
- **In Transit**: `#F3E5F5` (Light purple)
- **Delivered**: `#E8F5E9` (Light green)
- **Paid**: `#E0F2F1` (Light teal)

### Semantic Colors
- **Success**: `#4CAF50`
- **Error**: `#F44336`
- **Warning**: `#FF9800`
- **Info**: `#2196F3`

## Typography

### Font Family
- **Primary**: `'Roboto', 'Helvetica Neue', Arial, sans-serif`
- **Monospace**: `'Roboto Mono', 'Courier New', monospace`

### Font Sizes
- **H1**: `32px` (Headlines)
- **H2**: `24px` (Section titles)
- **H3**: `20px` (Subsection titles)
- **H4**: `18px` (Card titles)
- **Body**: `14px` (Default text)
- **Small**: `12px` (Captions, labels)
- **XS**: `10px` (Fine print)

### Font Weights
- **Light**: `300`
- **Regular**: `400` (Default)
- **Medium**: `500` (Buttons, labels)
- **Bold**: `700` (Headlines)

## Spacing System

Consistent spacing scale based on 4px increments:

- **XS**: `4px`
- **SM**: `8px`
- **MD**: `16px` (Default)
- **LG**: `24px`
- **XL**: `32px`
- **XXL**: `48px`
- **XXXL**: `64px`

### Usage Examples

```scss
// Using variables
.my-component {
  padding: $spacing-md;
  margin-bottom: $spacing-lg;
}

// Using utility classes
<div class="p-md mb-lg">Content</div>
```

## Layout Utilities

### Flexbox
```html
<div class="d-flex justify-content-between align-items-center">
  <span>Left content</span>
  <span>Right content</span>
</div>
```

### Grid
```html
<div class="d-grid grid-cols-3 gap-md">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

### Dashboard Layout
```html
<div class="dashboard-container">
  <div class="dashboard-content">
    <!-- Dashboard components -->
  </div>
</div>
```

## Component Styling

### Cards
Cards use subtle shadows and borders for a professional appearance:

```scss
.mat-mdc-card {
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  border: 1px solid #E0E0E0;
}
```

### Buttons
Buttons use consistent styling with proper hover states:

```html
<button mat-raised-button color="primary">Primary Action</button>
<button mat-outlined-button>Secondary Action</button>
```

### Status Chips
Status indicators use muted colors:

```html
<mat-chip class="status-scheduled">Scheduled</mat-chip>
<mat-chip class="status-delivered">Delivered</mat-chip>
```

### Tables
Tables use zebra striping and subtle hover effects:

```scss
.mat-mdc-table {
  .mat-mdc-row:nth-child(even) {
    background-color: rgba(#F5F5F5, 0.3);
  }
  
  .mat-mdc-row:hover {
    background-color: #F5F5F5;
  }
}
```

## Theme Service

Use the `ThemeService` for programmatic access to design tokens:

```typescript
import { ThemeService } from '@core/services';

constructor(private theme: ThemeService) {}

// Get colors
const primaryColor = this.theme.colors.primary.blue;
const statusColor = this.theme.getStatusColor('Scheduled');

// Format values
const formattedPrice = this.theme.formatCurrency(1500);
const formattedDate = this.theme.formatDate('2024-01-15');
```

## Best Practices

### Colors
- Use neutral colors for most UI elements
- Reserve primary blue for important actions only
- Use muted status colors to avoid visual noise
- Ensure sufficient contrast for accessibility

### Typography
- Use consistent font sizes from the scale
- Limit font weights to maintain hierarchy
- Use proper line heights for readability

### Spacing
- Use the spacing scale consistently
- Prefer spacing utilities over custom values
- Maintain consistent gaps between related elements

### Components
- Follow Material Design principles
- Use subtle shadows and borders
- Maintain consistent border radius
- Provide clear hover and focus states

## Accessibility

The design system follows WCAG AA guidelines:

- Color contrast ratios meet minimum requirements
- Focus indicators are clearly visible
- Interactive elements have sufficient size
- Screen reader support is maintained

## Responsive Design

The system includes responsive utilities:

```html
<!-- Hide on mobile -->
<div class="d-md-none">Desktop only content</div>

<!-- Show only on mobile -->
<div class="d-none d-md-block">Mobile only content</div>
```

## Migration Guide

When updating existing components:

1. Replace custom colors with design system variables
2. Use spacing utilities instead of hardcoded values
3. Apply consistent typography classes
4. Update component styling to match the system
5. Test for accessibility compliance

## Examples

### Dashboard Card
```html
<mat-card class="summary-card clickable">
  <div class="card-content">
    <div class="card-icon" [style.background-color]="statusColor">
      <mat-icon>schedule</mat-icon>
    </div>
    <div class="card-info">
      <h3 class="card-count">{{ count }}</h3>
      <p class="card-label">{{ label }}</p>
    </div>
  </div>
</mat-card>
```

### Filter Bar
```html
<div class="filter-bar">
  <form class="filter-form">
    <div class="filter-group">
      <mat-form-field appearance="outline">
        <mat-label>Status</mat-label>
        <mat-select>
          <mat-option value="all">All Statuses</mat-option>
        </mat-select>
      </mat-form-field>
    </div>
    <div class="filter-actions">
      <button mat-stroked-button type="button">
        <mat-icon>clear</mat-icon>
        Clear Filters
      </button>
    </div>
  </form>
</div>
```

### Action Buttons
```html
<div class="action-buttons">
  <button mat-button class="action-btn">
    <mat-icon>visibility</mat-icon>
    <span>View</span>
  </button>
  <button mat-button class="action-btn">
    <mat-icon>edit</mat-icon>
    <span>Update</span>
  </button>
  <button mat-button class="action-btn delete">
    <mat-icon>delete</mat-icon>
    <span>Delete</span>
  </button>
</div>
```