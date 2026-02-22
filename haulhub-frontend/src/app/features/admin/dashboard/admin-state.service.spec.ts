import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AdminDashboardStateService } from './admin-state.service';

describe('AdminDashboardStateService', () => {
  let service: AdminDashboardStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(AdminDashboardStateService);
  });

  describe('analyticsCache', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    const data = { tripAnalytics: { totalTrips: 10 } };

    it('should return null when no cache exists', () => {
      expect(service.getCachedAnalytics(start, end)).toBeNull();
    });

    it('should return cached data on key match', () => {
      service.setCachedAnalytics(start, end, data);
      expect(service.getCachedAnalytics(start, end)).toEqual(data);
    });

    it('should return null on key mismatch', () => {
      service.setCachedAnalytics(start, end, data);
      expect(service.getCachedAnalytics(new Date('2026-02-01'), end)).toBeNull();
    });
  });

  describe('paymentCache', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    const data = { orderCount: 5, totalOrderRate: 25000 };

    it('should return null when no cache exists', () => {
      expect(service.getCachedPaymentReport(start, end)).toBeNull();
    });

    it('should return cached data on key match', () => {
      service.setCachedPaymentReport(start, end, data);
      expect(service.getCachedPaymentReport(start, end)).toEqual(data);
    });

    it('should return null on key mismatch', () => {
      service.setCachedPaymentReport(start, end, data);
      expect(service.getCachedPaymentReport(start, new Date('2026-02-28'))).toBeNull();
    });
  });

  describe('invalidateViewCaches', () => {
    it('should clear all three caches', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const filters = service.getCurrentFilters();
      const pagination = { page: 0, pageSize: 25, pageTokens: [] as string[] };

      service.setCachedTrips(filters, pagination, { orders: [] });
      service.setCachedAnalytics(start, end, { tripAnalytics: {} });
      service.setCachedPaymentReport(start, end, { orderCount: 0 });

      service.invalidateViewCaches();

      expect(service.getCachedTrips(filters, pagination)).toBeNull();
      expect(service.getCachedAnalytics(start, end)).toBeNull();
      expect(service.getCachedPaymentReport(start, end)).toBeNull();
    });
  });
});
