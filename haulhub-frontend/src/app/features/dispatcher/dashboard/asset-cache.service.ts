import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';

export interface AssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  drivers: Map<string, any>;
  brokers: Map<string, any>;
  truckOwners: Map<string, any>;
  truckPlates: Map<string, string>; // plate -> truckId
  trailerPlates: Map<string, string>; // plate -> trailerId
  driverLicenses: Map<string, string>; // license -> userId
  timestamp: number; // When cache was created
}

@Injectable({
  providedIn: 'root'
})
export class AssetCacheService {
  private cacheSubject = new BehaviorSubject<AssetCache | null>(null);
  public cache$: Observable<AssetCache | null> = this.cacheSubject.asObservable();
  private loading = false;
  private refreshing = false;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  private readonly REFRESH_DEBOUNCE_MS = 1000; // 1 second debounce for cache-on-miss
  private readonly FAILED_LOOKUP_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private lastRefreshAttempt = 0;
  private failedTruckLookups = new Map<string, number>(); // UUID -> timestamp
  private failedDriverLookups = new Map<string, number>();
  private failedTrailerLookups = new Map<string, number>();

  constructor(private tripService: TripService) {
    this.loadFromLocalStorage();
  }

  loadAssets(): Observable<AssetCache> {
    const cache = this.cacheSubject.value;
    
    // Check if cache exists and is still valid (within TTL)
    if (cache && !this.loading && this.isCacheValid(cache)) {
      return of(cache);
    }

    // If cache expired, clear it
    if (cache && !this.isCacheValid(cache)) {
      console.log('Asset cache expired, reloading...');
      this.cacheSubject.next(null);
    }

    if (this.loading) {
      return this.cache$.pipe(
        map(c => c || this.createEmptyCache())
      );
    }

    this.loading = true;

    return forkJoin({
      trucks: this.tripService.getTrucksByCarrier().pipe(catchError(() => of([]))),
      trailers: this.tripService.getTrailersByCarrier().pipe(catchError(() => of([]))),
      drivers: this.tripService.getDriversByCarrier().pipe(catchError(() => of([]))),
      brokers: this.tripService.getBrokers().pipe(catchError(() => of([]))),
      truckOwners: this.tripService.getTruckOwnersByCarrier().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ trucks, trailers, drivers, brokers, truckOwners }) => {
        const cache: AssetCache = {
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          drivers: new Map(drivers.map(d => [d.userId, d])),
          brokers: new Map(brokers.map(b => [b.brokerId, b])),
          truckOwners: new Map(truckOwners.map(o => [o.userId, o])),
          truckPlates: new Map(trucks.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.truckId])),
          trailerPlates: new Map(trailers.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.trailerId])),
          driverLicenses: new Map(drivers.filter(d => d.isActive && d.nationalId).map(d => [d.nationalId!.toUpperCase(), d.userId])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(cache);
        this.saveToLocalStorage(cache);
        this.loading = false;
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => {
        this.loading = false;
        return of(this.createEmptyCache());
      })
    );
  }

  /**
   * Refresh only trucks on miss
   */
  private refreshTrucksOnMiss(): Observable<AssetCache> {
    const now = Date.now();
    
    if (this.refreshing || (now - this.lastRefreshAttempt) < this.REFRESH_DEBOUNCE_MS) {
      return of(this.cacheSubject.value || this.createEmptyCache());
    }
    
    this.lastRefreshAttempt = now;
    this.refreshing = true;
    
    return this.tripService.getTrucksByCarrier().pipe(
      tap(trucks => {
        const currentCache = this.cacheSubject.value || this.createEmptyCache();
        const updatedCache: AssetCache = {
          ...currentCache,
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          truckPlates: new Map(trucks.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.truckId])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(updatedCache);
        this.saveToLocalStorage(updatedCache);
        this.refreshing = false;
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => {
        this.refreshing = false;
        return of(this.cacheSubject.value || this.createEmptyCache());
      })
    );
  }

  /**
   * Refresh only drivers on miss
   */
  private refreshDriversOnMiss(): Observable<AssetCache> {
    const now = Date.now();
    
    if (this.refreshing || (now - this.lastRefreshAttempt) < this.REFRESH_DEBOUNCE_MS) {
      return of(this.cacheSubject.value || this.createEmptyCache());
    }
    
    this.lastRefreshAttempt = now;
    this.refreshing = true;
    
    return this.tripService.getDriversByCarrier().pipe(
      tap(drivers => {
        const currentCache = this.cacheSubject.value || this.createEmptyCache();
        const updatedCache: AssetCache = {
          ...currentCache,
          drivers: new Map(drivers.map(d => [d.userId, d])),
          driverLicenses: new Map(drivers.filter(d => d.isActive && d.nationalId).map(d => [d.nationalId!.toUpperCase(), d.userId])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(updatedCache);
        this.saveToLocalStorage(updatedCache);
        this.refreshing = false;
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => {
        this.refreshing = false;
        return of(this.cacheSubject.value || this.createEmptyCache());
      })
    );
  }

  /**
   * Refresh only trailers on miss
   */
  private refreshTrailersOnMiss(): Observable<AssetCache> {
    const now = Date.now();
    
    if (this.refreshing || (now - this.lastRefreshAttempt) < this.REFRESH_DEBOUNCE_MS) {
      return of(this.cacheSubject.value || this.createEmptyCache());
    }
    
    this.lastRefreshAttempt = now;
    this.refreshing = true;
    
    return this.tripService.getTrailersByCarrier().pipe(
      tap(trailers => {
        const currentCache = this.cacheSubject.value || this.createEmptyCache();
        const updatedCache: AssetCache = {
          ...currentCache,
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          trailerPlates: new Map(trailers.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.trailerId])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(updatedCache);
        this.saveToLocalStorage(updatedCache);
        this.refreshing = false;
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => {
        this.refreshing = false;
        return of(this.cacheSubject.value || this.createEmptyCache());
      })
    );
  }

  /**
   * Refresh cache on miss - called when a UUID lookup fails
   * Uses debouncing to prevent multiple simultaneous refreshes
   */
  refreshOnMiss(): Observable<AssetCache> {
    const now = Date.now();
    
    // Debounce: Don't refresh if we just refreshed within the last second
    if (this.refreshing || (now - this.lastRefreshAttempt) < this.REFRESH_DEBOUNCE_MS) {
      // Return current cache (even if stale) to avoid blocking
      return of(this.cacheSubject.value || this.createEmptyCache());
    }
    
    this.lastRefreshAttempt = now;
    this.refreshing = true;
    
    return forkJoin({
      trucks: this.tripService.getTrucksByCarrier().pipe(catchError(() => of([]))),
      trailers: this.tripService.getTrailersByCarrier().pipe(catchError(() => of([]))),
      drivers: this.tripService.getDriversByCarrier().pipe(catchError(() => of([]))),
      brokers: this.tripService.getBrokers().pipe(catchError(() => of([]))),
      truckOwners: this.tripService.getTruckOwnersByCarrier().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ trucks, trailers, drivers, brokers, truckOwners }) => {
        const cache: AssetCache = {
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          drivers: new Map(drivers.map(d => [d.userId, d])),
          brokers: new Map(brokers.map(b => [b.brokerId, b])),
          truckOwners: new Map(truckOwners.map(o => [o.userId, o])),
          truckPlates: new Map(trucks.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.truckId])),
          trailerPlates: new Map(trailers.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.trailerId])),
          driverLicenses: new Map(drivers.filter(d => d.isActive && d.nationalId).map(d => [d.nationalId!.toUpperCase(), d.userId])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(cache);
        this.saveToLocalStorage(cache);
        this.refreshing = false;
        
        // Clear failed lookups on successful refresh
        this.failedTruckLookups.clear();
        this.failedDriverLookups.clear();
        this.failedTrailerLookups.clear();
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => {
        this.refreshing = false;
        return of(this.createEmptyCache());
      })
    );
  }

  clearCache(): void {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_dispatcher_asset_cache');
  }

  private isCacheValid(cache: AssetCache): boolean {
    const age = Date.now() - cache.timestamp;
    return age < this.CACHE_TTL_MS;
  }

  private createEmptyCache(): AssetCache {
    return {
      trucks: new Map(),
      trailers: new Map(),
      drivers: new Map(),
      brokers: new Map(),
      truckOwners: new Map(),
      truckPlates: new Map(),
      trailerPlates: new Map(),
      driverLicenses: new Map(),
      timestamp: Date.now()
    };
  }

  private saveToLocalStorage(cache: AssetCache): void {
    try {
      const serialized = {
        trucks: Array.from(cache.trucks.entries()),
        trailers: Array.from(cache.trailers.entries()),
        drivers: Array.from(cache.drivers.entries()),
        brokers: Array.from(cache.brokers.entries()),
        truckOwners: Array.from(cache.truckOwners.entries()),
        truckPlates: Array.from(cache.truckPlates.entries()),
        trailerPlates: Array.from(cache.trailerPlates.entries()),
        driverLicenses: Array.from(cache.driverLicenses.entries()),
        timestamp: cache.timestamp
      };
      localStorage.setItem('etrucky_dispatcher_asset_cache', JSON.stringify(serialized));
    } catch (e) {
      console.warn('Failed to save asset cache to localStorage:', e);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('etrucky_dispatcher_asset_cache');
      if (stored) {
        const serialized = JSON.parse(stored);
        const cache: AssetCache = {
          trucks: new Map(serialized.trucks),
          trailers: new Map(serialized.trailers),
          drivers: new Map(serialized.drivers),
          brokers: new Map(serialized.brokers || []),
          truckOwners: new Map(serialized.truckOwners || []),
          truckPlates: new Map(serialized.truckPlates),
          trailerPlates: new Map(serialized.trailerPlates),
          driverLicenses: new Map(serialized.driverLicenses),
          timestamp: serialized.timestamp || 0
        };
        
        // Only restore if cache is still valid
        if (this.isCacheValid(cache)) {
          this.cacheSubject.next(cache);
        } else {
          console.log('Cached assets expired, will reload on first use');
          localStorage.removeItem('etrucky_dispatcher_asset_cache');
        }
      }
    } catch (e) {
      console.warn('Failed to load asset cache from localStorage:', e);
    }
  }

  /**
   * Get truck name by ID with cache-on-miss
   * If truck not found, refresh cache and try again
   */
  getTruckName(truckId: string): Observable<string> {
    const cache = this.cacheSubject.value;
    if (cache?.trucks.has(truckId)) {
      const truck = cache.trucks.get(truckId);
      return of(truck?.plate || truckId.substring(0, 8));
    }
    
    // Check if we've recently tried and failed (within 15 minutes)
    const failedAt = this.failedTruckLookups.get(truckId);
    if (failedAt) {
      const age = Date.now() - failedAt;
      if (age < this.FAILED_LOOKUP_TTL_MS) {
        return of('Unknown');
      } else {
        this.failedTruckLookups.delete(truckId);
      }
    }
    
    // Cache miss - refresh ONLY trucks and retry
    return this.refreshTrucksOnMiss().pipe(
      map(freshCache => {
        const truck = freshCache.trucks.get(truckId);
        
        if (!truck) {
          // Still not found - mark as failed
          this.failedTruckLookups.set(truckId, Date.now());
        } else {
          // Found! Remove from failed list if it was there
          this.failedTruckLookups.delete(truckId);
        }
        
        return truck?.plate || 'Unknown';
      })
    );
  }

  /**
   * Get driver name by ID with cache-on-miss
   */
  getDriverName(driverId: string): Observable<string> {
    const cache = this.cacheSubject.value;
    if (cache?.drivers.has(driverId)) {
      const driver = cache.drivers.get(driverId);
      return of(driver?.name || driverId.substring(0, 8));
    }
    
    // Check if we've recently tried and failed (within 15 minutes)
    const failedAt = this.failedDriverLookups.get(driverId);
    if (failedAt) {
      const age = Date.now() - failedAt;
      if (age < this.FAILED_LOOKUP_TTL_MS) {
        return of('Unknown');
      } else {
        this.failedDriverLookups.delete(driverId);
      }
    }
    
    // Cache miss - refresh ONLY drivers and retry
    return this.refreshDriversOnMiss().pipe(
      map(freshCache => {
        const driver = freshCache.drivers.get(driverId);
        
        if (!driver) {
          // Still not found - mark as failed
          this.failedDriverLookups.set(driverId, Date.now());
        } else {
          // Found! Remove from failed list if it was there
          this.failedDriverLookups.delete(driverId);
        }
        
        return driver?.name || 'Unknown';
      })
    );
  }

  /**
   * Get trailer name by ID with cache-on-miss
   */
  getTrailerName(trailerId: string): Observable<string> {
    const cache = this.cacheSubject.value;
    if (cache?.trailers.has(trailerId)) {
      const trailer = cache.trailers.get(trailerId);
      return of(trailer?.plate || trailerId.substring(0, 8));
    }
    
    // Check if we've recently tried and failed (within 15 minutes)
    const failedAt = this.failedTrailerLookups.get(trailerId);
    if (failedAt) {
      const age = Date.now() - failedAt;
      if (age < this.FAILED_LOOKUP_TTL_MS) {
        return of('Unknown');
      } else {
        this.failedTrailerLookups.delete(trailerId);
      }
    }
    
    // Cache miss - refresh ONLY trailers and retry
    return this.refreshTrailersOnMiss().pipe(
      map(freshCache => {
        const trailer = freshCache.trailers.get(trailerId);
        
        if (!trailer) {
          // Still not found - mark as failed
          this.failedTrailerLookups.set(trailerId, Date.now());
        } else {
          // Found! Remove from failed list if it was there
          this.failedTrailerLookups.delete(trailerId);
        }
        
        return trailer?.plate || 'Unknown';
      })
    );
  }

  /**
   * Get only active trucks for trip creation dropdowns
   */
  getActiveTrucks(): Observable<Array<{ truckId: string; plate: string; brand: string; year: number }>> {
    return this.cache$.pipe(
      map(cache => cache ? Array.from(cache.trucks.values()).filter(t => t.isActive) : [])
    );
  }

  /**
   * Get only active trailers for trip creation dropdowns
   */
  getActiveTrailers(): Observable<Array<{ trailerId: string; plate: string }>> {
    return this.cache$.pipe(
      map(cache => cache ? Array.from(cache.trailers.values()).filter(t => t.isActive) : [])
    );
  }

  /**
   * Get only active drivers for trip creation dropdowns
   */
  getActiveDrivers(): Observable<Array<{ userId: string; name: string }>> {
    return this.cache$.pipe(
      map(cache => cache ? Array.from(cache.drivers.values()).filter(d => d.isActive) : [])
    );
  }
}
