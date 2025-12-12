# Advanced Filter Component

## Overview

The Advanced Filter component provides comprehensive filtering and search capabilities for the eTrucky application. It includes:

1. **Full-Text Search** - Search across multiple fields with fuzzy matching
2. **Quick Filter Presets** - Pre-configured filters for common use cases
3. **Saved Searches** - Save and reuse custom filter combinations
4. **Multi-Criteria Filtering** - Combine multiple filter conditions

## Features

### 1. Full-Text Search

The full-text search feature allows users to search across multiple fields simultaneously:

- **Fuzzy Matching**: Finds results even with typos (using Levenshtein distance)
- **Weighted Fields**: More important fields (like IDs, names) have higher search priority
- **Highlighting**: Matched terms are highlighted in results
- **Case-Insensitive**: Searches work regardless of case

**Searchable Fields by Entity Type:**

**Trips:**
- Trip ID, Order Confirmation (highest weight)
- Pickup/Delivery locations and companies
- Driver, Truck, Trailer names
- Broker name
- Invoice number
- Notes

**Drivers:**
- Name, Email (highest weight)
- Phone, Address, City, State
- CDL State, Corporation Name

**Vehicles (Trucks/Trailers):**
- Name, VIN, License Plate (highest weight)
- Brand, Color, Year

### 2. Quick Filter Presets

Pre-configured filters for common scenarios:

**Trip Quick Filters:**
- **Active Trips**: Currently in progress (Scheduled, PickedUp, InTransit)
- **Pending Payment**: Delivered trips awaiting payment
- **This Week**: Trips scheduled this week
- **High Value**: Trips with broker payment > $2000
- **Needs Attention**: Trips with issues or delays
- **Completed & Unpaid**: Completed trips with outstanding invoices

**Driver Quick Filters:**
- **Active Drivers**: Currently active drivers
- **Pending Payment**: Drivers with outstanding payments
- **CDL Expiring Soon**: CDL expires within 60 days

**Vehicle Quick Filters:**
- **Active Vehicles**: Currently active vehicles
- **Pending Verification**: Vehicles awaiting verification
- **High Utilization**: Vehicles with >80% utilization

### 3. Saved Searches

Users can save their custom filter combinations for quick access:

- **Save Current Filters**: Save any combination of filters with a name and description
- **Set as Default**: Automatically apply a saved search when loading the page
- **Usage Tracking**: See how many times each saved search has been used
- **Quick Access**: Apply saved searches with a single click
- **Manage Searches**: Edit, delete, or set default searches

### 4. Multi-Criteria Filtering

Combine multiple filter conditions:

- Date ranges
- Status filters
- Entity-specific filters (broker, driver, vehicle)
- Text search
- Custom field filters

## Usage

### Basic Integration

```typescript
import { AdvancedFilterComponent } from '@app/shared/components';

@Component({
  template: `
    <app-advanced-filter
      entityType="trip"
      [currentFilters]="currentFilters"
      [showFullTextSearch]="true"
      [showQuickFilters]="true"
      [showSavedSearches]="true"
      (searchQueryChanged)="onSearchQueryChanged($event)"
      (quickFilterApplied)="onQuickFilterApplied($event)"
      (savedSearchApplied)="onSavedSearchApplied($event)"
      (filtersChanged)="onFiltersChanged($event)">
    </app-advanced-filter>
  `
})
export class MyComponent {
  currentFilters = {};

  onSearchQueryChanged(query: string) {
    // Handle full-text search
    const results = this.fullTextSearchService.search(
      this.items,
      query,
      this.fullTextSearchService.getTripSearchableFields()
    );
  }

  onQuickFilterApplied(preset: QuickFilterPreset) {
    // Apply quick filter preset
    this.applyFilters(preset.filters);
  }

  onSavedSearchApplied(search: SavedSearch) {
    // Apply saved search
    this.applyFilters(search.filters);
  }

  onFiltersChanged(filters: any) {
    // Handle filter changes
    this.currentFilters = filters;
  }
}
```

