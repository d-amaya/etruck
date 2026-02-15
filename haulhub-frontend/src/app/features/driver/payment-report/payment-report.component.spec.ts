import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { PaymentReportComponent } from './payment-report.component';
import { TripService } from '../../../core/services';
import { DriverPaymentReport } from '@haulhub/shared';

describe('PaymentReportComponent', () => {
  let component: PaymentReportComponent;
  let fixture: ComponentFixture<PaymentReportComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;

  const mockReport: DriverPaymentReport = {
    totalDriverPayments: 5000,
    totalDistance: 1250.5,
    tripCount: 10,
    trips: [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledTimestamp: '2024-01-15T08:00:00Z',
        pickupLocation: 'New York, NY',
        dropoffLocation: 'Boston, MA',
        brokerId: 'broker-1',
        truckId: 'ABC-123',
        truckOwnerId: 'owner-1',
        driverId: 'driver-1',
        brokerPayment: 1000,
        truckOwnerPayment: 300,
        driverPayment: 500,
        mileageOrder: 215.5,
        orderStatus: 'Delivered'
      },
      {
        tripId: 'trip-2',
        dispatcherId: 'dispatcher-2',
        scheduledTimestamp: '2024-01-20T10:00:00Z',
        pickupLocation: 'Chicago, IL',
        dropoffLocation: 'Detroit, MI',
        brokerId: 'broker-2',
        truckId: 'XYZ-789',
        truckOwnerId: 'owner-2',
        driverId: 'driver-1',
        brokerPayment: 800,
        truckOwnerPayment: 250,
        driverPayment: 450,
        mileageOrder: 280,
        orderStatus: 'Paid'
      }
    ],
    groupedByDispatcher: {
      'dispatcher-1': {
        totalPayment: 2500,
        tripCount: 5
      },
      'dispatcher-2': {
        totalPayment: 2500,
        tripCount: 5
      }
    }
  };

  beforeEach(async () => {
    const tripSpy = jasmine.createSpyObj('TripService', ['getPaymentReport']);

    await TestBed.configureTestingModule({
      imports: [
        PaymentReportComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: TripService, useValue: tripSpy }
      ]
    }).compileComponents();

    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    fixture = TestBed.createComponent(PaymentReportComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load payment report on init with default date range', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    expect(tripServiceSpy.getPaymentReport).toHaveBeenCalled();
    expect(component.report).toEqual(mockReport);
    expect(component.loading).toBe(false);
  });

  it('should display total earnings correctly', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const earningsValue = compiled.querySelector('.earnings-card .summary-value');
    expect(earningsValue?.textContent).toContain('$5,000.00');
  });

  it('should display total distance correctly', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const distanceValue = compiled.querySelector('.distance-card .summary-value');
    expect(distanceValue?.textContent).toContain('1250.5 mi');
  });

  it('should display trip count correctly', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const tripsValue = compiled.querySelector('.trips-card .summary-value');
    expect(tripsValue?.textContent).toContain('10');
  });

  it('should apply filters when apply button is clicked', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    component.filterForm.patchValue({
      startDate,
      endDate
    });

    tripServiceSpy.getPaymentReport.calls.reset();
    component.onApplyFilters();

    expect(tripServiceSpy.getPaymentReport).toHaveBeenCalledWith(
      jasmine.objectContaining({
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T23:59:59.999Z',
        groupBy: 'dispatcher'
      })
    );
  });

  it('should clear filters when clear button is clicked', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    component.filterForm.patchValue({
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31')
    });

    component.onClearFilters();

    expect(component.filterForm.value.startDate).toBeNull();
    expect(component.filterForm.value.endDate).toBeNull();
  });

  it('should display grouped by dispatcher data', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const dispatcherEntries = component.getDispatcherEntries();
    expect(dispatcherEntries.length).toBe(2);
    expect(dispatcherEntries[0].data.totalPayment).toBe(2500);
    expect(dispatcherEntries[0].data.tripCount).toBe(5);
  });

  it('should format currency correctly', () => {
    expect(component.formatCurrency(1234.56)).toBe('$1,234.56');
    expect(component.formatCurrency(0)).toBe('$0.00');
  });

  it('should format distance correctly', () => {
    expect(component.formatDistance(123.456)).toBe('123.5 mi');
    expect(component.formatDistance(undefined)).toBe('N/A');
  });

  it('should format date correctly', () => {
    const dateString = '2024-01-15T08:00:00Z';
    const formatted = component.formatDate(dateString);
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should handle error when loading report', () => {
    const errorResponse = { error: { message: 'Failed to load report' } };
    tripServiceSpy.getPaymentReport.and.returnValue(throwError(() => errorResponse));

    spyOn(console, 'error');
    fixture.detectChanges();

    expect(console.error).toHaveBeenCalledWith('Error loading payment report:', errorResponse);
    expect(component.loading).toBe(false);
    expect(component.report).toBeNull();
  });

  it('should display no data message when report has no trips', () => {
    const emptyReport: DriverPaymentReport = {
      totalDriverPayments: 0,
      totalDistance: 0,
      tripCount: 0,
      trips: []
    };
    tripServiceSpy.getPaymentReport.and.returnValue(of(emptyReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const noDataMessage = compiled.querySelector('.no-data p');
    expect(noDataMessage?.textContent).toContain('No orders found');
  });

  it('should calculate average payment per trip correctly', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const avgPayment = mockReport.totalDriverPayments / mockReport.tripCount;
    const compiled = fixture.nativeElement;
    const avgValue = compiled.querySelector('.avg-card .summary-value');
    expect(avgValue?.textContent).toContain('$500.00');
  });

  it('should handle zero trips when calculating average', () => {
    const emptyReport: DriverPaymentReport = {
      totalDriverPayments: 0,
      totalDistance: 0,
      tripCount: 0,
      trips: []
    };
    tripServiceSpy.getPaymentReport.and.returnValue(of(emptyReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const avgValue = compiled.querySelector('.avg-card .summary-value');
    expect(avgValue?.textContent).toContain('$0.00');
  });

  it('should detect active filters correctly', () => {
    expect(component.hasActiveFilters()).toBe(false);

    component.filterForm.patchValue({
      startDate: new Date('2024-01-01')
    });

    expect(component.hasActiveFilters()).toBe(true);
  });

  it('should display trip details in table', () => {
    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const tableRows = compiled.querySelectorAll('.trips-table tbody tr');
    expect(tableRows.length).toBe(2);
  });

  it('should get status label correctly', () => {
    expect(component.getStatusLabel('Scheduled')).toBe('Scheduled');
    expect(component.getStatusLabel('PickedUp')).toBe('Picked Up');
    expect(component.getStatusLabel('InTransit')).toBe('In Transit');
    expect(component.getStatusLabel('Delivered')).toBe('Delivered');
    expect(component.getStatusLabel('Paid')).toBe('Paid');
  });
});
