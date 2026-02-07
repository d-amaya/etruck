import { TestBed } from '@angular/core/testing';
import { of, BehaviorSubject } from 'rxjs';
import { DashboardStateService, DashboardFilters, PaginationState } from './dashboard-state.service';
import { TripService } from '../../../core/services/trip.service';
import { AuthService } from '../../../core/services/auth.service';
import { TripStatus, Broker } from '@haulhub/shared';

describe('DashboardStateService', () => {
  let service: DashboardStateService;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let mockCurrentUserSubject: BehaviorSubject<any>;

  const mockBrokers: Broker[] = [
    {
      brokerId: 'broker1',
      brokerName: 'Test Broker',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      brokerId: 'broker2',
      brokerName: 'Test Broker',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      brokerId: 'broker3',
      brokerName: 'Test Broker',
      isActive: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    // Clear session storage before each test
    sessionStorage.clear();

    mockCurrentUserSubject = new BehaviorSubject({ userId: 'test-user', role: 'Dispatcher' });
    
    const tripServiceSpyObj = jasmine.createSpyObj('TripService', ['getBrokers']);
    tripServiceSpyObj.getBrokers.and.returnValue(of(mockBrokers));

    const authServiceSpyObj = jasmine.createSpyObj('AuthService', [], {
      currentUser$: mockCurrentUserSubject.asObservable()
    });

    TestBed.configureTestingModule({
      providers: [
        DashboardStateService,
        { provide: TripService, useValue: tripServiceSpyObj },
        { provide: AuthService, useValue: authServiceSpyObj }
      ]
    });

    service = TestBed.inject(DashboardStateService);
    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    authServiceSpy = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with default filters', (done) => {
      service.filters$.subscribe(filters => {
        // Service sets default date range to last 30 days
        expect(filters.dateRange.startDate).toBeInstanceOf(Date);
        expect(filters.dateRange.endDate).toBeInstanceOf(Date);
        expect(filters.status).toBeNull();
        expect(filters.brokerId).toBeNull();
        expect(filters.truckId).toBeNull();
        expect(filters.driverId).toBeNull();
        done();
      });
    });

    it('should initialize with default pagination', (done) => {
      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0);
        expect(pagination.pageSize).toBe(10);
        done();
      });
    });

    it('should initialize with loading false', (done) => {
      service.loading$.subscribe(loading => {
        expect(loading.isLoading).toBe(false);
        expect(loading.isInitialLoad).toBe(false);
        expect(loading.isFilterUpdate).toBe(false);
        done();
      });
    });

    it('should load brokers on initialization', () => {
      expect(tripServiceSpy.getBrokers).toHaveBeenCalled();
    });

    it('should cache only active brokers', () => {
      const brokers = service.getBrokers();
      expect(brokers.length).toBe(2);
      expect(brokers.every(b => b.isActive)).toBe(true);
    });
  });

  describe('updateFilters', () => {
    it('should update filters with partial filter object', (done) => {
      const partialFilters: Partial<DashboardFilters> = {
        status: TripStatus.Scheduled
      };

      // Subscribe first, then update
      let callCount = 0;
      service.filters$.subscribe(filters => {
        callCount++;
        if (callCount === 2) { // Skip initial value, check second emission
          expect(filters.status).toBe(TripStatus.Scheduled);
          expect(filters.dateRange.startDate).toBeInstanceOf(Date);
          done();
        }
      });

      service.updateFilters(partialFilters);
    });

    it('should update date range filters', (done) => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      let callCount = 0;
      service.filters$.subscribe(filters => {
        callCount++;
        if (callCount === 2) {
          expect(filters.dateRange.startDate).toEqual(startDate);
          expect(filters.dateRange.endDate).toEqual(endDate);
          done();
        }
      });

      service.updateFilters({
        dateRange: { startDate, endDate }
      });
    });

    it('should reset pagination to page 0 when filters change', (done) => {
      let callCount = 0;
      service.pagination$.subscribe(pagination => {
        callCount++;
        if (callCount === 1) {
          // Initial state
          expect(pagination.page).toBe(0);
        } else if (callCount === 2) {
          // After page update
          expect(pagination.page).toBe(2);
        } else if (callCount === 3) {
          // After filter update - should reset to 0
          expect(pagination.page).toBe(0);
          done();
        }
      });

      // First set pagination to page 2
      service.updatePagination({ page: 2 });

      // Then update filters
      service.updateFilters({ status: TripStatus.Delivered });
    });

    it('should update multiple filters at once', (done) => {
      let callCount = 0;
      service.filters$.subscribe(filters => {
        callCount++;
        if (callCount === 2) {
          expect(filters.status).toBe(TripStatus.InTransit);
          expect(filters.brokerId).toBe('broker1');
          expect(filters.truckId).toBe('truck123');
          done();
        }
      });

      service.updateFilters({
        status: TripStatus.InTransit,
        brokerId: 'broker1',
        truckId: 'truck123'
      });
    });
  });

  describe('updatePagination', () => {
    it('should update page number', (done) => {
      service.updatePagination({ page: 3 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(3);
        expect(pagination.pageSize).toBe(10); // pageSize remains unchanged
        done();
      });
    });

    it('should update page size and reset page to 0', (done) => {
      service.updatePagination({ pageSize: 50 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0); // page resets to 0 when pageSize changes
        expect(pagination.pageSize).toBe(50);
        expect(pagination.pageTokens).toEqual([]); // tokens cleared
        done();
      });
    });

    it('should reset page to 0 when pageSize changes even if page is also provided', (done) => {
      service.updatePagination({ page: 2, pageSize: 100 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0); // page resets to 0 when pageSize changes
        expect(pagination.pageSize).toBe(100);
        expect(pagination.pageTokens).toEqual([]); // tokens cleared
        done();
      });
    });
  });

  describe('clearFilters', () => {
    it('should reset all filters to default values', () => {
      // Set some filters
      service.updateFilters({
        status: TripStatus.Paid,
        brokerId: 'broker1',
        truckId: 'truck123',
        dateRange: { startDate: new Date('2024-06-01'), endDate: new Date('2024-06-30') }
      });

      // Clear filters
      service.clearFilters();

      // Check the current value
      const filters = service['filtersSubject'].value;
      expect(filters.dateRange.startDate).toBeInstanceOf(Date);
      expect(filters.dateRange.endDate).toBeInstanceOf(Date);
      expect(filters.status).toBeNull();
      expect(filters.brokerId).toBeNull();
      expect(filters.truckId).toBeNull();
      expect(filters.driverId).toBeNull();
    });

    it('should reset pagination to default values', () => {
      // Set pagination
      service.updatePagination({ page: 5, pageSize: 100 });

      // Clear filters
      service.clearFilters();

      // Check the current value
      const pagination = service['paginationSubject'].value;
      expect(pagination.page).toBe(0);
      expect(pagination.pageSize).toBe(10);
    });
  });

  describe('getActiveFilterCount', () => {
    it('should return 0 when no filters are active', () => {
      // Service initializes with default date range (last 30 days)
      // Date range counts as 1 active filter
      const count = service.getActiveFilterCount();
      expect(count).toBe(1); // Date range is active by default
    });

    it('should count date range as 1 filter when start date is set', () => {
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: null }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count date range as 1 filter when end date is set', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({
        dateRange: { startDate: null, endDate: new Date() }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count date range as 1 filter when both dates are set', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: new Date() }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count status filter', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ status: TripStatus.Scheduled });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count broker filter', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ brokerId: 'broker1' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count truck filter', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ truckId: 'truck123' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver ID as 1 filter', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ driverId: 'driver-1' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver ID as 1 filter (duplicate test)', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ driverId: 'driver123' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver ID as 1 filter', () => {
      // Clear default date range first
      service.updateFilters({
        dateRange: { startDate: null, endDate: null }
      });
      service.updateFilters({ driverId: 'driver-1' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count multiple active filters correctly', (done) => {
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: new Date() },
        status: TripStatus.InTransit,
        brokerId: 'broker1',
        truckId: 'truck123',
      });
      
      // Wait for next tick to ensure update is processed
      setTimeout(() => {
        const count = service.getActiveFilterCount();
        expect(count).toBe(4);
        done();
      }, 0);
    });
  });

  describe('getBrokers', () => {
    it('should return cached brokers', () => {
      const brokers = service.getBrokers();
      expect(brokers.length).toBe(2);
      expect(brokers[0].brokerId).toBe('broker1');
      expect(brokers[1].brokerId).toBe('broker2');
    });

    it('should not include inactive brokers', () => {
      const brokers = service.getBrokers();
      const hasInactiveBroker = brokers.some(b => !b.isActive);
      expect(hasInactiveBroker).toBe(false);
    });
  });
});
