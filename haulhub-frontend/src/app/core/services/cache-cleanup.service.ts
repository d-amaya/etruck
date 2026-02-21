import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CacheCleanupService {
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  cleanup(): void {
    const now = Date.now();
    const keysToCheck = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('etrucky_') && key.endsWith('_cache')) {
        keysToCheck.push(key);
      }
    }

    for (const key of keysToCheck) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && now - parsed.timestamp > this.MAX_AGE_MS) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
}
