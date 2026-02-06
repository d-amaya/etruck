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
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CarrierAssetCacheService {
  private cacheSubject = new BehaviorSubject<CarrierAssetCache | null>(null);
  public cache$: Observable<CarrierAssetCache | null> = this.cacheSubject.asObservable();
  private loading = false;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private carrierService: CarrierService) {
    this.loadFromSessionStorage();
  }

  loadAssets(): Observable<CarrierAssetCache> {
    const cache = this.cacheSubject.value;
    
    if (cache && !this.loading && this.isCacheValid(cache)) {
      return of(cache);
    }

    if (cache && !this.isCacheValid(cache)) {
      console.log('Carrier asset cache expired, reloading...');
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
          trucks: new Map(trucks.filter(t => t.isActive).map(t => [t.truckId, t])),
          trailers: new Map(trailers.filter(t => t.isActive).map(t => [t.trailerId, t])),
          drivers: new Map(drivers.filter(d => d.isActive).map(d => [d.userId, d])),
          dispatchers: new Map(dispatchers.filter(d => d.isActive).map(d => [d.userId, d])),
          brokers: new Map(brokers.filter(b => b.isActive).map(b => [b.brokerId, b])),
          timestamp: Date.now()
        };
        
        this.cacheSubject.next(cache);
        this.saveToSessionStorage(cache);
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
    sessionStorage.removeItem('carrier_asset_cache');
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
      timestamp: Date.now()
    };
  }

  private saveToSessionStorage(cache: CarrierAssetCache): void {
    try {
      const serialized = {
        trucks: Array.from(cache.trucks.entries()),
        trailers: Array.from(cache.trailers.entries()),
        drivers: Array.from(cache.drivers.entries()),
        dispatchers: Array.from(cache.dispatchers.entries()),
        brokers: Array.from(cache.brokers.entries()),
        timestamp: cache.timestamp
      };
      sessionStorage.setItem('carrier_asset_cache', JSON.stringify(serialized));
    } catch (e) {
      console.warn('Failed to save carrier asset cache to sessionStorage:', e);
    }
  }

  private loadFromSessionStorage(): void {
    try {
      const stored = sessionStorage.getItem('carrier_asset_cache');
      if (stored) {
        const serialized = JSON.parse(stored);
        const cache: CarrierAssetCache = {
          trucks: new Map(serialized.trucks),
          trailers: new Map(serialized.trailers),
          drivers: new Map(serialized.drivers),
          dispatchers: new Map(serialized.dispatchers),
          brokers: new Map(serialized.brokers),
          timestamp: serialized.timestamp || 0
        };
        
        if (this.isCacheValid(cache)) {
          this.cacheSubject.next(cache);
        } else {
          console.log('Cached carrier assets expired, will reload on first use');
          sessionStorage.removeItem('carrier_asset_cache');
        }
      }
    } catch (e) {
      console.warn('Failed to load carrier asset cache from sessionStorage:', e);
    }
  }
}
