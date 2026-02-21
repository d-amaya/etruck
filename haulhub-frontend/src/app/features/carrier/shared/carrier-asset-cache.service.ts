import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { CarrierService } from '../../../core/services/carrier.service';
import { OrderService } from '../../../core/services/order.service';

export interface CarrierAssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  drivers: Map<string, any>;
  dispatchers: Map<string, any>;
  brokers: Map<string, any>;
  truckPlates: Map<string, string>;
  trailerPlates: Map<string, string>;
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

  constructor(
    private carrierService: CarrierService,
    private orderService: OrderService,
  ) {
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

    return this.carrierService.getAllAssets().pipe(
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

  getCurrentCache(): CarrierAssetCache | null {
    return this.cacheSubject.value;
  }

  /**
   * Resolve cache misses from a set of orders.
   * Checks each entity ID field against its Map, batches all misses
   * into one POST /entities/resolve call, routes results to the
   * correct Map, and persists only the affected Maps to localStorage.
   */
  resolveEntities(entityIds: string[]): Observable<void> {
    const cache = this.cacheSubject.value;
    if (!cache || entityIds.length === 0) return of(undefined);

    const allCached = new Set([
      ...cache.dispatchers.keys(), ...cache.drivers.keys(),
      ...cache.trucks.keys(), ...cache.trailers.keys(), ...cache.brokers.keys(),
    ]);
    const missIds = entityIds.filter(id => !allCached.has(id));
    if (missIds.length === 0) return of(undefined);

    return this.orderService.resolveEntities(missIds).pipe(
      tap((resolved: any) => {
        const entries: [string, any][] = Array.isArray(resolved)
          ? resolved.map((e: any) => [e.id, e])
          : Object.entries(resolved);

        const typeToMap: Record<string, Map<string, any>> = {
          dispatcher: cache.dispatchers,
          driver: cache.drivers,
          carrier: cache.dispatchers, // carriers resolve alongside dispatchers
          truck: cache.trucks,
          trailer: cache.trailers,
          broker: cache.brokers,
        };

        for (const [id, entity] of entries) {
          if (!entity || !entity.name || entity.name === 'Unknown') continue;
          const targetMap = typeToMap[entity.type] || cache.dispatchers;
          targetMap.set(id, { name: entity.name, userId: id, ...entity });
        }
        this.cacheSubject.next({ ...cache });
        this.saveToLocalStorage(cache);
      }),
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  resolveFromOrders(orders: any[]): Observable<void> {
    const cache = this.cacheSubject.value;
    if (!cache) return of(undefined);

    // Collect misses grouped by which field they came from
    const fieldToMap: Record<string, Map<string, any>> = {
      dispatcherId: cache.dispatchers,
      driverId: cache.drivers,
      truckId: cache.trucks,
      trailerId: cache.trailers,
      brokerId: cache.brokers,
    };

    // missOrigin: id → set of field names that reference it
    const missOrigin = new Map<string, Set<string>>();

    for (const order of orders) {
      for (const [field, assetMap] of Object.entries(fieldToMap)) {
        const id = order[field];
        if (id && !assetMap.has(id) && !missOrigin.has(id)) {
          missOrigin.set(id, new Set());
        }
        if (id && missOrigin.has(id)) {
          missOrigin.get(id)!.add(field);
        }
      }
    }

    if (missOrigin.size === 0) return of(undefined);

    const missIds = [...missOrigin.keys()];

    return this.orderService.resolveEntities(missIds).pipe(
      tap((resolved: any) => {
        const entries: [string, any][] = Array.isArray(resolved)
          ? resolved.map((e: any) => [e.id, e])
          : Object.entries(resolved);

        const dirtyMaps = new Set<string>();

        for (const [id, entity] of entries) {
          if (!entity || !entity.name || entity.name === 'Unknown') continue;
          const fields = missOrigin.get(id);
          if (!fields) continue;

          for (const field of fields) {
            const assetMap = fieldToMap[field];
            assetMap.set(id, { name: entity.name, userId: id, ...entity });
            dirtyMaps.add(field);
          }
        }

        if (dirtyMaps.size > 0) {
          this.cacheSubject.next({ ...cache });
          this.saveToLocalStorage(cache);
        }
      }),
      map(() => undefined),
      catchError(() => of(undefined))
    );
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
