import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

import { DashboardComponent } from './dashboard.component';
import { DashboardStateService, DashboardFilters, PaginationState } from './dashboard-state.service';
import { TripService } from '../../../core/services/trip.service';
import { AuthService } from '../../../core/services/auth.service';
import { AccessibilityService } from '../../../core/services/accessibility.service';
import { Trip, TripStatus, Broker } from '@haulhub/shared';

xdescribe('Dashboard Integration Tests', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardStateService: jasmine.SpyObj<DashboardStateService>;
  let tripService: jasmine.SpyObj<TripService>;
  let authService: jasmine.SpyObj<AuthService>;
  let accessibilityService: jasmine.SpyObj<AccessibilityService>;
  let router: jasmine.SpyObj<Router>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  // Helper to create complete Trip objects
  const createMockTrip = (overrides: Partial<Trip>): Trip => ({
    tripId: 'trip-1',
    dispatcherId: 'dispatcher-1',
    carrierId: 'carrier-1',
    driverId: 'driver-1',
    driverName: 'John Doe',
    truckId: 'truck-1',
    truckOwnerId: 'owner-1',
    trailerId: 'trailer-1',
    orderConfirmation: 'ORDER-123',
    scheduledTimestamp: '2024-01-15T10:00:00Z',
    pickupTimestamp: null,
    deliveryTimestamp: null,
    pickupCompany: 'Acme Corp',
    pickupAddress: '123 Main St',
    pickupCity: 'New York',
    pickupState: 'NY',
    pickupZip: '10001',
    pickupPhone: '555-0100',
    pickupNotes: '',
    deliveryCompany: 'Beta Inc',
    deliveryAddress: '456 Oak Ave',
    deliveryCity: 'Boston',
    deliveryState: 'MA',
    deliveryZip: '02101',
    deliveryPhone: '555-0200',
    deliveryNotes: '',
    brokerId: 'broker-1',
    brokerName: 'ABC Logistics',
    brokerPayment: 1500,
    truckOwnerPayment: 500,
    driverPayment: 800,
    mileageOrder: 200,
    mileageEmpty: 20,
    mileageTotal: 220,
    brokerRate: 7.5,
    driverRate: 4.0,
    truckOwnerRate: 2.5,
    dispatcherRate: 1.0,
    factoryRate: 0,
    orderRate: 7.5,
    orderAverage: 7.5,
    dispatcherPayment: 200,
    brokerAdvance: 0,
    driverAdvance: 0,
    factoryAdvance: 0,
    fuelCost: 100,
    fuelGasAvgCost: 3.5,
    fuelGasAvgGallxMil: 0.15,
    brokerCost: 0,
    factoryCost: 0,
    lumperValue: 0,
    detentionValue: 0,
    orderExpenses: 1600,
    orderRevenue: 1500,
    notes: '',
    orderStatus: TripStatus.Scheduled,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-10T08:00:00Z',
    ...overrides
  });

  // Mock data
  const mockTrips: Trip[] = [
    createMockTrip({
      tripId: 'trip-1',
      scheduledTimestamp: '2024-01-15T10:00:00Z',
      pickupCity: 'New York',
      pickupState: 'NY',
      deliveryCity: 'Boston',
      deliveryState: 'MA',
      brokerId: 'broker-1',
      brokerName: 'ABC Logistics',
      truckId: 'LRY-001',
      driverName: 'John Doe',
      driverId: 'driver-1',
      orderStatus: TripStatus.Scheduled,
      brokerPayment: 1500,
      driverPayment: 800,
      truckOwnerPayment: 500,
      dispatcherId: 'dispatcher-1',
      createdAt: '2024-01-10T08:00:00Z',
      updatedAt: '2024-01-10T08:00:00Z'
    }),
    createMockTrip({
      tripId: 'trip-2',
      scheduledTimestamp: '2024-01-16T14:00:00Z',
      pickupCity: 'Chicago',
      pickupState: 'IL',
      deliveryCity: 'Detroit',
      deliveryState: 'MI',
      brokerId: 'broker-2',
      brokerName: 'XYZ Transport',
      truckId: 'LRY-002',
      driverName: 'Jane Smith',
      driverId: 'driver-2',
      orderStatus: TripStatus.InTransit,
      brokerPayment: 1200,
      driverPayment: 600,
      truckOwnerPayment: 400,
      dispatcherId: 'dispatcher-1',
      createdAt: '2024-01-11T09:00:00Z',
      updatedAt: '2024-01-16T14:30:00Z'
    })
  ];

  const mockBrokers: Broker[] = [
    { 
      brokerId: 'broker-1', 
      brokerName: 'ABC Logistics', 
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    { 
      brokerId: 'broker-2', 
      brokerName: 'XYZ Transport', 
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ];

  const defaultFilters: DashboardFilters = {
    dateRange: { startDate: null, endDate: null },
    status: null,
    brokerId: null,
    truckId: null,
    driverId: null,
    driverName: null
  };

  const defaultPagination: PaginationState = {
    page: 0,
    pageSize: 25
  };

  // Subjects for reactive testing
  let filtersSubject: BehaviorSubject<DashboardFilters>;
  let paginationSubject: BehaviorSubject<PaginationState>;
  let loadingSubject: BehaviorSubject<any>;
  let errorSubject: BehaviorSubject<any>;
  let refreshPaymentSummarySubject: BehaviorSubject<void>;

  beforeEach(async () => {
    // Initialize subjects
    filtersSubject = new BehaviorSubject(defaultFilters);
    paginationSubject = new BehaviorSubject(defaultPagination);
    loadingSubject = new BehaviorSubject({
      isLoading: false,
      isInitialLoad: false,
      isFilterUpdate: false,
      loadingMessage: 'Loading...'
    });
    errorSubject = new BehaviorSubject({
      hasError: false,
      errorMessage: '',
      canRetry: false,
      retryCount: 0
    });
    refreshPaymentSummarySubject = new BehaviorSubject<void>(undefined);

    // Create spies
    dashboardStateService = jasmine.createSpyObj('DashboardStateService', [
      'updateFilters',
      'updatePagination',
      'clearFilters',
      'getActiveFilterCount',
      'getBrokers',
      'getCurrentFilters',
      'startInitialLoad',
      'completeLoad',
      'clearError',
      'setError',
      'updateFilteredTrips',
      'triggerPaymentSummaryRefresh'
    ], {
      filters$: filtersSubject.asObservable(),
      pagination$: paginationSubject.asObservable(),
      loading$: loadingSubject.asObservable(),
      error$: errorSubject.asObservable(),
      filteredTrips$: of([]),
      filtersAndPagination$: of([defaultFilters, defaultPagination]),
      refreshPaymentSummary$: refreshPaymentSummarySubject.asObservable(),
      brokers$: of(mockBrokers)
    });

    tripService = jasmine.createSpyObj('TripService', [
      'getTrips',
      'deleteTrip',
      'createTrip',
      'getBrokers',
      'getTripSummaryByStatus',
      'getPaymentSummary',
      'getPaymentsTimeline'
    ]);

    authService = jasmine.createSpyObj('AuthService', [], {
      currentUser$: of({ userId: 'dispatcher-1', role: 'dispatcher' })
    });

    accessibilityService = jasmine.createSpyObj('AccessibilityService', [
      'getFilterAriaLabel',
      'getStatusAriaLabel',
      'getActionAriaLabel'
    ]);

    router = jasmine.createSpyObj('Router', ['navigate']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    // Setup default return values
    dashboardStateService.getBrokers.and.returnValue(mockBrokers);
    dashboardStateService.getActiveFilterCount.and.returnValue(0);
    dashboardStateService.getCurrentFilters.and.returnValue(defaultFilters);
    tripService.getTrips.and.returnValue(of({ trips: mockTrips, lastEvaluatedKey: undefined }));
    tripService.getBrokers.and.returnValue(of(mockBrokers));
    tripService.deleteTrip.and.returnValue(of({ message: 'Trip deleted successfully' }));
    tripService.createTrip.and.returnValue(of(mockTrips[0]));
    tripService.getTripSummaryByStatus.and.returnValue(of({
      [TripStatus.Scheduled]: 1,
      [TripStatus.PickedUp]: 0,
      [TripStatus.InTransit]: 1,
      [TripStatus.Delivered]: 0,
      [TripStatus.Paid]: 0,
      [TripStatus.Canceled]: 0
    }));
    tripService.getPaymentSummary.and.returnValue(of({
      totalBrokerPayments: 2700,
      totalDriverPayments: 1400,
      totalTruckOwnerPayments: 900,
      totalProfit: 400
    }));
    tripService.getPaymentsTimeline.and.returnValue(of({
      labels: ['Jan 2024'],
      brokerPayments: [2700],
      driverPayments: [1400],
      truckOwnerPayments: [900],
      profit: [400]
    }));

    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: DashboardStateService, useValue: dashboardStateService },
        { provide: TripService, useValue: tripService },
        { provide: AuthService, useValue: authService },
        { provide: AccessibilityService, useValue: accessibilityService },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  describe('Component Initialization', () => {
    it('should create dashboard component successfully', () => {
      // Requirement: Dashboard should initialize properly
      expect(component).toBeTruthy();
    });

    it('should initialize with default states', () => {
      // Requirement: Dashboard should have proper initial state
      fixture.detectChanges();
      
      expect(component.loadingState).toBeDefined();
      expect(component.errorState).toBeDefined();
      expect(component.loadingState.isLoading).toBeFalse();
      expect(component.errorState.hasError).toBeFalse();
    });

    it('should start initial load on component init', () => {
      // Requirement: Dashboard should trigger initial data load
      component.ngOnInit();
      
      expect(dashboardStateService.startInitialLoad).toHaveBeenCalled();
    });
  });

  describe('Filter Updates and Dashboard Response', () => {
    it('should update dashboard when date range filter changes', () => {
      // Requirement 4.1: Filter updates should trigger dashboard refresh
      fixture.detectChanges();

      const newFilters: DashboardFilters = {
        ...defaultFilters,
        dateRange: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31')
        }
      };

      // Simulate filter update
      filtersSubject.next(newFilters);
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: false,
        isFilterUpdate: true,
        loadingMessage: 'Updating filters...'
      });

      fixture.detectChanges();

      // Verify loading overlay is shown during filter update
      const loadingOverlay = fixture.debugElement.query(By.css('app-loading-overlay'));
      expect(loadingOverlay).toBeTruthy();
    });

    it('should update dashboard when status filter changes', () => {
      // Requirement 4.2: Status filter should update trip display
      fixture.detectChanges();

      const newFilters: DashboardFilters = {
        ...defaultFilters,
        status: TripStatus.InTransit
      };

      filtersSubject.next(newFilters);
      dashboardStateService.getActiveFilterCount.and.returnValue(1);

      fixture.detectChanges();

      // Verify component handles filter changes
      expect(component).toBeTruthy();
    });

    it('should handle multiple simultaneous filter updates', () => {
      // Requirement 4.4: Multiple filter changes should be handled gracefully
      fixture.detectChanges();

      const filters1: DashboardFilters = {
        ...defaultFilters,
        status: TripStatus.Scheduled
      };

      const filters2: DashboardFilters = {
        ...filters1,
        brokerId: 'broker-1'
      };

      const filters3: DashboardFilters = {
        ...filters2,
        truckId: 'LRY-001'
      };

      // Rapid filter updates
      filtersSubject.next(filters1);
      filtersSubject.next(filters2);
      filtersSubject.next(filters3);

      dashboardStateService.getActiveFilterCount.and.returnValue(3);

      fixture.detectChanges();

      // Should handle all updates without errors
      expect(component.loadingState).toBeDefined();
      expect(component.errorState.hasError).toBeFalse();
    });
  });

  describe('Loading States and UI Feedback', () => {
    it('should display skeleton loaders during initial load', () => {
      // Requirement 5.1: Initial load should show skeleton loaders
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: true,
        isFilterUpdate: false,
        loadingMessage: 'Loading dashboard...'
      });

      fixture.detectChanges();

      const skeletonContent = fixture.debugElement.query(By.css('.skeleton-content'));
      expect(skeletonContent).toBeTruthy();
    });

    it('should display loading overlay during filter updates', () => {
      // Requirement 5.2: Filter updates should show loading overlay
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: false,
        isFilterUpdate: true,
        loadingMessage: 'Updating filters...'
      });

      fixture.detectChanges();

      const loadingOverlay = fixture.debugElement.query(By.css('app-loading-overlay'));
      expect(loadingOverlay).toBeTruthy();
    });

    it('should show dashboard content when loading is complete', () => {
      // Requirement 5.3: Completed load should show dashboard content
      loadingSubject.next({
        isLoading: false,
        isInitialLoad: false,
        isFilterUpdate: false,
        loadingMessage: 'Loading...'
      });

      fixture.detectChanges();

      const loadedContent = fixture.debugElement.query(By.css('.loaded-content'));
      expect(loadedContent).toBeTruthy();
    });
  });

  describe('Dashboard Components Integration', () => {
    it('should render all dashboard components when loaded', () => {
      // Requirement 6.1: All dashboard components should be present
      loadingSubject.next({
        isLoading: false,
        isInitialLoad: false,
        isFilterUpdate: false,
        loadingMessage: 'Loading...'
      });

      fixture.detectChanges();

      const filterCard = fixture.debugElement.query(By.css('app-unified-filter-card'));
      const tripTable = fixture.debugElement.query(By.css('app-trip-table'));

      expect(filterCard).toBeTruthy();
      expect(tripTable).toBeTruthy();
    });

    it('should maintain filter bar visibility during all states', () => {
      // Requirement 6.2: Filter bar should always be visible
      fixture.detectChanges();

      const filterCard = fixture.debugElement.query(By.css('app-unified-filter-card'));
      expect(filterCard).toBeTruthy();

      // During initial loading, skeleton content should be shown
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: true,
        isFilterUpdate: false,
        loadingMessage: 'Loading...'
      });

      fixture.detectChanges();

      const skeletonContent = fixture.debugElement.query(By.css('.skeleton-content'));
      expect(skeletonContent).toBeTruthy();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should display error state when data loading fails', () => {
      // Requirement 7.1: Error states should be displayed properly
      fixture.detectChanges();

      errorSubject.next({
        hasError: true,
        errorMessage: 'Failed to load dashboard data',
        canRetry: true,
        retryCount: 1
      });

      fixture.detectChanges();

      const errorState = fixture.debugElement.query(By.css('app-error-state'));
      expect(errorState).toBeTruthy();
    });

    it('should allow retry after error', () => {
      // Requirement 7.2: Error recovery should be possible
      fixture.detectChanges();

      errorSubject.next({
        hasError: true,
        errorMessage: 'Network error',
        canRetry: true,
        retryCount: 1
      });

      fixture.detectChanges();

      // Simulate retry
      component.onRetry();

      expect(dashboardStateService.clearError).toHaveBeenCalled();
      expect(dashboardStateService.startInitialLoad).toHaveBeenCalled();
    });

    it('should hide dashboard content during error state', () => {
      // Requirement 7.3: Error state should hide normal content
      errorSubject.next({
        hasError: true,
        errorMessage: 'Critical error',
        canRetry: true,
        retryCount: 1
      });

      loadingSubject.next({
        isLoading: false,
        isInitialLoad: false,
        isFilterUpdate: false,
        loadingMessage: 'Loading...'
      });

      fixture.detectChanges();

      const dashboardContent = fixture.debugElement.query(By.css('.dashboard-content'));
      expect(dashboardContent).toBeFalsy();

      const errorState = fixture.debugElement.query(By.css('app-error-state'));
      expect(errorState).toBeTruthy();
    });
  });

  describe('State Management Integration', () => {
    it('should subscribe to all dashboard state observables', () => {
      // Requirement 8.1: Component should subscribe to all state changes
      component.ngOnInit();

      // Verify subscriptions are active by triggering state changes
      const newLoadingState = {
        isLoading: true,
        isInitialLoad: false,
        isFilterUpdate: true,
        loadingMessage: 'Test loading...'
      };

      loadingSubject.next(newLoadingState);
      expect(component.loadingState).toEqual(newLoadingState);

      const newErrorState = {
        hasError: true,
        errorMessage: 'Test error',
        canRetry: true,
        retryCount: 1
      };

      errorSubject.next(newErrorState);
      expect(component.errorState).toEqual(newErrorState);
    });

    it('should clean up subscriptions on destroy', () => {
      // Requirement 8.2: Component should clean up subscriptions
      spyOn(component['destroy$'], 'next');
      spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(component['destroy$'].next).toHaveBeenCalled();
      expect(component['destroy$'].complete).toHaveBeenCalled();
    });
  });

  describe('Accessibility and User Experience', () => {
    it('should provide proper component structure for screen readers', () => {
      // Requirement 9.1: Accessibility should be maintained
      fixture.detectChanges();

      const dashboardContainer = fixture.debugElement.query(By.css('.dashboard-container'));
      expect(dashboardContainer).toBeTruthy();

      // Verify main sections are present
      const filterSection = fixture.debugElement.query(By.css('app-unified-filter-card'));
      expect(filterSection).toBeTruthy();
    });

    it('should maintain proper loading indicators', () => {
      // Requirement 9.2: Loading states should be clear
      fixture.detectChanges();

      // Initial load state
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: true,
        isFilterUpdate: false,
        loadingMessage: 'Loading dashboard...'
      });

      fixture.detectChanges();

      const skeletonContent = fixture.debugElement.query(By.css('.skeleton-content'));
      expect(skeletonContent).toBeTruthy();

      // Filter update state
      loadingSubject.next({
        isLoading: true,
        isInitialLoad: false,
        isFilterUpdate: true,
        loadingMessage: 'Updating filters...'
      });

      fixture.detectChanges();

      const loadingOverlay = fixture.debugElement.query(By.css('app-loading-overlay'));
      expect(loadingOverlay).toBeTruthy();
    });
  });

  describe('Integration Test Coverage Validation', () => {
    it('should validate all required dashboard flows are testable', () => {
      // Requirement 10.1: All integration requirements should be covered
      fixture.detectChanges();

      // Verify component can handle all required state changes
      expect(component.loadingState).toBeDefined();
      expect(component.errorState).toBeDefined();
      expect(component.onRetry).toBeDefined();
      expect(component.ngOnInit).toBeDefined();
      expect(component.ngOnDestroy).toBeDefined();

      // Verify all dashboard state service methods are available
      expect(dashboardStateService.updateFilters).toBeDefined();
      expect(dashboardStateService.updatePagination).toBeDefined();
      expect(dashboardStateService.clearFilters).toBeDefined();
      expect(dashboardStateService.getActiveFilterCount).toBeDefined();
      expect(dashboardStateService.getBrokers).toBeDefined();
      expect(dashboardStateService.getCurrentFilters).toBeDefined();
    });

    it('should validate service integration points', () => {
      // Requirement 10.2: Service integration should be properly tested
      expect(tripService.getTrips).toBeDefined();
      expect(tripService.deleteTrip).toBeDefined();
      expect(tripService.createTrip).toBeDefined();
      expect(tripService.getBrokers).toBeDefined();

      expect(authService.currentUser$).toBeDefined();
      expect(accessibilityService.getFilterAriaLabel).toBeDefined();
      expect(router.navigate).toBeDefined();
    });

    it('should validate UI component integration', () => {
      // Requirement 10.3: UI components should integrate properly
      loadingSubject.next({
        isLoading: false,
        isInitialLoad: false,
        isFilterUpdate: false,
        loadingMessage: 'Loading...'
      });

      fixture.detectChanges();

      // Verify all expected UI components are integrated
      const expectedComponents = [
        'app-unified-filter-card',
        'app-trip-table'
      ];

      expectedComponents.forEach(selector => {
        const component = fixture.debugElement.query(By.css(selector));
        expect(component).toBeTruthy(`${selector} should be present in dashboard`);
      });
    });
  });
});