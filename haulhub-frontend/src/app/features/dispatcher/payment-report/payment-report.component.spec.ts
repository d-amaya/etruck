import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { PaymentReportComponent } from './payment-report.component';
import { TripService } from '../../../core/services/trip.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DispatcherPaymentReport } from '@haulhub/shared';

describe('PaymentReportComponent', () => {
  let component: PaymentReportComponent;
  let fixture: ComponentFixture<PaymentReportComponent>;
  let tripService: jasmine.SpyObj<TripService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  const mockReport: DispatcherPaymentReport = {
    totalBrokerPayments: 10000,
    totalDriverPayments: 3000,
    totalLorryOwnerPayments: 4000,
    profit: 3000,
    tripCount: 5,
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
        brokerPayment: 2000,
        lorryOwnerPayment: 800,
        driverPayment: 600,
        status: 'Delivered'
      }
    ],
    groupedByBroker: {
      'broker1': {
        brokerName: 'Broker One',
        totalPayment: 10000,
        tripCount: 5
      }
    },
    groupedByDriver: {
      'driver1': {
        driverName: 'John Doe',
        totalPayment: 3000,
        tripCount: 5
      }
    },
    groupedByLorry: {
      'ABC-123': {
        totalPayment: 4000,
        tripCount: 5
      }
    }
  };

  beforeEach(async () => {
    const tripServiceSpy = jasmine.createSpyObj('TripService', ['getPaymentReport', 'getBrokers']);
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    // Mock getBrokers to return empty array (needed by DashboardStateService)
    tripServiceSpy.getBrokers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [
        PaymentReportComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TripService, useValue: tripServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();

    tripService = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    snackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    
    fixture = TestBed.createComponent(PaymentReportComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load payment report on init', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    
    fixture.detectChanges();
    
    expect(tripService.getPaymentReport).toHaveBeenCalled();
    expect(component.report).toEqual(mockReport);
    expect(component.loading).toBe(false);
  });

  it('should handle error when loading payment report', (done) => {
    const errorSpy = spyOn(console, 'error');
    tripService.getPaymentReport.and.returnValue(throwError(() => new Error('API Error')));
    
    component.loadReport();
    
    // Wait for async operations to complete
    setTimeout(() => {
      expect(errorSpy).toHaveBeenCalled();
      expect(component.loading).toBe(false);
      done();
    }, 100);
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(1234.56);
    expect(formatted).toContain('1,234.56');
  });

  it('should format date correctly', () => {
    const formatted = component.formatDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should get broker grouped data', () => {
    component.report = mockReport;
    
    const brokerData = component.getBrokerGroupedData();
    
    expect(brokerData.length).toBe(1);
    expect(brokerData[0].brokerName).toBe('Broker One');
    expect(brokerData[0].totalPayment).toBe(10000);
  });

  it('should get driver grouped data', () => {
    component.report = mockReport;
    
    const driverData = component.getDriverGroupedData();
    
    expect(driverData.length).toBe(1);
    expect(driverData[0].driverName).toBe('John Doe');
    expect(driverData[0].totalPayment).toBe(3000);
  });

  it('should get lorry grouped data', () => {
    component.report = mockReport;
    
    const lorryData = component.getLorryGroupedData();
    
    expect(lorryData.length).toBe(1);
    expect(lorryData[0].lorryId).toBe('ABC-123');
    expect(lorryData[0].totalPayment).toBe(4000);
  });

  it('should reload report when filter is submitted', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    fixture.detectChanges();
    
    tripService.getPaymentReport.calls.reset();
    
    component.onFilterSubmit();
    
    expect(tripService.getPaymentReport).toHaveBeenCalled();
  });

  it('should clear filters and reload report', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    fixture.detectChanges();
    
    tripService.getPaymentReport.calls.reset();
    
    component.onClearFilters();
    
    expect(component.filterForm.value.startDate).toBeTruthy();
    expect(component.filterForm.value.endDate).toBeTruthy();
    expect(tripService.getPaymentReport).toHaveBeenCalled();
  });

  it('should return empty array when no grouped data exists', () => {
    component.report = {
      ...mockReport,
      groupedByBroker: undefined,
      groupedByDriver: undefined,
      groupedByLorry: undefined
    };
    
    expect(component.getBrokerGroupedData()).toEqual([]);
    expect(component.getDriverGroupedData()).toEqual([]);
    expect(component.getLorryGroupedData()).toEqual([]);
  });

  it('should initialize activeTabIndex to 0', () => {
    expect(component.activeTabIndex).toBe(0);
  });

  it('should include groupBy parameter when activeTabIndex is 0 (By Broker)', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    component.activeTabIndex = 0;
    
    component.loadReport();
    
    const callArgs = tripService.getPaymentReport.calls.mostRecent().args[0];
    expect(callArgs?.groupBy).toBe('broker');
  });

  it('should include groupBy parameter when activeTabIndex is 1 (By Driver)', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    component.activeTabIndex = 1;
    
    component.loadReport();
    
    const callArgs = tripService.getPaymentReport.calls.mostRecent().args[0];
    expect(callArgs?.groupBy).toBe('driver');
  });

  it('should include groupBy parameter when activeTabIndex is 2 (By Lorry Owner)', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    component.activeTabIndex = 2;
    
    component.loadReport();
    
    const callArgs = tripService.getPaymentReport.calls.mostRecent().args[0];
    expect(callArgs?.groupBy).toBe('lorry');
  });

  it('should not include groupBy parameter when activeTabIndex is 3 (Trip Details)', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    component.activeTabIndex = 3;
    
    component.loadReport();
    
    const callArgs = tripService.getPaymentReport.calls.mostRecent().args[0];
    expect(callArgs?.groupBy).toBeUndefined();
  });

  it('should update activeTabIndex and reload report on tab change', () => {
    tripService.getPaymentReport.and.returnValue(of(mockReport));
    fixture.detectChanges();
    
    tripService.getPaymentReport.calls.reset();
    
    const mockEvent = { index: 1 } as any;
    component.onTabChange(mockEvent);
    
    expect(component.activeTabIndex).toBe(1);
    expect(tripService.getPaymentReport).toHaveBeenCalled();
    const callArgs = tripService.getPaymentReport.calls.mostRecent().args[0];
    expect(callArgs?.groupBy).toBe('driver');
  });
});
