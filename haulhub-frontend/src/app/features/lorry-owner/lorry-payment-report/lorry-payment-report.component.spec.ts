import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { LorryPaymentReportComponent } from './lorry-payment-report.component';
import { TripService } from '../../../core/services/trip.service';
import { LorryOwnerPaymentReport } from '@haulhub/shared';

describe('LorryPaymentReportComponent', () => {
  let component: LorryPaymentReportComponent;
  let fixture: ComponentFixture<LorryPaymentReportComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockReport: LorryOwnerPaymentReport = {
    totalLorryOwnerPayments: 5000,
    tripCount: 10,
    trips: [
      {
        tripId: 'trip1',
        dispatcherId: 'dispatcher1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'City A',
        dropoffLocation: 'City B',
        brokerId: 'broker1',
        brokerName: 'Broker One',
        lorryId: 'ABC-123',
        driverId: 'driver1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 500,
        driverPayment: 300,
        status: 'Delivered'
      }
    ],
    groupedByLorry: {
      'ABC-123': {
        totalPayment: 3000,
        tripCount: 6
      },
      'XYZ-789': {
        totalPayment: 2000,
        tripCount: 4
      }
    },
    groupedByDispatcher: {
      'dispatcher1': {
        totalPayment: 3500,
        tripCount: 7
      },
      'dispatcher2': {
        totalPayment: 1500,
        tripCount: 3
      }
    }
  };

  beforeEach(async () => {
    tripServiceSpy = jasmine.createSpyObj('TripService', ['getPaymentReport']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        LorryPaymentReportComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: TripService, useValue: tripServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    })
    .overrideComponent(LorryPaymentReportComponent, {
      set: {
        providers: [
          { provide: MatSnackBar, useValue: snackBarSpy }
        ]
      }
    })
    .compileComponents();

    tripServiceSpy.getPaymentReport.and.returnValue(of(mockReport));
    fixture = TestBed.createComponent(LorryPaymentReportComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default date range', () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    fixture.detectChanges();

    const startDate = component.filterForm.get('startDate')?.value;
    const endDate = component.filterForm.get('endDate')?.value;

    expect(startDate.getDate()).toBe(firstDay.getDate());
    expect(endDate.getDate()).toBe(lastDay.getDate());
  });

  it('should load report on init', () => {
    fixture.detectChanges();

    expect(tripServiceSpy.getPaymentReport).toHaveBeenCalled();
    expect(component.report).toEqual(mockReport);
    expect(component.loading).toBe(false);
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(1234.56);
    expect(formatted).toContain('1,234.56');
    expect(formatted).toContain('$');
  });

  it('should format date correctly', () => {
    const formatted = component.formatDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should get lorry grouped data', () => {
    component.report = mockReport;
    const lorryData = component.getLorryGroupedData();

    expect(lorryData.length).toBe(2);
    expect(lorryData[0].lorryId).toBe('ABC-123');
    expect(lorryData[0].totalPayment).toBe(3000);
    expect(lorryData[0].tripCount).toBe(6);
  });

  it('should get dispatcher grouped data', () => {
    component.report = mockReport;
    const dispatcherData = component.getDispatcherGroupedData();

    expect(dispatcherData.length).toBe(2);
    expect(dispatcherData[0].dispatcherId).toBe('dispatcher1');
    expect(dispatcherData[0].totalPayment).toBe(3500);
    expect(dispatcherData[0].tripCount).toBe(7);
  });

  it('should reload report when filters are submitted', () => {
    fixture.detectChanges();
    tripServiceSpy.getPaymentReport.calls.reset();

    component.onFilterSubmit();

    expect(tripServiceSpy.getPaymentReport).toHaveBeenCalled();
  });

  it('should clear filters and reload report', () => {
    fixture.detectChanges();
    tripServiceSpy.getPaymentReport.calls.reset();

    component.onClearFilters();

    expect(tripServiceSpy.getPaymentReport).toHaveBeenCalled();
  });

  it('should return empty array when no lorry grouped data', () => {
    component.report = { ...mockReport, groupedByLorry: undefined };
    const lorryData = component.getLorryGroupedData();

    expect(lorryData.length).toBe(0);
  });

  it('should return empty array when no dispatcher grouped data', () => {
    component.report = { ...mockReport, groupedByDispatcher: undefined };
    const dispatcherData = component.getDispatcherGroupedData();

    expect(dispatcherData.length).toBe(0);
  });
});
