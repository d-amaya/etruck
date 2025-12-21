import { fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardStateService } from './dashboard-state.service';
import { SharedFilterService } from './shared-filter.service';
import { Router } from '@angular/router';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let dashboardStateServiceSpy: jasmine.SpyObj<DashboardStateService>;
  let sharedFilterServiceSpy: jasmine.SpyObj<SharedFilterService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockLoadingState = {
    isLoading: false,
    isInitialLoad: false,
    isFilterUpdate: false,
    loadingMessage: 'Loading...'
  };

  const mockErrorState = {
    hasError: false,
    errorMessage: '',
    canRetry: false,
    retryCount: 0
  };

  beforeEach(() => {
    dashboardStateServiceSpy = jasmine.createSpyObj('DashboardStateService', [
      'startInitialLoad',
      'completeLoad',
      'clearError'
    ], {
      loading$: of(mockLoadingState),
      error$: of(mockErrorState)
    });

    sharedFilterServiceSpy = jasmine.createSpyObj('SharedFilterService', [], {
      viewMode$: of('table')
    });

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const cdrSpy = jasmine.createSpyObj('ChangeDetectorRef', ['detectChanges']);

    component = new DashboardComponent(
      dashboardStateServiceSpy,
      sharedFilterServiceSpy,
      routerSpy,
      cdrSpy
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default loading and error states', () => {
    expect(component.loadingState).toEqual({
      isLoading: false,
      isInitialLoad: false,
      isFilterUpdate: false,
      loadingMessage: 'Loading...'
    });

    expect(component.errorState).toEqual({
      hasError: false,
      errorMessage: '',
      canRetry: false,
      retryCount: 0
    });
  });

  it('should start initial load on init', () => {
    component.ngOnInit();
    expect(dashboardStateServiceSpy.startInitialLoad).toHaveBeenCalled();
  });

  it('should subscribe to loading state changes', () => {
    const newLoadingState = {
      isLoading: true,
      isInitialLoad: true,
      isFilterUpdate: false,
      loadingMessage: 'Loading dashboard data...'
    };

    // Set up the spy before calling ngOnInit
    Object.defineProperty(dashboardStateServiceSpy, 'loading$', {
      get: () => of(newLoadingState)
    });

    component.ngOnInit();

    expect(component.loadingState).toEqual(newLoadingState);
  });

  it('should subscribe to error state changes', () => {
    const newErrorState = {
      hasError: true,
      errorMessage: 'Failed to load data',
      canRetry: true,
      retryCount: 1
    };

    // Set up the spy before calling ngOnInit
    Object.defineProperty(dashboardStateServiceSpy, 'error$', {
      get: () => of(newErrorState)
    });

    component.ngOnInit();

    expect(component.errorState).toEqual(newErrorState);
  });

  it('should complete load after timeout on init', fakeAsync(() => {
    component.ngOnInit();
    tick(1500);

    expect(dashboardStateServiceSpy.completeLoad).toHaveBeenCalled();
  }));

  it('should handle retry correctly', fakeAsync(() => {
    component.onRetry();
    
    expect(dashboardStateServiceSpy.clearError).toHaveBeenCalled();
    expect(dashboardStateServiceSpy.startInitialLoad).toHaveBeenCalled();
    
    tick(1500);
    expect(dashboardStateServiceSpy.completeLoad).toHaveBeenCalled();
  }));

  it('should clean up subscriptions on destroy', () => {
    spyOn(component['destroy$'], 'next');
    spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(component['destroy$'].next).toHaveBeenCalled();
    expect(component['destroy$'].complete).toHaveBeenCalled();
  });
});