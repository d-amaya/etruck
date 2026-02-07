import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { CarrierService } from '../../../core/services/carrier.service';

export interface CarrierAssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  drivers: Map<string, any>;
  dispatchers: Map<string, any>;
  brokers: Map<string, any>;
  truckPlates: Map<string, string>; // plate -> truckId
  trailerPlates: Map<string, string>; // plate -> trailerId
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CarrierAssetCacheService {
  private cacheSubject = new BehaviorSubject<CarrierAssetCache | null>(null);
  public cache$: Observable<CarrierAssetCache | null> = this.cacheSubject.asObservable();
  private loading = false;
  private refreshing = false;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  private readonly REFRESH_DEBOUNCE_MS = 1000; // 1 second
  private readonly FAILED_LOOKUP_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private lastRefreshAttempt = 0;
  private failedTruckLookups = new Map<string, number>();
  private failedDriverLookups = new Map<string, number>();
  private failedTrailerLookups = new Map<string, number>();

  constructor(private carrierService: CarrierService) {
    this.loadFromLocalStorage();
  }

  loadAssets(): Observable<CarrierAssetCache> {
    const cache = this.cacheSubject.value;
    
    if (cache && !this.loading && this.isCacheValid(cache)) {
      return of(cache);
    }

    if (cache && !this.isCacheValid(cache)) {
      // Removed debug log
      this.cacheSubject.next(null);
    }

    if (this.loading) {
      return this.cache$.pipe(
        map(c => c || this.createEmptyCache())
      );
    }

    this.loading = true;

    return forkJoin({
      trucks: this.carrierService.getTrucks().pipe(
        map(response => response.trucks),
        catchError(() => of([]))
      ),
      trailers: this.carrierService.getTrailers().pipe(
        map(response => response.trailers),
        catchError(() => of([]))
      ),
      drivers: this.carrierService.getUsers('DRIVER').pipe(
        map(response => response.users),
        catchError(() => of([]))
      ),
      dispatchers: this.carrierService.getUsers('DISPATCHER').pipe(
        map(response => response.users),
        catchError(() => of([]))
      ),
      brokers: this.carrierService.getBrokers().pipe(
        catchError(() => of([]))
      )
    }).pipe(
      tap(({ trucks, trailers, drivers, dispatchers, brokers }) => {
        const cache: CarrierAssetCache = {
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          drivers: new Map(drivers.map(d => [d.userId, d])),
          dispatchers: new Map(dispatchers.map(d => [d.userId, d])),
          brokers: new Map(brokers.map(b => [b.brokerId, b])),
          truckPlates: new Map(trucks.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.truckId])),
          trailerPlates: new Map(trailers.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.trailerId])),
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
   * Refresh trucks on cache miss
   */
  private refreshTrucksOnMiss(): Observable<any[]> {
    const now = Date.now();
    
    if (this.refreshing || (now - this.lastRefreshAttempt) < this.REFRESH_DEBOUNCE_MS) {
      const cache = this.cacheSubject.value;
      return of(cache ? Array.from(cache.trucks.values()) : []);
    }
    
    this.lastRefreshAttempt = now;
    this.refreshing = true;
    
    return this.carrierService.getTrucks().pipe(
      map(response => response.trucks),
      tap(trucks => {
        const cache = this.cacheSubject.value;
        if (cache) {
          cache.trucks = new Map(trucks.map(t => [t.truckId, t]));
          cache.truckPlates = new Map(trucks.filter(t => t.isActive).map(t => [t.plate.toUpperCase(), t.truckId]));
          this.cacheSubject.next(cache);
          this.saveToLocalStorage(cache);
        }
        this.refreshing = false;
      }),
      catchError(() => {
        this.refreshing = false;
        const cache = this.cacheSubject.value;
        return of(cache ? Array.from(cache.trucks.values()) : []);
      })
    );
  }

  /**
   * Get truck name with cache-on-miss
   */
  getTruckName(truckId: string): Observable<string> {
    const cache = this.cacheSubject.value;
    if (cache?.trucks.has(truckId)) {
      return of(cache.trucks.get(truckId)?.plate || 'Unknown Truck');
    }

    const failedAt = this.failedTruckLookups.get(truckId);
    if (failedAt && (Date.now() - failedAt) < this.FAILED_LOOKUP_TTL_MS) {
      return of('Unknown Truck');
    }

    return this.refreshTrucksOnMiss().pipe(
      map(trucks => {
        const truck = trucks.find(t => t.truckId === truckId);
        if (!truck) {
          this.failedTruckLookups.set(truckId, Date.now());
        }
        return truck?.plate || 'Unknown Truck';
      })
    );
  }

  clearCache(): void {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_carrier_asset_cache');
  }

  private isCacheValid(cache: CarrierAssetCache): boolean {
    const age = Date.now() - cache.timestamp;
    return age < this.CACHE_TTL_MS;
  }

  private createEmptyCache(): CarrierAssetCache {
    return {
      trucks: new Map(),
      trailers: new Map(),
      drivers: new Map(),
      dispatchers: new Map(),
      brokers: new Map(),
      truckPlates: new Map(),
      trailerPlates: new Map(),
      timestamp: Date.now()
    };
  }

  private saveToLocalStorage(cache: CarrierAssetCache): void {
    try {
      const serialized = {
        trucks: Array.from(cache.trucks.entries()),
        trailers: Array.from(cache.trailers.entries()),
        drivers: Array.from(cache.drivers.entries()),
        dispatchers: Array.from(cache.dispatchers.entries()),
        brokers: Array.from(cache.brokers.entries()),
        truckPlates: Array.from(cache.truckPlates.entries()),
        trailerPlates: Array.from(cache.trailerPlates.entries()),
        timestamp: cache.timestamp
      };
      localStorage.setItem('etrucky_carrier_asset_cache', JSON.stringify(serialized));
    } catch (e) {
      // Removed debug warning
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('etrucky_carrier_asset_cache');
      if (stored) {
        const serialized = JSON.parse(stored);
        const cache: CarrierAssetCache = {
          trucks: new Map(serialized.trucks),
          trailers: new Map(serialized.trailers),
          drivers: new Map(serialized.drivers),
          dispatchers: new Map(serialized.dispatchers),
          brokers: new Map(serialized.brokers),
          truckPlates: new Map(serialized.truckPlates || []),
          trailerPlates: new Map(serialized.trailerPlates || []),
          timestamp: serialized.timestamp || 0
        };
        
        if (this.isCacheValid(cache)) {
          this.cacheSubject.next(cache);
        } else {
          // Removed debug log
          localStorage.removeItem('etrucky_carrier_asset_cache');
        }
      }
    } catch (e) {
      // Removed debug warning
    }
  }
}
