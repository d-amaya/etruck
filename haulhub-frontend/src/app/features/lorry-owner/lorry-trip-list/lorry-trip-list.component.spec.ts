import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { LorryTripListComponent } from './lorry-trip-list.component';
import { TripService, LorryService } from '../../../core/services';
import { Trip, TripStatus, Lorry, LorryVerificationStatus, Broker } from '@haulhub/shared';

describe('LorryTripListComponent', () => {
  let component: LorryTripListComponent;
  let fixture: ComponentFixture<LorryTripListComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let lorryServiceSpy: jasmine.SpyObj<LorryService>;

  const mockApprovedLorry: Lorry = {
    lorryId: 'ABC-123',
    ownerId: 'owner1',
    make: 'Volvo',
    model: 'FH16',
    year: 2020,
    verificationStatus: LorryVerificationStatus.Approved,
    verificationDocuments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const mockPendingLorry: Lorry = {
    lorryId: 'XYZ-789',
    ownerId: 'owner1',
    make: 'Scania',
    model: 'R500',
    year: 2021,
    verificationStatus: LorryVerificationStatus.Pending,
    verificationDocuments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const mockTrip: Trip = {
    tripId: 'trip1',
    dispatcherId: 'dispatcher1',
    pickupLocation: 'New York',
    dropoffLocation: 'Boston',
    scheduledPickupDatetime: '2024-02-01T10:00:00Z',
    brokerId: 'broker1',
    brokerName: 'Broker One',
    lorryId: 'ABC-123',
    driverId: 'driver1',
    driverName: 'John Doe',
    brokerPayment: 1000,
    lorryOwnerPayment: 600,
    driverPayment: 300,
    status: TripStatus.Scheduled,
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z'
  };

  const mockBroker: Broker = {
    brokerId: 'broker1',
    brokerName: 'Broker One',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    tripServiceSpy = jasmine.createSpyObj('TripService', ['getTrips', 'getBrokers']);
    lorryServiceSpy = jasmine.createSpyObj('LorryService', ['getLorries']);

    await TestBed.configureTestingModule({
      imports: [
        LorryTripListComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: TripService, useValue: tripServiceSpy },
        { provide: LorryService, useValue: lorryServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LorryTripListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([]));
    tripServiceSpy.getBrokers.and.returnValue(of([]));
    
    expect(component).toBeTruthy();
  });

  it('should load lorries and brokers on init', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    expect(lorryServiceSpy.getLorries).toHaveBeenCalled();
    expect(tripServiceSpy.getBrokers).toHaveBeenCalled();
    expect(component.lorries.length).toBe(1);
    expect(component.approvedLorries.length).toBe(1);
    expect(component.brokers.length).toBe(1);
  });

  it('should filter out non-approved lorries', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry, mockPendingLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    expect(component.lorries.length).toBe(2);
    expect(component.approvedLorries.length).toBe(1);
    expect(component.approvedLorries[0].lorryId).toBe('ABC-123');
  });

  it('should load trips for approved lorries', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    expect(tripServiceSpy.getTrips).toHaveBeenCalled();
    expect(component.trips.length).toBe(1);
    expect(component.trips[0].lorryId).toBe('ABC-123');
  });

  it('should not load trips if no approved lorries', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockPendingLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));

    fixture.detectChanges();

    expect(tripServiceSpy.getTrips).not.toHaveBeenCalled();
    expect(component.trips.length).toBe(0);
  });

  it('should filter trips by lorry ID', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    component.filterForm.patchValue({ lorryId: 'ABC-123' });
    component.onApplyFilters();

    expect(tripServiceSpy.getTrips).toHaveBeenCalledWith(
      jasmine.objectContaining({ lorryId: 'ABC-123' })
    );
  });

  it('should apply date range filters', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');
    component.filterForm.patchValue({ startDate, endDate });
    component.onApplyFilters();

    expect(tripServiceSpy.getTrips).toHaveBeenCalledWith(
      jasmine.objectContaining({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
    );
  });

  it('should clear filters', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    component.filterForm.patchValue({
      lorryId: 'ABC-123',
      brokerId: 'broker1',
      status: TripStatus.Scheduled
    });

    component.onClearFilters();

    expect(component.filterForm.value.lorryId).toBe('');
    expect(component.filterForm.value.brokerId).toBe('');
    expect(component.filterForm.value.status).toBe('');
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(1234.56);
    expect(formatted).toBe('$1,234.56');
  });

  it('should format date correctly', () => {
    const dateString = '2024-02-01T10:00:00Z';
    const formatted = component.formatDate(dateString);
    expect(formatted).toContain('Feb');
    expect(formatted).toContain('1');
    expect(formatted).toContain('2024');
  });

  it('should get correct status label', () => {
    expect(component.getStatusLabel(TripStatus.Scheduled)).toBe('Scheduled');
    expect(component.getStatusLabel(TripStatus.PickedUp)).toBe('Picked Up');
    expect(component.getStatusLabel(TripStatus.InTransit)).toBe('In Transit');
    expect(component.getStatusLabel(TripStatus.Delivered)).toBe('Delivered');
    expect(component.getStatusLabel(TripStatus.Paid)).toBe('Paid');
  });

  it('should get correct status class', () => {
    expect(component.getStatusClass(TripStatus.Scheduled)).toBe('status-scheduled');
    expect(component.getStatusClass(TripStatus.PickedUp)).toBe('status-picked-up');
    expect(component.getStatusClass(TripStatus.InTransit)).toBe('status-in-transit');
    expect(component.getStatusClass(TripStatus.Delivered)).toBe('status-delivered');
    expect(component.getStatusClass(TripStatus.Paid)).toBe('status-paid');
  });

  it('should detect active filters', () => {
    expect(component.hasActiveFilters()).toBe(false);

    component.filterForm.patchValue({ lorryId: 'ABC-123' });
    expect(component.hasActiveFilters()).toBe(true);

    component.filterForm.patchValue({ lorryId: '' });
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('should get broker name from ID', () => {
    component.brokers = [mockBroker];
    expect(component.getBrokerName('broker1')).toBe('Broker One');
    expect(component.getBrokerName('unknown')).toBe('unknown');
  });

  it('should get lorry display string', () => {
    component.lorries = [mockApprovedLorry];
    expect(component.getLorryDisplay('ABC-123')).toBe('ABC-123 (Volvo FH16)');
    expect(component.getLorryDisplay('unknown')).toBe('unknown');
  });

  it('should handle error when loading lorries', () => {
    lorryServiceSpy.getLorries.and.returnValue(throwError(() => new Error('Load error')));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    
    spyOn(console, 'error');
    fixture.detectChanges();

    expect(console.error).toHaveBeenCalledWith('Error loading lorries:', jasmine.any(Error));
  });

  it('should handle error when loading trips', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(throwError(() => new Error('Load error')));
    
    spyOn(console, 'error');
    fixture.detectChanges();

    expect(console.error).toHaveBeenCalledWith('Error loading trips:', jasmine.any(Error));
    expect(component.loading).toBe(false);
  });

  it('should filter out trips for non-approved lorries', () => {
    const tripForPendingLorry: Trip = {
      ...mockTrip,
      tripId: 'trip2',
      lorryId: 'XYZ-789'
    };

    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry, mockPendingLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip, tripForPendingLorry]));

    fixture.detectChanges();

    expect(component.trips.length).toBe(1);
    expect(component.trips[0].lorryId).toBe('ABC-123');
  });

  it('should handle pagination', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([mockApprovedLorry]));
    tripServiceSpy.getBrokers.and.returnValue(of([mockBroker]));
    tripServiceSpy.getTrips.and.returnValue(of([mockTrip]));

    fixture.detectChanges();

    const pageEvent = { pageIndex: 1, pageSize: 25, length: 100 };
    component.onPageChange(pageEvent);

    expect(component.pageIndex).toBe(1);
    expect(component.pageSize).toBe(25);
  });
});
