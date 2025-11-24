import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

  beforeEach(async () => {
    const tripSpy = jasmine.createSpyObj('TripService', ['getPaymentSummary']);
    const dashboardSpy = jasmine.createSpyObj('DashboardStateService', ['updateFilters'], {
      filteredTrips$: of([])
    });

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

  it('should calculate and display payment summary from filtered trips', () => {
    const mockTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        brokerPayment: 30000,
        lorryId: 'lorry-1',
        lorryOwnerPayment: 10000,
        driverId: 'driver-1',
        driverName: 'John Doe',
        driverPayment: 8000,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      },
      {
        tripId: 'trip-2',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-16T10:00:00Z',
        pickupLocation: 'Location C',
        dropoffLocation: 'Location D',
        brokerId: 'broker-2',
        brokerName: 'Another Broker',
        brokerPayment: 20000,
        lorryId: 'lorry-2',
        lorryOwnerPayment: 5000,
        driverId: 'driver-2',
        driverName: 'Jane Smith',
        driverPayment: 12000,
        status: TripStatus.Delivered,
        createdAt: '2024-01-16T09:00:00Z',
        updatedAt: '2024-01-16T09:00:00Z'
      }
    ];

    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(mockTrips)
    });

    fixture.detectChanges();

    expect(component.paymentSummary.totalBrokerPayments).toBe(50000);
    expect(component.paymentSummary.totalDriverPayments).toBe(20000);
    expect(component.paymentSummary.totalLorryOwnerPayments).toBe(15000);
    expect(component.paymentSummary.totalProfit).toBe(15000);
  });

  it('should display zero values when no trips exist', () => {
    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of([])
    });

    fixture.detectChanges();

    expect(component.paymentSummary.totalBrokerPayments).toBe(0);
    expect(component.paymentSummary.totalDriverPayments).toBe(0);
    expect(component.paymentSummary.totalLorryOwnerPayments).toBe(0);
    expect(component.paymentSummary.totalProfit).toBe(0);
  });

  it('should identify positive profit correctly', () => {
    const mockTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        brokerPayment: 50000,
        lorryId: 'lorry-1',
        lorryOwnerPayment: 15000,
        driverId: 'driver-1',
        driverName: 'John Doe',
        driverPayment: 20000,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      }
    ];

    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(mockTrips)
    });

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(true);
    expect(component.profitClass).toBe('profit-positive');
  });

  it('should identify negative profit correctly', () => {
    const mockTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        brokerPayment: 30000,
        lorryId: 'lorry-1',
        lorryOwnerPayment: 15000,
        driverId: 'driver-1',
        driverName: 'John Doe',
        driverPayment: 20000,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      }
    ];

    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(mockTrips)
    });

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(false);
    expect(component.profitClass).toBe('profit-negative');
  });

  it('should treat zero profit as positive', () => {
    const mockTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        brokerPayment: 35000,
        lorryId: 'lorry-1',
        lorryOwnerPayment: 15000,
        driverId: 'driver-1',
        driverName: 'John Doe',
        driverPayment: 20000,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      }
    ];

    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(mockTrips)
    });

    fixture.detectChanges();

    expect(component.isProfitPositive).toBe(true);
    expect(component.profitClass).toBe('profit-positive');
  });

  it('should update payment summary when filtered trips change', () => {
    const initialTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-15T10:00:00Z',
        pickupLocation: 'Location A',
        dropoffLocation: 'Location B',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        brokerPayment: 30000,
        lorryId: 'lorry-1',
        lorryOwnerPayment: 10000,
        driverId: 'driver-1',
        driverName: 'John Doe',
        driverPayment: 8000,
        status: TripStatus.Scheduled,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      }
    ];

    const updatedTrips: Trip[] = [
      {
        tripId: 'trip-2',
        dispatcherId: 'dispatcher-1',
        scheduledPickupDatetime: '2024-01-16T10:00:00Z',
        pickupLocation: 'Location C',
        dropoffLocation: 'Location D',
        brokerId: 'broker-2',
        brokerName: 'Another Broker',
        brokerPayment: 20000,
        lorryId: 'lorry-2',
        lorryOwnerPayment: 5000,
        driverId: 'driver-2',
        driverName: 'Jane Smith',
        driverPayment: 12000,
        status: TripStatus.Delivered,
        createdAt: '2024-01-16T09:00:00Z',
        updatedAt: '2024-01-16T09:00:00Z'
      }
    ];

    // Set initial trips
    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(initialTrips)
    });

    fixture.detectChanges();

    expect(component.paymentSummary.totalBrokerPayments).toBe(30000);
    expect(component.paymentSummary.totalProfit).toBe(12000);

    // Update trips
    Object.defineProperty(dashboardStateSpy, 'filteredTrips$', {
      get: () => of(updatedTrips)
    });

    component.ngOnInit();

    expect(component.paymentSummary.totalBrokerPayments).toBe(20000);
    expect(component.paymentSummary.totalProfit).toBe(3000);
  });
});
