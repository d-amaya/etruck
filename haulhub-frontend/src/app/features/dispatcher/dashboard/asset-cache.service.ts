import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';

export interface AssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  drivers: Map<string, any>;
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
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      drivers: this.tripService.getDriversByCarrier().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ trucks, trailers, drivers }) => {
        const cache: AssetCache = {
          trucks: new Map(trucks.map(t => [t.truckId, t])),
          trailers: new Map(trailers.map(t => [t.trailerId, t])),
          drivers: new Map(drivers.map(d => [d.userId, d])),
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

  clearCache(): void {
    this.cacheSubject.next(null);
    sessionStorage.removeItem('dispatcher_asset_cache');
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
        truckPlates: Array.from(cache.truckPlates.entries()),
        trailerPlates: Array.from(cache.trailerPlates.entries()),
        driverLicenses: Array.from(cache.driverLicenses.entries()),
        timestamp: cache.timestamp
      };
      sessionStorage.setItem('dispatcher_asset_cache', JSON.stringify(serialized));
    } catch (e) {
      console.warn('Failed to save asset cache to sessionStorage:', e);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = sessionStorage.getItem('dispatcher_asset_cache');
      if (stored) {
        const serialized = JSON.parse(stored);
        const cache: AssetCache = {
          trucks: new Map(serialized.trucks),
          trailers: new Map(serialized.trailers),
          drivers: new Map(serialized.drivers),
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
          sessionStorage.removeItem('dispatcher_asset_cache');
        }
      }
    } catch (e) {
      console.warn('Failed to load asset cache from sessionStorage:', e);
    }
  }
}
