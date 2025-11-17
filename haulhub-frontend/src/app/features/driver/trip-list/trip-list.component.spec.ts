import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TripListComponent } from './trip-list.component';
import { TripService } from '../../../core/services';
import { Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Trip, TripStatus } from '@haulhub/shared';
import { StatusUpdateDialogComponent } from './status-update-dialog.component';

describe('TripListComponent', () => {
  let component: TripListComponent;
  let fixture: ComponentFixture<TripListComponent>;
  let mockTripService: jasmine.SpyObj<TripService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockTrip: Trip = {
    tripId: 'trip-1',
    dispatcherId: 'dispatcher-1',
    pickupLocation: 'New York',
    dropoffLocation: 'Boston',
    scheduledPickupDatetime: '2024-01-15T10:00:00Z',
    brokerId: 'broker-1',
    brokerName: 'Test Broker',
    lorryId: 'ABC123',
    driverId: 'driver-1',
    driverName: 'John Doe',
    brokerPayment: 1000,
    lorryOwnerPayment: 400,
    driverPayment: 300,
    status: TripStatus.Scheduled,
    distance: 215,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z'
  };

  beforeEach(async () => {
    mockTripService = jasmine.createSpyObj('TripService', ['getTrips', 'updateTripStatus']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    mockTripService.getTrips.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [TripListComponent, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: mockTripService },
        { provide: Router, useValue: mockRouter },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        FormBuilder
      ]
    })
    .overrideComponent(TripListComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: mockDialog },
          { provide: MatSnackBar, useValue: mockSnackBar }
        ]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(TripListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load trips on init', () => {
    fixture.detectChanges();
    expect(mockTripService.getTrips).toHaveBeenCalled();
  });

  it('should open status update dialog when onUpdateStatus is called', () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(undefined));
    mockDialog.open.and.returnValue(dialogRefSpy);

    component.onUpdateStatus(mockTrip);

    expect(mockDialog.open).toHaveBeenCalledWith(StatusUpdateDialogComponent, {
      width: '500px',
      data: { trip: mockTrip }
    });
  });

  it('should update trip status when dialog returns result', () => {
    const updatedTrip = { ...mockTrip, status: TripStatus.PickedUp };
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of({ status: TripStatus.PickedUp }));
    mockDialog.open.and.returnValue(dialogRefSpy);
    mockTripService.updateTripStatus.and.returnValue(of(updatedTrip));

    component.trips = [mockTrip];
    component.onUpdateStatus(mockTrip);

    expect(mockTripService.updateTripStatus).toHaveBeenCalledWith('trip-1', { status: TripStatus.PickedUp });
  });

  it('should show success message after successful status update', () => {
    const updatedTrip = { ...mockTrip, status: TripStatus.PickedUp };
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of({ status: TripStatus.PickedUp }));
    mockDialog.open.and.returnValue(dialogRefSpy);
    mockTripService.updateTripStatus.and.returnValue(of(updatedTrip));

    component.trips = [mockTrip];
    component.onUpdateStatus(mockTrip);

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Trip status updated successfully',
      'Close',
      jasmine.objectContaining({ duration: 3000 })
    );
  });

  it('should update trip in local array after successful status update', () => {
    const updatedTrip = { ...mockTrip, status: TripStatus.PickedUp };
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of({ status: TripStatus.PickedUp }));
    mockDialog.open.and.returnValue(dialogRefSpy);
    mockTripService.updateTripStatus.and.returnValue(of(updatedTrip));

    component.trips = [mockTrip];
    component.onUpdateStatus(mockTrip);

    expect(component.trips[0].status).toBe(TripStatus.PickedUp);
  });

  it('should show error message when status update fails', () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of({ status: TripStatus.PickedUp }));
    mockDialog.open.and.returnValue(dialogRefSpy);
    mockTripService.updateTripStatus.and.returnValue(
      throwError(() => ({ error: { message: 'Update failed' } }))
    );

    component.trips = [mockTrip];
    component.onUpdateStatus(mockTrip);

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Update failed',
      'Close',
      jasmine.objectContaining({ duration: 5000 })
    );
  });

  it('should not update status when dialog is cancelled', () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(undefined));
    mockDialog.open.and.returnValue(dialogRefSpy);

    component.onUpdateStatus(mockTrip);

    expect(mockTripService.updateTripStatus).not.toHaveBeenCalled();
  });

  it('should return false for canUpdateStatus when trip is Delivered', () => {
    const deliveredTrip = { ...mockTrip, status: TripStatus.Delivered };
    expect(component.canUpdateStatus(deliveredTrip)).toBe(false);
  });

  it('should return false for canUpdateStatus when trip is Paid', () => {
    const paidTrip = { ...mockTrip, status: TripStatus.Paid };
    expect(component.canUpdateStatus(paidTrip)).toBe(false);
  });

  it('should return true for canUpdateStatus when trip is Scheduled', () => {
    expect(component.canUpdateStatus(mockTrip)).toBe(true);
  });

  it('should return true for canUpdateStatus when trip is PickedUp', () => {
    const pickedUpTrip = { ...mockTrip, status: TripStatus.PickedUp };
    expect(component.canUpdateStatus(pickedUpTrip)).toBe(true);
  });

  it('should apply filters when onApplyFilters is called', () => {
    fixture.detectChanges();
    mockTripService.getTrips.calls.reset();
    
    component.onApplyFilters();
    
    expect(mockTripService.getTrips).toHaveBeenCalled();
  });

  it('should clear filters when onClearFilters is called', () => {
    fixture.detectChanges();
    component.filterForm.patchValue({ lorryId: 'ABC123' });
    
    component.onClearFilters();
    
    expect(component.filterForm.value.lorryId).toBe('');
  });
});
