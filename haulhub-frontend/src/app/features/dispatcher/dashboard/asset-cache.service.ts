import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map, switchMap } from 'rxjs/operators';
import { OrderService, ResolvedEntity } from '../../../core/services/order.service';

export interface AssetCache {
  trucks: Map<string, any>;
  trailers: Map<string, any>;
  drivers: Map<string, any>;
  brokers: Map<string, any>;
  carriers: Map<string, any>;
  admins: Map<string, any>;
  resolved: Map<string, { name: string; type: string; fetchedAt: number }>;
  truckPlates: Map<string, string>;
  trailerPlates: Map<string, string>;
  driverLicenses: Map<string, string>;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AssetCacheService {
  private cacheSubject = new BehaviorSubject<AssetCache | null>(null);
  public cache$: Observable<AssetCache | null> = this.cacheSubject.asObservable();

  get currentCache(): AssetCache | null { return this.cacheSubject.value; }

  private loading = false;
  private refreshing = false;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000;
  private readonly RESOLVED_TTL_MS = 30 * 60 * 1000; // 30 min
  private readonly REFRESH_DEBOUNCE_MS = 1000;
  private lastRefreshAttempt = 0;

  constructor(private orderService: OrderService) {
    this.loadFromLocalStorage();
  }

  loadAssets(): Observable<AssetCache> {
    const cache = this.cacheSubject.value;
    if (cache && !this.loading && this.isCacheValid(cache)) return of(cache);
    if (cache && !this.isCacheValid(cache)) this.cacheSubject.next(null);
    if (this.loading) return this.cache$.pipe(map(c => c || this.empty()));

    this.loading = true;
    return forkJoin({
      brokers: this.orderService.getBrokers().pipe(catchError(() => of([]))),
      subs: this.orderService.getSubscriptions().pipe(catchError(() => of({ subscribedCarrierIds: [], subscribedAdminIds: [] }))),
    }).pipe(
      switchMap(({ brokers, subs }) => {
        const cache = this.empty();
        cache.brokers = new Map(brokers.map(b => [b.brokerId, b]));
        cache.timestamp = Date.now();

        const carrierIds = subs.subscribedCarrierIds || [];
        const adminIds = subs.subscribedAdminIds || [];
        const ids: string[] = [...carrierIds, ...adminIds];
        if (ids.length > 0) {
          return this.orderService.resolveEntities(ids).pipe(
            tap((result) => {
              const entities = Array.isArray(result) ? result : Object.entries(result).map(([id, v]: [string, any]) => ({ id, ...v }));
              for (const e of entities) {
                if ((carrierIds as string[]).includes(e.id)) cache.carriers.set(e.id, { userId: e.id, name: e.name });
                if ((adminIds as string[]).includes(e.id)) cache.admins.set(e.id, { userId: e.id, name: e.name });
              }
            }),
            map(() => cache),
            catchError(() => of(cache)),
          );
        }
        return of(cache);
      }),
      tap(cache => {
        this.cacheSubject.next(cache);
        this.saveToLocalStorage(cache);
        this.loading = false;
      }),
      catchError(() => { this.loading = false; return of(this.empty()); }),
    );
  }

  forceRefresh(): Observable<AssetCache> {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_dispatcher_asset_cache');
    return this.loadAssets();
  }

  resolveEntities(ids: string[]): Observable<ResolvedEntity[]> {
    const cache = this.cacheSubject.value || this.empty();
    const now = Date.now();
    const missing = ids.filter(id => {
      if (cache.brokers.has(id)) return false;
      const r = cache.resolved.get(id);
      return !r || (now - r.fetchedAt > this.RESOLVED_TTL_MS);
    });
    if (missing.length === 0) {
      return of(ids.map(id => {
        const b = cache.brokers.get(id);
        if (b) return { id, name: b.brokerName || b.name || id.substring(0, 8), type: 'broker' };
        const r = cache.resolved.get(id);
        return { id, ...r, name: r?.name || id.substring(0, 8), type: r?.type || 'unknown' };
      }));
    }
    return this.orderService.resolveEntities(missing).pipe(
      map(result => {
        const entities = Array.isArray(result) ? result : Object.entries(result).map(([id, v]: [string, any]) => ({ id, ...v }));
        for (const e of entities) {
          cache.resolved.set(e.id, { ...e, fetchedAt: now });
        }
        this.cacheSubject.next(cache);
        this.saveToLocalStorage(cache);
        const resolved = new Map(entities.map(e => [e.id, e]));
        return ids.map(id => {
          const b = cache.brokers.get(id);
          if (b) return { id, name: b.brokerName || b.name || id.substring(0, 8), type: 'broker' };
          return resolved.get(id) || {
            id, name: cache.resolved.get(id)?.name || id.substring(0, 8), type: 'unknown'
          };
        });
      }),
      catchError(() => of(ids.map(id => ({ id, name: id.substring(0, 8), type: 'unknown' }))))
    );
  }

  getSubscribedCarriers(): Map<string, any> {
    return this.cacheSubject.value?.carriers || new Map();
  }

  getSubscribedAdmins(): Map<string, any> {
    return this.cacheSubject.value?.admins || new Map();
  }

  // ── Name lookups ──────────────────────────────────────────

  getTruckName(truckId: string): Observable<string> {
    const t = this.cacheSubject.value?.trucks.get(truckId);
    if (t) return of(t.plate || truckId.substring(0, 8));
    return this.resolveEntities([truckId]).pipe(map(r => r[0]?.name || 'Unknown'));
  }

  getDriverName(driverId: string): Observable<string> {
    const d = this.cacheSubject.value?.drivers.get(driverId);
    if (d) return of(d.name || driverId.substring(0, 8));
    return this.resolveEntities([driverId]).pipe(map(r => r[0]?.name || 'Unknown'));
  }

  getTrailerName(trailerId: string): Observable<string> {
    const t = this.cacheSubject.value?.trailers.get(trailerId);
    if (t) return of(t.plate || trailerId.substring(0, 8));
    return this.resolveEntities([trailerId]).pipe(map(r => r[0]?.name || 'Unknown'));
  }

  getCarrierName(carrierId: string): Observable<string> {
    const c = this.cacheSubject.value?.carriers.get(carrierId);
    if (c) return of(c.name || carrierId.substring(0, 8));
    return this.resolveEntities([carrierId]).pipe(map(r => r[0]?.name || 'Unknown'));
  }

  getActiveTrucks(): Observable<any[]> {
    return this.cache$.pipe(map(c => c ? Array.from(c.trucks.values()).filter(t => t.isActive) : []));
  }

  getActiveTrailers(): Observable<any[]> {
    return this.cache$.pipe(map(c => c ? Array.from(c.trailers.values()).filter(t => t.isActive) : []));
  }

  getActiveDrivers(): Observable<any[]> {
    return this.cache$.pipe(map(c => c ? Array.from(c.drivers.values()).filter(d => d.isActive) : []));
  }

  clearCache(): void {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_dispatcher_asset_cache');
  }

  // ── Private ───────────────────────────────────────────────

  private isCacheValid(cache: AssetCache): boolean {
    return (Date.now() - cache.timestamp) < this.CACHE_TTL_MS;
  }

  private empty(): AssetCache {
    return {
      trucks: new Map(), trailers: new Map(), drivers: new Map(),
      brokers: new Map(), carriers: new Map(), admins: new Map(),
      resolved: new Map(),
      truckPlates: new Map(), trailerPlates: new Map(), driverLicenses: new Map(),
      timestamp: Date.now(),
    };
  }

  private saveToLocalStorage(cache: AssetCache): void {
    try {
      const s = {
        trucks: Array.from(cache.trucks.entries()),
        trailers: Array.from(cache.trailers.entries()),
        drivers: Array.from(cache.drivers.entries()),
        brokers: Array.from(cache.brokers.entries()),
        carriers: Array.from(cache.carriers.entries()),
        admins: Array.from(cache.admins.entries()),
        resolved: Array.from(cache.resolved.entries()),
        truckPlates: Array.from(cache.truckPlates.entries()),
        trailerPlates: Array.from(cache.trailerPlates.entries()),
        driverLicenses: Array.from(cache.driverLicenses.entries()),
        timestamp: cache.timestamp,
      };
      localStorage.setItem('etrucky_dispatcher_asset_cache', JSON.stringify(s));
    } catch (e) { console.warn('Failed to save asset cache:', e); }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('etrucky_dispatcher_asset_cache');
      if (!stored) return;
      const s = JSON.parse(stored);
      const cache: AssetCache = {
        trucks: new Map(s.trucks || []),
        trailers: new Map(s.trailers || []),
        drivers: new Map(s.drivers || []),
        brokers: new Map(s.brokers || []),
        carriers: new Map(s.carriers || []),
        admins: new Map(s.admins || []),
        resolved: new Map(s.resolved || []),
        truckPlates: new Map(s.truckPlates || []),
        trailerPlates: new Map(s.trailerPlates || []),
        driverLicenses: new Map(s.driverLicenses || []),
        timestamp: s.timestamp || 0,
      };
      if (this.isCacheValid(cache)) this.cacheSubject.next(cache);
      else localStorage.removeItem('etrucky_dispatcher_asset_cache');
    } catch (e) { console.warn('Failed to load asset cache:', e); }
  }
}
