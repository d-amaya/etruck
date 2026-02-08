import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';

export interface DriverAssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  dispatchers: Map<string, any>;
  truckPlates: Map<string, string>;
  trailerPlates: Map<string, string>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class DriverAssetCacheService {
  private cacheSubject = new BehaviorSubject<DriverAssetCache | null>(null);
  public cache$: Observable<DriverAssetCache | null> = this.cacheSubject.asObservable();
  private loading = false;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  private readonly FAILED_LOOKUP_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private failedTruckLookups = new Map<string, number>();
  private failedTrailerLookups = new Map<string, number>();
  private failedDispatcherLookups = new Map<string, number>();

  constructor(private tripService: TripService) {
    this.loadFromLocalStorage();
  }

  loadAssets(): Observable<DriverAssetCache> {
    const cache = this.cacheSubject.value;
    
    if (cache && !this.loading && this.isCacheValid(cache)) {
      return of(cache);
    }

    if (cache && !this.isCacheValid(cache)) {
      this.cacheSubject.next(null);
    }

    if (this.loading) {
      return this.cache$.pipe(map(c => c || this.createEmptyCache()));
    }

    this.loading = true;

    return forkJoin({
      trucks: this.tripService.getTrucksByCarrier().pipe(catchError(() => of([]))),
      trailers: this.tripService.getTrailersByCarrier().pipe(catchError(() => of([]))),
      dispatchers: this.tripService.getDispatchersByCarrier().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ trucks, trailers, dispatchers }) => {
        const cache: DriverAssetCache = {
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          dispatchers: new Map(dispatchers.map(d => [d.userId, d])),
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

  getTruckName(truckId: string): string {
    const cache = this.cacheSubject.value;
    if (!cache) return truckId;
    
    const truck = cache.trucks.get(truckId);
    return truck?.plate || truckId;
  }

  getTrailerName(trailerId: string): string {
    const cache = this.cacheSubject.value;
    if (!cache) return trailerId;
    
    const trailer = cache.trailers.get(trailerId);
    return trailer?.plate || trailerId;
  }

  getDispatcherName(dispatcherId: string): string {
    const cache = this.cacheSubject.value;
    if (!cache) return dispatcherId;
    
    const dispatcher = cache.dispatchers.get(dispatcherId);
    return dispatcher?.name || dispatcherId;
  }

  clearCache(): void {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_driver_asset_cache');
  }

  private isCacheValid(cache: DriverAssetCache): boolean {
    return (Date.now() - cache.timestamp) < this.CACHE_TTL_MS;
  }

  private createEmptyCache(): DriverAssetCache {
    return {
      trucks: new Map(),
      trailers: new Map(),
      dispatchers: new Map(),
      truckPlates: new Map(),
      trailerPlates: new Map(),
      timestamp: Date.now()
    };
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('etrucky_driver_asset_cache');
      if (stored) {
        const parsed = JSON.parse(stored);
        const cache: DriverAssetCache = {
          trucks: new Map(parsed.trucks),
          trailers: new Map(parsed.trailers),
          dispatchers: new Map(parsed.dispatchers),
          truckPlates: new Map(parsed.truckPlates),
          trailerPlates: new Map(parsed.trailerPlates),
          timestamp: parsed.timestamp
        };
        
        if (this.isCacheValid(cache)) {
          this.cacheSubject.next(cache);
        }
      }
    } catch (error) {
      console.error('Failed to load asset cache from localStorage:', error);
    }
  }

  private saveToLocalStorage(cache: DriverAssetCache): void {
    try {
      const serialized = {
        trucks: Array.from(cache.trucks.entries()),
        trailers: Array.from(cache.trailers.entries()),
        dispatchers: Array.from(cache.dispatchers.entries()),
        truckPlates: Array.from(cache.truckPlates.entries()),
        trailerPlates: Array.from(cache.trailerPlates.entries()),
        timestamp: cache.timestamp
      };
      localStorage.setItem('etrucky_driver_asset_cache', JSON.stringify(serialized));
    } catch (error) {
      console.error('Failed to save asset cache to localStorage:', error);
    }
  }
}
