import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { PaymentSummaryComponent } from './payment-summary.component';
import { TripService, PaymentSummary } from '../../../../core/services/trip.service';
import { DashboardStateService } from '../dashboard-state.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TripStatus, Trip } from '@haulhub/shared';

describe('PaymentSummaryComponent', () => {
  let component: PaymentSummaryComponent;
  let fixture: ComponentFixture<PaymentSummaryComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let dashboardStateSpy: jasmine.SpyObj<DashboardStateService>;

  const mockPaymentSummary: PaymentSummary = {
    totalBrokerPayments: 50000,
    totalDriverPayments: 20000,
    totalLorryOwnerPayments: 15000,
    totalProfit: 15000
  };

  beforeEach(async () => {
    const tripSpy = jasmine.createSpyObj('TripService', ['getPaymentSummary']);
    const refreshSubject = new Subject<void>();
    const dashboardSpy = jasmine.createSpyObj('DashboardStateService', ['getCurrentFilters'], {
      filters$: of({
        dateRange: { startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') },
        status: null,
        brokerId: null,
        lorryId: null,
        driverId: null,
        driverName: null
      }),
      refreshPaymentSummary$: refreshSubject.asObservable()
    });

    dashboardSpy.getCurrentFilters.and.returnValue({
      dateRange: { startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') },
      status: null,
      brokerId: null,
      lorryId: null,
      driverId: null,
      driverName: null
    });

    tripSpy.getPaymentSummary.and.returnValue(of(mockPaymentSummary));

    await TestBed.configureTestingModule({
      imports: [PaymentSummaryComponent, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: tripSpy },
        { provide: DashboardStateService, useValue: dashboardSpy }
      ]
    }).compileComponents();

    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    dashboardStateSpy = TestBed.inject(DashboardStateService) as jasmine.SpyObj<DashboardStateService>;

    fixture = TestBed.createComponent(PaymentSummaryComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load and display payment summary from API', () => {
    fixture.detectChanges();

    expect(tripServiceSpy.getPaymentSummary).toHaveBeenCalled();
    expect(component.paymentSummary.totalBrokerPayments).toBe(50000);
    expect(component.paymentSummary.totalDriverPayments).toBe(20000);
    expect(component.paymentSummary.totalLorryOwnerPayments).toBe(15000);
    expect(component.paymentSummary.totalProfit).toBe(15000);
  });

  it('should display zero values when API returns empty summary', () => {
    const emptyPaymentSummary: PaymentSummary = {
      totalBrokerPayments: 0,
      totalDriverPayments: 0,
      totalLorryOwnerPayments: 0,
      totalProfit: 0
    };
    tripServiceSpy.getPaymentSummary.and.returnValue(of(emptyPaymentSummary));

    fixture.detectChanges();

    expect(component.paymentSummary.totalBrokerPayments).toBe(0);
    expect(component.paymentSummary.totalDriverPayments).toBe(0);
    expect(component.paymentSummary.totalLorryOwnerPayments).toBe(0);
    expect(component.paymentSummary.totalProfit).toBe(0);
  });

  it('should identify positive profit correctly', () => {
    const positiveProfitSummary: PaymentSummary = {
      totalBrokerPayments: 50000,
      totalDriverPayments: 20000,
      totalLorryOwnerPayments: 15000,
      totalProfit: 15000
    };
    tripServiceSpy.getPaymentSummary.and.returnValue(of(positiveProfitSummary));

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(true);
    expect(component.profitClass).toBe('profit-positive');
  });

  it('should identify negative profit correctly', () => {
    const negativeProfitSummary: PaymentSummary = {
      totalBrokerPayments: 30000,
      totalDriverPayments: 20000,
      totalLorryOwnerPayments: 15000,
      totalProfit: -5000
    };
    tripServiceSpy.getPaymentSummary.and.returnValue(of(negativeProfitSummary));

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(false);
    expect(component.profitClass).toBe('profit-negative');
  });

  it('should treat zero profit as positive', () => {
    const zeroProfitSummary: PaymentSummary = {
      totalBrokerPayments: 35000,
      totalDriverPayments: 20000,
      totalLorryOwnerPayments: 15000,
      totalProfit: 0
    };
    tripServiceSpy.getPaymentSummary.and.returnValue(of(zeroProfitSummary));

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(true);
    expect(component.profitClass).toBe('profit-positive');
  });

  it('should update payment summary when filters change', () => {
    const initialSummary: PaymentSummary = {
      totalBrokerPayments: 30000,
      totalDriverPayments: 8000,
      totalLorryOwnerPayments: 10000,
      totalProfit: 12000
    };
    
    const updatedSummary: PaymentSummary = {
      totalBrokerPayments: 20000,
      totalDriverPayments: 12000,
      totalLorryOwnerPayments: 5000,
      totalProfit: 3000
    };

    tripServiceSpy.getPaymentSummary.and.returnValue(of(initialSummary));
    fixture.detectChanges();

    expect(component.paymentSummary.totalBrokerPayments).toBe(30000);
    expect(component.paymentSummary.totalProfit).toBe(12000);

    // Simulate filter change
    tripServiceSpy.getPaymentSummary.and.returnValue(of(updatedSummary));
    Object.defineProperty(dashboardStateSpy, 'filters$', {
      get: () => of({
        dateRange: { startDate: new Date('2024-06-01'), endDate: new Date('2024-06-30') },
        status: null,
        brokerId: null,
        lorryId: null,
        driverId: null,
        driverName: null
      })
    });
    
    component.ngOnInit();

    expect(component.paymentSummary.totalBrokerPayments).toBe(20000);
    expect(component.paymentSummary.totalProfit).toBe(3000);
  });
});
