import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { OrderService, ResolvedEntity } from '../../../core/services/order.service';

export interface AdminAssetCache {
  brokers: Map<string, any>;
  resolved: Map<string, { name: string; type: string; fetchedAt: number }>;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AdminAssetCacheService {
  private cacheSubject = new BehaviorSubject<AdminAssetCache | null>(null);
  public cache$ = this.cacheSubject.asObservable();
  get currentCache(): AdminAssetCache | null { return this.cacheSubject.value; }

  private loading = false;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000;
  private readonly RESOLVED_TTL_MS = 30 * 60 * 1000;

  constructor(private orderService: OrderService) {
    this.loadFromLocalStorage();
  }

  loadAssets(): Observable<AdminAssetCache> {
    const cache = this.cacheSubject.value;
    if (cache && !this.loading && this.isCacheValid(cache)) return of(cache);
    if (this.loading) return this.cache$.pipe(map(c => c || this.empty()));

    this.loading = true;
    return this.orderService.getBrokers().pipe(
      tap(brokers => {
        const c = this.empty();
        c.brokers = new Map(brokers.map(b => [b.brokerId, b]));
        c.timestamp = Date.now();
        this.cacheSubject.next(c);
        this.saveToLocalStorage(c);
        this.loading = false;
      }),
      map(() => this.cacheSubject.value!),
      catchError(() => { this.loading = false; return of(this.empty()); })
    );
  }

  resolveEntities(ids: string[]): Observable<ResolvedEntity[]> {
    const cache = this.cacheSubject.value || this.empty();
    const now = Date.now();
    const missing = ids.filter(id => {
      const r = cache.resolved.get(id);
      return !r || (now - r.fetchedAt > this.RESOLVED_TTL_MS);
    });
    if (missing.length === 0) {
      return of(ids.map(id => {
        const r = cache.resolved.get(id);
        return { id, name: r?.name || id.substring(0, 8), type: r?.type || 'unknown' };
      }));
    }
    return this.orderService.resolveEntities(missing).pipe(
      tap(entities => {
        for (const e of entities) cache.resolved.set(e.id, { name: e.name, type: e.type, fetchedAt: now });
        this.cacheSubject.next(cache);
      }),
      map(entities => {
        const resolved = new Map(entities.map(e => [e.id, e]));
        return ids.map(id => resolved.get(id) || { id, name: cache.resolved.get(id)?.name || id.substring(0, 8), type: 'unknown' });
      }),
      catchError(() => of(ids.map(id => ({ id, name: id.substring(0, 8), type: 'unknown' }))))
    );
  }

  getBrokerName(brokerId: string): string {
    return this.cacheSubject.value?.brokers.get(brokerId)?.brokerName || brokerId.substring(0, 8);
  }

  getResolvedName(id: string): string {
    return this.cacheSubject.value?.resolved.get(id)?.name || id.substring(0, 8);
  }

  clearCache(): void {
    this.cacheSubject.next(null);
    localStorage.removeItem('etrucky_admin_asset_cache');
  }

  private isCacheValid(cache: AdminAssetCache): boolean { return (Date.now() - cache.timestamp) < this.CACHE_TTL_MS; }
  private empty(): AdminAssetCache { return { brokers: new Map(), resolved: new Map(), timestamp: Date.now() }; }

  private saveToLocalStorage(cache: AdminAssetCache): void {
    try {
      localStorage.setItem('etrucky_admin_asset_cache', JSON.stringify({
        brokers: Array.from(cache.brokers.entries()),
        resolved: Array.from(cache.resolved.entries()),
        timestamp: cache.timestamp,
      }));
    } catch (e) { console.warn('Failed to save admin asset cache:', e); }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('etrucky_admin_asset_cache');
      if (!stored) return;
      const s = JSON.parse(stored);
      const cache: AdminAssetCache = { brokers: new Map(s.brokers || []), resolved: new Map(s.resolved || []), timestamp: s.timestamp || 0 };
      if (this.isCacheValid(cache)) this.cacheSubject.next(cache);
      else localStorage.removeItem('etrucky_admin_asset_cache');
    } catch (e) { console.warn('Failed to load admin asset cache:', e); }
  }
}
