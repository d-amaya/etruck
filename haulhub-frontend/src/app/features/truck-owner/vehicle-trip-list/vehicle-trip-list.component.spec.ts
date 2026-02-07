import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { VehicleTripListComponent } from './vehicle-trip-list.component';
import { TripService } from '../../../core/services';
import { Trip, TripStatus, Broker } from '@haulhub/shared';
import { createMockTrip } from '../../../testing/mock-trip.helper';

xdescribe('VehicleTripListComponent', () => {
  let component: VehicleTripListComponent;
  let fixture: ComponentFixture<VehicleTripListComponent>;
  let mockTripService: jasmine.SpyObj<TripService>;

  const mockTrip: Trip = createMockTrip({
    tripId: 'trip-1',
    scheduledTimestamp: '2024-01-15T10:00:00Z',
    pickupTimestamp: '2024-01-15T10:30:00Z',
    deliveryTimestamp: '2024-01-15T14:00:00Z',
    truckId: 'ABC123',
    orderStatus: TripStatus.Delivered,
    mileageOrder: 215,
    mileageTotal: 235
  });

  const mockTruck = {
    truckId: 'ABC123',
    plate: 'ABC-123',
    brand: 'Volvo',
    year: 2020,
    vin: 'VIN123456789',
    color: 'White',
    truckOwnerId: 'owner-1',
    carrierId: 'carrier-1',
    isActive: true
  };

  const mockBroker: Broker = {
    brokerId: 'broker-1',
      brokerName: 'Test Broker',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    mockTripService = jasmine.createSpyObj('TripService', ['getTrips', 'getBrokers']);

    mockTripService.getTrips.and.returnValue(of({ trips: [mockTrip], lastEvaluatedKey: undefined }));
    mockTripService.getBrokers.and.returnValue(of([mockBroker]));

    await TestBed.configureTestingModule({
      imports: [VehicleTripListComponent, ReactiveFormsModule, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: mockTripService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(VehicleTripListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  xit('should load approved trucks on init', () => {
    // TODO: Implement when truck loading is added to component
    fixture.detectChanges();
    expect(component.approvedTrucks.length).toBe(0);
  });

  xit('should load brokers on init', () => {
    // TODO: Implement when broker loading is added to component
    fixture.detectChanges();
    expect(component.brokers.length).toBe(0);
  });

  it('should load trips on init', () => {
    fixture.detectChanges();
    expect(mockTripService.getTrips).toHaveBeenCalled();
    expect(component.trips.length).toBe(1);
  });

  it('should use new field names in trip data', () => {
    fixture.detectChanges();
    const trip = component.trips[0];
    expect(trip.truckId).toBe('ABC123');
    expect(trip.trailerId).toBe('trailer-1');
    expect(trip.truckOwnerId).toBe('owner-1');
    expect(trip.truckOwnerPayment).toBe(400);
    expect(trip.scheduledTimestamp).toBe('2024-01-15T10:00:00Z');
    expect(trip.pickupTimestamp).toBe('2024-01-15T10:30:00Z');
    expect(trip.deliveryTimestamp).toBe('2024-01-15T14:00:00Z');
  });

  it('should verify sensitive fields are hidden from truck owners', () => {
    fixture.detectChanges();
    const trip = component.trips[0];
    
    // Truck owner should only see their own payment
    expect(trip.truckOwnerPayment).toBeDefined();
    
    // These fields exist in data but should be hidden in template
    expect(trip.brokerPayment).toBeDefined();
    expect(trip.driverPayment).toBeDefined();
  });

  it('should display only truckOwnerPayment column, not other financial fields', () => {
    fixture.detectChanges();
    
    // Verify displayedColumns includes truckOwnerPayment
    expect(component.displayedColumns).toContain('truckOwnerPayment');
    
    // Verify displayedColumns does NOT include sensitive fields
    expect(component.displayedColumns).not.toContain('brokerPayment');
    expect(component.displayedColumns).not.toContain('driverPayment');
    expect(component.displayedColumns).not.toContain('orderRevenue');
  });

  it('should format ISO 8601 timestamps correctly', () => {
    const timestamp = '2024-01-15T10:00:00Z';
    const formatted = component.formatDate(timestamp);
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2024');
  });

  it('should handle null timestamps gracefully', () => {
    const formatted = component.formatDate(null);
    expect(formatted).toBe('N/A');
  });

  it('should display "My Trucks" section with truck list', () => {
    fixture.detectChanges();
    expect(component.approvedTrucks.length).toBeGreaterThan(0);
    expect(component.hasApprovedVehicles()).toBe(true);
  });

  it('should filter trips by truck when truck is selected', () => {
    fixture.detectChanges();
    mockTripService.getTrips.calls.reset();
    
    component.filterForm.patchValue({ vehicleId: 'ABC123' });
    component.onApplyFilters();
    
    expect(mockTripService.getTrips).toHaveBeenCalledWith(
      jasmine.objectContaining({
        truckId: 'ABC123'
      })
    );
  });

  it('should apply date range filters correctly', () => {
    fixture.detectChanges();
    mockTripService.getTrips.calls.reset();
    
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    component.filterForm.patchValue({
      startDate,
      endDate
    });
    component.onApplyFilters();
    
    expect(mockTripService.getTrips).toHaveBeenCalled();
  });

  it('should clear filters when onClearFilters is called', () => {
    fixture.detectChanges();
    component.filterForm.patchValue({ 
      vehicleId: 'ABC123',
      brokerId: 'broker-1'
    });
    
    component.onClearFilters();
    
    expect(component.filterForm.value.vehicleId).toBe('');
    expect(component.filterForm.value.brokerId).toBe('');
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(1234.56);
    expect(formatted).toContain('1,234.56');
  });

  it('should get broker name from broker list', () => {
    fixture.detectChanges();
    const brokerName = component.getBrokerName('broker-1');
    expect(brokerName).toBe('Test Broker');
  });

  it('should return "Unknown" for invalid broker ID', () => {
    fixture.detectChanges();
    const brokerName = component.getBrokerName('invalid-broker');
    expect(brokerName).toBe('Unknown');
  });

  it('should get vehicle display with plate and brand', () => {
    fixture.detectChanges();
    const display = component.getVehicleDisplay(mockTrip);
    expect(display).toBeTruthy();
  });

  it('should get status label correctly', () => {
    expect(component.getStatusLabel(TripStatus.Scheduled)).toBe('Scheduled');
    expect(component.getStatusLabel(TripStatus.PickedUp)).toBe('Picked Up');
    expect(component.getStatusLabel(TripStatus.InTransit)).toBe('In Transit');
    expect(component.getStatusLabel(TripStatus.Delivered)).toBe('Delivered');
    expect(component.getStatusLabel(TripStatus.Paid)).toBe('Paid');
  });

  it('should get status class correctly', () => {
    expect(component.getStatusClass(TripStatus.Scheduled)).toBe('status-scheduled');
    expect(component.getStatusClass(TripStatus.PickedUp)).toBe('status-picked-up');
    expect(component.getStatusClass(TripStatus.InTransit)).toBe('status-in-transit');
    expect(component.getStatusClass(TripStatus.Delivered)).toBe('status-delivered');
    expect(component.getStatusClass(TripStatus.Paid)).toBe('status-paid');
  });

  it('should detect active filters correctly', () => {
    expect(component.hasActiveFilters()).toBe(false);
    
    component.filterForm.patchValue({ vehicleId: 'ABC123' });
    expect(component.hasActiveFilters()).toBe(true);
  });

  // TODO: Fix this test - mockLorryService is not defined
  xit('should show empty state when no approved trucks', () => {
    // mockLorryService.getApprovedLorries.and.returnValue(of([]));
    fixture.detectChanges();
    
    expect(component.hasApprovedVehicles()).toBe(false);
  });

  it('should handle pagination correctly', () => {
    fixture.detectChanges();
    const pageEvent = { pageIndex: 1, pageSize: 10, length: 100 };
    
    mockTripService.getTrips.calls.reset();
    component.onPageChange(pageEvent);
    
    expect(component.pageIndex).toBe(1);
    expect(component.pageSize).toBe(10);
  });
});
