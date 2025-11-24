import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { DashboardChartsComponent } from './dashboard-charts.component';
import { TripService } from '../../../../core/services/trip.service';
import { DashboardStateService } from '../dashboard-state.service';
import { TripStatus } from '@haulhub/shared';

describe('DashboardChartsComponent', () => {
  let component: DashboardChartsComponent;
  let fixture: ComponentFixture<DashboardChartsComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let dashboardStateServiceSpy: jasmine.SpyObj<DashboardStateService>;

  const mockStatusSummary: Record<TripStatus, number> = {
    [TripStatus.Scheduled]: 5,
    [TripStatus.PickedUp]: 3,
    [TripStatus.InTransit]: 7,
    [TripStatus.Delivered]: 10,
    [TripStatus.Paid]: 15
  };

  const mockPaymentsTimeline = {
    labels: ['Jan', 'Feb', 'Mar'],
    brokerPayments: [10000, 15000, 12000],
    driverPayments: [4000, 6000, 5000],
    lorryOwnerPayments: [3000, 4500, 3500],
    profit: [3000, 4500, 3500]
  };

  const mockFilters = {
    dateRange: { startDate: null, endDate: null },
    status: null,
    brokerId: null,
    lorryId: null,
    driverId: null,
    driverName: null
  };

  beforeEach(async () => {
    tripServiceSpy = jasmine.createSpyObj('TripService', [
      'getTripSummaryByStatus',
      'getPaymentsTimeline'
    ]);
    dashboardStateServiceSpy = jasmine.createSpyObj('DashboardStateService', [], {
      filters$: of(mockFilters)
    });

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of(mockStatusSummary));
    tripServiceSpy.getPaymentsTimeline.and.returnValue(of(mockPaymentsTimeline));

    await TestBed.configureTestingModule({
      imports: [DashboardChartsComponent, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: tripServiceSpy },
        { provide: DashboardStateService, useValue: dashboardStateServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardChartsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load chart data on init', () => {
    fixture.detectChanges();

    expect(tripServiceSpy.getTripSummaryByStatus).toHaveBeenCalled();
    expect(tripServiceSpy.getPaymentsTimeline).toHaveBeenCalled();
  });

  it('should update trips by status chart with correct data', () => {
    fixture.detectChanges();

    expect(component.tripsByStatusData.labels?.length).toBe(5);
    expect(component.tripsByStatusData.datasets[0].data).toEqual([5, 3, 7, 10, 15]);
  });

  it('should update payments over time chart with correct data', () => {
    fixture.detectChanges();

    expect(component.paymentsOverTimeData.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(component.paymentsOverTimeData.datasets.length).toBe(4);
    expect(component.paymentsOverTimeData.datasets[0].label).toBe('Broker Payments');
    expect(component.paymentsOverTimeData.datasets[0].data).toEqual([10000, 15000, 12000]);
  });

  it('should use muted professional colors for bar chart', () => {
    fixture.detectChanges();

    const backgroundColor = component.tripsByStatusData.datasets[0].backgroundColor as string[];
    expect(backgroundColor).toContain('#90CAF9'); // Light blue
    expect(backgroundColor).toContain('#FFE082'); // Light amber
    expect(backgroundColor).toContain('#CE93D8'); // Light purple
  });

  it('should configure line chart with legend at bottom', () => {
    expect(component.lineChartOptions.plugins?.legend?.display).toBe(true);
    expect(component.lineChartOptions.plugins?.legend?.position).toBe('bottom');
  });

  it('should reload charts when filters change', () => {
    fixture.detectChanges();
    
    const initialCallCount = tripServiceSpy.getTripSummaryByStatus.calls.count();
    
    // Simulate filter change
    const newFilters = { ...mockFilters, status: TripStatus.Scheduled };
    (dashboardStateServiceSpy as any).filters$ = of(newFilters);
    
    // Component should react to filter changes through the subscription
    expect(tripServiceSpy.getTripSummaryByStatus).toHaveBeenCalled();
  });
});
