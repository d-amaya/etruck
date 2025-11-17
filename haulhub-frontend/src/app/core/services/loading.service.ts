import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Service to manage loading state across the application
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private requestCount = 0;

  /**
   * Observable to track loading state
   */
  loading$: Observable<boolean> = this.loadingSubject.asObservable();

  /**
   * Show loading indicator
   */
  show(): void {
    this.requestCount++;
    if (this.requestCount === 1) {
      this.loadingSubject.next(true);
    }
  }

  /**
   * Hide loading indicator
   */
  hide(): void {
    this.requestCount--;
    if (this.requestCount <= 0) {
      this.requestCount = 0;
      this.loadingSubject.next(false);
    }
    
    // Safety mechanism: if loading is still active after 30 seconds, force reset
    if (this.requestCount > 0) {
      setTimeout(() => {
        if (this.requestCount > 0) {
          console.warn('Loading service stuck, forcing reset. Request count:', this.requestCount);
          this.reset();
        }
      }, 30000);
    }
  }

  /**
   * Get current loading state
   */
  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Reset loading state (useful for error scenarios)
   */
  reset(): void {
    this.requestCount = 0;
    this.loadingSubject.next(false);
  }
}
