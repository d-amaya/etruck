import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  filters: any; // Generic filter object
  entityType: 'trip' | 'driver' | 'truck' | 'trailer' | 'invoice';
  createdAt: Date;
  lastUsed?: Date;
  useCount: number;
  isDefault?: boolean;
}

export interface QuickFilterPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  filters: any;
  entityType: 'trip' | 'driver' | 'truck' | 'trailer' | 'invoice';
}

@Injectable({
  providedIn: 'root'
})
export class SavedSearchService {
  private readonly STORAGE_KEY_PREFIX = 'haulhub_saved_searches_';
  
  private savedSearchesSubject = new BehaviorSubject<SavedSearch[]>([]);
  public savedSearches$: Observable<SavedSearch[]> = this.savedSearchesSubject.asObservable();

  constructor() {
    this.loadSavedSearches();
  }

  /**
   * Get all saved searches for a specific entity type
   */
  getSavedSearches(entityType: string): SavedSearch[] {
    return this.savedSearchesSubject.value.filter(s => s.entityType === entityType);
  }

  /**
   * Save a new search
   */
  saveSearch(search: Omit<SavedSearch, 'id' | 'createdAt' | 'useCount'>): SavedSearch {
    const newSearch: SavedSearch = {
      ...search,
      id: this.generateId(),
      createdAt: new Date(),
      useCount: 0
    };

    const searches = [...this.savedSearchesSubject.value, newSearch];
    this.savedSearchesSubject.next(searches);
    this.persistSearches(searches);

    return newSearch;
  }

  /**
   * Update an existing saved search
   */
  updateSearch(id: string, updates: Partial<SavedSearch>): void {
    const searches = this.savedSearchesSubject.value.map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    this.savedSearchesSubject.next(searches);
    this.persistSearches(searches);
  }

  /**
   * Delete a saved search
   */
  deleteSearch(id: string): void {
    const searches = this.savedSearchesSubject.value.filter(s => s.id !== id);
    this.savedSearchesSubject.next(searches);
    this.persistSearches(searches);
  }

  /**
   * Mark a search as used (updates lastUsed and useCount)
   */
  markSearchAsUsed(id: string): void {
    const searches = this.savedSearchesSubject.value.map(s =>
      s.id === id
        ? { ...s, lastUsed: new Date(), useCount: s.useCount + 1 }
        : s
    );
    this.savedSearchesSubject.next(searches);
    this.persistSearches(searches);
  }

  /**
   * Set a search as default for an entity type
   */
  setDefaultSearch(id: string, entityType: string): void {
    const searches = this.savedSearchesSubject.value.map(s => ({
      ...s,
      isDefault: s.id === id && s.entityType === entityType
    }));
    this.savedSearchesSubject.next(searches);
    this.persistSearches(searches);
  }

  /**
   * Get the default search for an entity type
   */
  getDefaultSearch(entityType: string): SavedSearch | null {
    return this.savedSearchesSubject.value.find(
      s => s.entityType === entityType && s.isDefault
    ) || null;
  }

  /**
   * Get predefined quick filter presets for trips
   */
  getTripQuickFilters(): QuickFilterPreset[] {
    return [
      {
        id: 'active-trips',
        name: 'Active Trips',
        icon: 'local_shipping',
        description: 'Trips currently in progress',
        entityType: 'trip',
        filters: {
          status: ['Scheduled', 'PickedUp', 'InTransit']
        }
      },
      {
        id: 'pending-payment',
        name: 'Pending Payment',
        icon: 'payment',
        description: 'Delivered trips awaiting payment',
        entityType: 'trip',
        filters: {
          status: ['Delivered'],
          invoicePaid: { operator: 'lessThan', value: 'invoiceTotal' }
        }
      },
      {
        id: 'this-week',
        name: 'This Week',
        icon: 'date_range',
        description: 'Trips scheduled this week',
        entityType: 'trip',
        filters: {
          dateRange: {
            preset: 'week'
          }
        }
      },
      {
        id: 'high-value',
        name: 'High Value',
        icon: 'attach_money',
        description: 'Trips with broker payment > $2000',
        entityType: 'trip',
        filters: {
          brokerPayment: { operator: 'greaterThan', value: 2000 }
        }
      },
      {
        id: 'needs-attention',
        name: 'Needs Attention',
        icon: 'warning',
        description: 'Trips with issues or delays',
        entityType: 'trip',
        filters: {
          status: ['Pending', 'Canceled'],
          hasNotes: true
        }
      },
      {
        id: 'completed-unpaid',
        name: 'Completed & Unpaid',
        icon: 'receipt_long',
        description: 'Completed trips with outstanding invoices',
        entityType: 'trip',
        filters: {
          status: ['Delivered', 'Paid'],
          invoicePaid: { operator: 'equals', value: 0 }
        }
      }
    ];
  }

  /**
   * Get predefined quick filter presets for drivers
   */
  getDriverQuickFilters(): QuickFilterPreset[] {
    return [
      {
        id: 'active-drivers',
        name: 'Active Drivers',
        icon: 'person',
        description: 'Currently active drivers',
        entityType: 'driver',
        filters: {
          isActive: true
        }
      },
      {
        id: 'pending-payment',
        name: 'Pending Payment',
        icon: 'payment',
        description: 'Drivers with outstanding payments',
        entityType: 'driver',
        filters: {
          hasOutstandingPayments: true
        }
      },
      {
        id: 'cdl-expiring',
        name: 'CDL Expiring Soon',
        icon: 'warning',
        description: 'CDL expires within 60 days',
        entityType: 'driver',
        filters: {
          cdlExpires: { operator: 'within', days: 60 }
        }
      }
    ];
  }

  /**
   * Get predefined quick filter presets for vehicles
   */
  getVehicleQuickFilters(): QuickFilterPreset[] {
    return [
      {
        id: 'active-vehicles',
        name: 'Active Vehicles',
        icon: 'local_shipping',
        description: 'Currently active vehicles',
        entityType: 'truck',
        filters: {
          isActive: true
        }
      },
      {
        id: 'pending-verification',
        name: 'Pending Verification',
        icon: 'pending',
        description: 'Vehicles awaiting verification',
        entityType: 'truck',
        filters: {
          verificationStatus: 'Pending'
        }
      },
      {
        id: 'high-utilization',
        name: 'High Utilization',
        icon: 'trending_up',
        description: 'Vehicles with >80% utilization',
        entityType: 'truck',
        filters: {
          utilizationRate: { operator: 'greaterThan', value: 80 }
        }
      }
    ];
  }

  /**
   * Clear all saved searches (for testing or user request)
   */
  clearAllSearches(): void {
    this.savedSearchesSubject.next([]);
    this.persistSearches([]);
  }

  private loadSavedSearches(): void {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const searches = JSON.parse(stored).map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          lastUsed: s.lastUsed ? new Date(s.lastUsed) : undefined
        }));
        this.savedSearchesSubject.next(searches);
      }
    } catch (error) {
      console.error('Error loading saved searches:', error);
    }
  }

  private persistSearches(searches: SavedSearch[]): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(searches));
    } catch (error) {
      console.error('Error persisting saved searches:', error);
    }
  }

  private getStorageKey(): string {
    return `${this.STORAGE_KEY_PREFIX}all`;
  }

  private generateId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