### Component Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `entityType` | `'trip' \| 'driver' \| 'truck' \| 'trailer' \| 'invoice'` | `'trip'` | Type of entity being filtered |
| `currentFilters` | `any` | `{}` | Current active filters |
| `showFullTextSearch` | `boolean` | `true` | Show/hide full-text search |
| `showQuickFilters` | `boolean` | `true` | Show/hide quick filter presets |
| `showSavedSearches` | `boolean` | `true` | Show/hide saved searches |

### Component Outputs

| Output | Type | Description |
|--------|------|-------------|
| `searchQueryChanged` | `EventEmitter<string>` | Emitted when search query changes |
| `quickFilterApplied` | `EventEmitter<QuickFilterPreset>` | Emitted when quick filter is applied |
| `savedSearchApplied` | `EventEmitter<SavedSearch>` | Emitted when saved search is applied |
| `filtersChanged` | `EventEmitter<any>` | Emitted when any filters change |

## Services

### SavedSearchService

Manages saved searches with localStorage persistence:

```typescript
// Save a search
const search = savedSearchService.saveSearch({
  name: 'My Search',
  description: 'Description',
  filters: { status: 'Active' },
  entityType: 'trip'
});

// Get saved searches
const searches = savedSearchService.getSavedSearches('trip');

// Set as default
savedSearchService.setDefaultSearch(search.id, 'trip');

// Delete a search
savedSearchService.deleteSearch(search.id);
```

### FullTextSearchService

Performs full-text search with fuzzy matching:

```typescript
// Search trips
const results = fullTextSearchService.search(
  trips,
  'seattle',
  fullTextSearchService.getTripSearchableFields(),
  {
    fuzzy: true,
    caseSensitive: false,
    minScore: 0.1,
    maxResults: 50
  }
);

// Results include:
// - item: The original item
// - score: Relevance score (0-1)
// - matchedFields: Fields that matched
// - highlights: HTML with <mark> tags
```

## Accessibility

The component is fully accessible:

- **Keyboard Navigation**: All controls accessible via keyboard
- **ARIA Labels**: Proper labels for screen readers
- **Focus Management**: Clear focus indicators
- **Touch Targets**: Minimum 44px touch targets on mobile
- **High Contrast**: Supports high contrast mode
- **Reduced Motion**: Respects prefers-reduced-motion

## Mobile Optimization

- **Responsive Layout**: Adapts to screen size
- **Touch-Friendly**: Large touch targets
- **Progressive Disclosure**: Collapsible sections
- **Mobile-First Design**: Optimized for mobile devices

## Storage

Saved searches are stored in localStorage:

- **Key Format**: `haulhub_saved_searches_all`
- **Data Structure**: JSON array of SavedSearch objects
- **Persistence**: Survives page refreshes and browser restarts
- **Privacy**: Stored locally, not sent to server

## Performance

- **Debounced Search**: 300ms debounce on search input
- **Efficient Matching**: Optimized fuzzy matching algorithm
- **Lazy Loading**: Components loaded on demand
- **Minimal Re-renders**: OnPush change detection where possible

## Future Enhancements

Potential improvements for future versions:

1. **Server-Side Search**: Move search to backend for large datasets
2. **Advanced Query Builder**: Visual query builder for complex filters
3. **Filter Templates**: Share filter templates between users
4. **Export/Import**: Export and import saved searches
5. **Search History**: Track and suggest recent searches
6. **Smart Suggestions**: AI-powered search suggestions
7. **Bulk Actions**: Apply actions to filtered results

## Requirements Validation

This implementation satisfies Task 5.3 requirements:

- ✅ **Multi-criteria filtering**: Combine date, status, entity, and text filters
- ✅ **Saved search functionality**: Save, load, and manage custom searches
- ✅ **Quick filter presets**: Pre-configured filters for common scenarios
- ✅ **Full-text search capabilities**: Search across multiple fields with fuzzy matching

**Validates Requirements:** 4.5, 7.5, 8.4, 15.1, 15.2, 15.3, 15.4, 15.5
