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
      brokerName: 'Broker One',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      brokerId: 'broker2',
      brokerName: 'Broker Two',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      brokerId: 'broker3',
      brokerName: 'Inactive Broker',
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
        expect(filters.dateRange.startDate).toBeNull();
        expect(filters.dateRange.endDate).toBeNull();
        expect(filters.status).toBeNull();
        expect(filters.brokerId).toBeNull();
        expect(filters.lorryId).toBeNull();
        expect(filters.driverId).toBeNull();
        expect(filters.driverName).toBeNull();
        done();
      });
    });

    it('should initialize with default pagination', (done) => {
      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0);
        expect(pagination.pageSize).toBe(25);
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

      service.updateFilters(partialFilters);

      service.filters$.subscribe(filters => {
        expect(filters.status).toBe(TripStatus.Scheduled);
        expect(filters.dateRange.startDate).toBeNull(); // Other filters remain unchanged
        done();
      });
    });

    it('should update date range filters', (done) => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      service.updateFilters({
        dateRange: { startDate, endDate }
      });

      service.filters$.subscribe(filters => {
        expect(filters.dateRange.startDate).toEqual(startDate);
        expect(filters.dateRange.endDate).toEqual(endDate);
        done();
      });
    });

    it('should reset pagination to page 0 when filters change', (done) => {
      // First set pagination to page 2
      service.updatePagination({ page: 2 });

      // Then update filters
      service.updateFilters({ status: TripStatus.Delivered });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0);
        done();
      });
    });

    it('should update multiple filters at once', (done) => {
      service.updateFilters({
        status: TripStatus.InTransit,
        brokerId: 'broker1',
        lorryId: 'lorry123'
      });

      service.filters$.subscribe(filters => {
        expect(filters.status).toBe(TripStatus.InTransit);
        expect(filters.brokerId).toBe('broker1');
        expect(filters.lorryId).toBe('lorry123');
        done();
      });
    });
  });

  describe('updatePagination', () => {
    it('should update page number', (done) => {
      service.updatePagination({ page: 3 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(3);
        expect(pagination.pageSize).toBe(25); // pageSize remains unchanged
        done();
      });
    });

    it('should update page size', (done) => {
      service.updatePagination({ pageSize: 50 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0); // page remains unchanged
        expect(pagination.pageSize).toBe(50);
        done();
      });
    });

    it('should update both page and pageSize', (done) => {
      service.updatePagination({ page: 2, pageSize: 100 });

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(2);
        expect(pagination.pageSize).toBe(100);
        done();
      });
    });
  });

  describe('clearFilters', () => {
    it('should reset all filters to default values', (done) => {
      // First set some filters
      service.updateFilters({
        status: TripStatus.Paid,
        brokerId: 'broker1',
        lorryId: 'lorry123',
        driverName: 'John Doe',
        dateRange: { startDate: new Date(), endDate: new Date() }
      });

      // Then clear filters
      service.clearFilters();

      service.filters$.subscribe(filters => {
        expect(filters.dateRange.startDate).toBeNull();
        expect(filters.dateRange.endDate).toBeNull();
        expect(filters.status).toBeNull();
        expect(filters.brokerId).toBeNull();
        expect(filters.lorryId).toBeNull();
        expect(filters.driverId).toBeNull();
        expect(filters.driverName).toBeNull();
        done();
      });
    });

    it('should reset pagination to default values', (done) => {
      // First set pagination
      service.updatePagination({ page: 5, pageSize: 100 });

      // Then clear filters
      service.clearFilters();

      service.pagination$.subscribe(pagination => {
        expect(pagination.page).toBe(0);
        expect(pagination.pageSize).toBe(25);
        done();
      });
    });
  });

  describe('getActiveFilterCount', () => {
    it('should return 0 when no filters are active', () => {
      const count = service.getActiveFilterCount();
      expect(count).toBe(0);
    });

    it('should count date range as 1 filter when start date is set', () => {
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: null }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count date range as 1 filter when end date is set', () => {
      service.updateFilters({
        dateRange: { startDate: null, endDate: new Date() }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count date range as 1 filter when both dates are set', () => {
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: new Date() }
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count status filter', () => {
      service.updateFilters({ status: TripStatus.Scheduled });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count broker filter', () => {
      service.updateFilters({ brokerId: 'broker1' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count lorry filter', () => {
      service.updateFilters({ lorryId: 'lorry123' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver name as 1 filter', () => {
      service.updateFilters({ driverName: 'John Doe' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver ID as 1 filter', () => {
      service.updateFilters({ driverId: 'driver123' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count driver name and ID as 1 filter (not 2)', () => {
      service.updateFilters({ driverId: 'driver123', driverName: 'John Doe' });
      const count = service.getActiveFilterCount();
      expect(count).toBe(1);
    });

    it('should count multiple active filters correctly', () => {
      service.updateFilters({
        dateRange: { startDate: new Date(), endDate: new Date() },
        status: TripStatus.InTransit,
        brokerId: 'broker1',
        lorryId: 'lorry123',
        driverName: 'John Doe'
      });
      const count = service.getActiveFilterCount();
      expect(count).toBe(5);
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
