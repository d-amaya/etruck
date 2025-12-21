import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError, Subject, EMPTY } from 'rxjs';
import { TripTableComponent } from './trip-table.component';
import { TripService } from '../../../../core/services';
import { DashboardStateService } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import { Trip, TripStatus } from '@haulhub/shared';

describe('TripTableComponent', () => {
  let component: TripTableComponent;
  let fixture: ComponentFixture<TripTableComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let dashboardStateSpy: jasmine.SpyObj<DashboardStateService>;
  let sharedFilterServiceSpy: jasmine.SpyObj<SharedFilterService>;
  let pdfExportServiceSpy: jasmine.SpyObj<PdfExportService>;
  let accessibilityServiceSpy: jasmine.SpyObj<AccessibilityService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockTrip: Trip = {
    tripId: 'trip-1',
    dispatcherId: 'dispatcher-1',
    scheduledPickupDatetime: '2024-01-15T10:00:00Z',
    pickupLocation: 'New York, NY',
    dropoffLocation: 'Boston, MA',
    brokerId: 'broker-1',
    brokerName: 'Test Broker',
    brokerPayment: 1000,
    lorryId: 'ABC123',
    lorryOwnerPayment: 400,
    driverId: 'driver-1',
    driverName: 'John Doe',
    driverPayment: 300,
    status: TripStatus.Scheduled,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z'
  };

  let dialogRefSpy: jasmine.SpyObj<any>;

  beforeEach(async () => {
    tripServiceSpy = jasmine.createSpyObj('TripService', ['getTrips', 'deleteTrip', 'createTrip']);
    dashboardStateSpy = jasmine.createSpyObj('DashboardStateService', [
      'updatePagination',
      'updateFilters',
      'getActiveFilterCount',
      'updateFilteredTrips'
    ], {
      filters$: of({
        dateRange: { startDate: null, endDate: null },
        status: null,
        brokerId: null,
        lorryId: null,
        driverId: null,
        driverName: null
      }),
      pagination$: of({ page: 0, pageSize: 25 }),
      filtersAndPagination$: of([
        {
          dateRange: { startDate: null, endDate: null },
          status: null,
          brokerId: null,
          lorryId: null,
          driverId: null,
          driverName: null
        },
        { page: 0, pageSize: 25 }
      ]),
      brokers$: of([])
    });
    
    sharedFilterServiceSpy = jasmine.createSpyObj('SharedFilterService', [
      'getCurrentFilters',
      'updateFilters'
    ]);
    sharedFilterServiceSpy.getCurrentFilters.and.returnValue({
      dateRange: { startDate: null, endDate: null },
      status: null,
      brokerId: null,
      lorryId: null,
      driverId: null,
      driverName: null
    });
    
    pdfExportServiceSpy = jasmine.createSpyObj('PdfExportService', ['exportDashboard']);
    accessibilityServiceSpy = jasmine.createSpyObj('AccessibilityService', [
      'announceMessage',
      'getStatusAriaLabel',
      'getActionAriaLabel'
    ]);
    accessibilityServiceSpy.getStatusAriaLabel.and.returnValue('Trip status');
    accessibilityServiceSpy.getActionAriaLabel.and.returnValue('Action label');
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.navigate.and.returnValue(Promise.resolve(true));
    
    // Create dialog ref spy
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(false));
    
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    tripServiceSpy.getTrips.and.returnValue(of({ trips: [mockTrip], lastEvaluatedKey: undefined }));
    dashboardStateSpy.getActiveFilterCount.and.returnValue(0);

    await TestBed.configureTestingModule({
      imports: [TripTableComponent, NoopAnimationsModule, MatDialogModule, MatSnackBarModule],
      providers: [
        { provide: TripService, useValue: tripServiceSpy },
        { provide: DashboardStateService, useValue: dashboardStateSpy },
        { provide: SharedFilterService, useValue: sharedFilterServiceSpy },
        { provide: PdfExportService, useValue: pdfExportServiceSpy },
        { provide: AccessibilityService, useValue: accessibilityServiceSpy },
        { provide: Router, useValue: routerSpy },
        MatDialog,
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();
    
    dialogSpy = TestBed.inject(MatDialog) as any;
    spyOn(dialogSpy, 'open').and.returnValue(dialogRefSpy);

    fixture = TestBed.createComponent(TripTableComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load trips on init', (done) => {
    fixture.detectChanges();
    
    // Wait for async operations to complete
    setTimeout(() => {
      expect(tripServiceSpy.getTrips).toHaveBeenCalled();
      expect(component.trips.length).toBe(1);
      expect(component.trips[0]).toEqual(mockTrip);
      done();
    }, 100);
  });

  it('should update pagination when page changes', () => {
    fixture.detectChanges();
    component.onPageChange({ pageIndex: 1, pageSize: 50, length: 100 });
    expect(dashboardStateSpy.updatePagination).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50
    });
  });

  it('should navigate to trip detail on view', () => {
    component.viewTrip(mockTrip);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dispatcher/trips', 'trip-1']);
  });

  it('should navigate to trip edit on edit', () => {
    component.editTrip(mockTrip);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dispatcher/trips', 'trip-1', 'edit']);
  });

  xit('should open confirmation dialog on delete', fakeAsync(() => {
    const localDialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    localDialogRefSpy.afterClosed.and.returnValue(of(false));
    (dialogSpy.open as jasmine.Spy).and.returnValue(localDialogRefSpy);

    component.deleteTrip(mockTrip);
    tick();
    
    expect(dialogSpy.open).toHaveBeenCalled();
  }));

  xit('should delete trip when confirmed', fakeAsync(() => {
    const localDialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    localDialogRefSpy.afterClosed.and.returnValue(of(true));
    (dialogSpy.open as jasmine.Spy).and.returnValue(localDialogRefSpy);
    tripServiceSpy.deleteTrip.and.returnValue(of({ message: 'Trip deleted successfully' }));
    
    const onActionSubject = new Subject<void>();
    const snackBarRefSpy = jasmine.createSpyObj('MatSnackBarRef', ['onAction']);
    snackBarRefSpy.onAction.and.returnValue(onActionSubject.asObservable());
    snackBarSpy.open.and.returnValue(snackBarRefSpy);

    component.trips = [mockTrip];
    component.deleteTrip(mockTrip);
    tick(); // Process the afterClosed observable
    tick(5000); // Process the setTimeout in performDelete

    expect(tripServiceSpy.deleteTrip).toHaveBeenCalledWith('trip-1');
  }));

  it('should calculate profit correctly', () => {
    const profit = component.calculateProfit(mockTrip);
    expect(profit).toBe(300); // 1000 - 400 - 300
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(1000);
    expect(formatted).toContain('1,000.00');
  });

  it('should format date correctly', () => {
    const formatted = component.formatDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should return correct status class', () => {
    expect(component.getStatusClass(TripStatus.Scheduled)).toBe('status-scheduled');
    expect(component.getStatusClass(TripStatus.PickedUp)).toBe('status-picked-up');
    expect(component.getStatusClass(TripStatus.InTransit)).toBe('status-in-transit');
    expect(component.getStatusClass(TripStatus.Delivered)).toBe('status-delivered');
    expect(component.getStatusClass(TripStatus.Paid)).toBe('status-paid');
  });

  it('should return correct status label', () => {
    expect(component.getStatusLabel(TripStatus.Scheduled)).toBe('Scheduled');
    expect(component.getStatusLabel(TripStatus.PickedUp)).toBe('Picked Up');
    expect(component.getStatusLabel(TripStatus.InTransit)).toBe('In Transit');
    expect(component.getStatusLabel(TripStatus.Delivered)).toBe('Delivered');
    expect(component.getStatusLabel(TripStatus.Paid)).toBe('Paid');
  });

  it('should show empty state message when no trips and no filters', () => {
    component.hasActiveFilters = false;
    const message = component.getEmptyStateMessage();
    expect(message).toContain('haven\'t created any trips yet');
  });

  it('should show filter message when no trips with active filters', () => {
    component.hasActiveFilters = true;
    const message = component.getEmptyStateMessage();
    expect(message).toContain('No trips found matching your filters');
  });

  it('should navigate to create trip', () => {
    component.createTrip();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dispatcher/trips/create']);
  });

  xit('should handle error when loading trips', fakeAsync(() => {
    tripServiceSpy.getTrips.and.returnValue(throwError(() => new Error('API Error')));
    fixture.detectChanges();
    flush(); // Flush all pending async operations
    
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Error loading trips. Please try again.',
      'Close',
      { duration: 5000 }
    );
  }));

  xit('should handle error when deleting trip', fakeAsync(() => {
    const localDialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    localDialogRefSpy.afterClosed.and.returnValue(of(true));
    (dialogSpy.open as jasmine.Spy).and.returnValue(localDialogRefSpy);
    tripServiceSpy.deleteTrip.and.returnValue(throwError(() => new Error('Delete Error')));

    component.deleteTrip(mockTrip);
    tick(); // Process the afterClosed observable

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Error deleting trip. Please try again.',
      'Close',
      { duration: 5000 }
    );
  }));
});
