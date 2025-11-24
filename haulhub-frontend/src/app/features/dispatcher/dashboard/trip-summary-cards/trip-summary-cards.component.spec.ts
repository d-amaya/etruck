import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TripSummaryCardsComponent } from './trip-summary-cards.component';
import { TripService } from '../../../../core/services/trip.service';
import { DashboardStateService } from '../dashboard-state.service';
import { TripStatus } from '@haulhub/shared';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('TripSummaryCardsComponent', () => {
  let component: TripSummaryCardsComponent;
  let fixture: ComponentFixture<TripSummaryCardsComponent>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let dashboardStateSpy: jasmine.SpyObj<DashboardStateService>;

  beforeEach(async () => {
    const tripSpy = jasmine.createSpyObj('TripService', ['getTripSummaryByStatus']);
    const dashboardSpy = jasmine.createSpyObj('DashboardStateService', ['updateFilters'], {
      filters$: of({
        dateRange: { startDate: null, endDate: null },
        status: null,
        brokerId: null,
        lorryId: null,
        driverId: null,
        driverName: null
      })
    });

    await TestBed.configureTestingModule({
      imports: [TripSummaryCardsComponent, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: tripSpy },
        { provide: DashboardStateService, useValue: dashboardSpy }
      ]
    }).compileComponents();

    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    dashboardStateSpy = TestBed.inject(DashboardStateService) as jasmine.SpyObj<DashboardStateService>;

    fixture = TestBed.createComponent(TripSummaryCardsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load and display trip summary on init', () => {
    const mockSummary: Record<TripStatus, number> = {
      [TripStatus.Scheduled]: 5,
      [TripStatus.PickedUp]: 3,
      [TripStatus.InTransit]: 7,
      [TripStatus.Delivered]: 10,
      [TripStatus.Paid]: 15
    };

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of(mockSummary));

    fixture.detectChanges();

    expect(component.summaryCards.length).toBe(5);
    expect(component.summaryCards[0].count).toBe(5);
    expect(component.summaryCards[0].label).toBe('Scheduled');
    expect(component.summaryCards[1].count).toBe(3);
    expect(component.summaryCards[2].count).toBe(7);
    expect(component.summaryCards[3].count).toBe(10);
    expect(component.summaryCards[4].count).toBe(15);
  });

  it('should display zero counts when no trips exist', () => {
    const mockSummary: Record<TripStatus, number> = {
      [TripStatus.Scheduled]: 0,
      [TripStatus.PickedUp]: 0,
      [TripStatus.InTransit]: 0,
      [TripStatus.Delivered]: 0,
      [TripStatus.Paid]: 0
    };

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of(mockSummary));

    fixture.detectChanges();

    expect(component.summaryCards.length).toBe(5);
    component.summaryCards.forEach(card => {
      expect(card.count).toBe(0);
    });
  });

  it('should call updateFilters when a card is clicked', () => {
    const mockSummary: Record<TripStatus, number> = {
      [TripStatus.Scheduled]: 5,
      [TripStatus.PickedUp]: 3,
      [TripStatus.InTransit]: 7,
      [TripStatus.Delivered]: 10,
      [TripStatus.Paid]: 15
    };

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of(mockSummary));

    fixture.detectChanges();

    component.filterByStatus(TripStatus.Scheduled);

    expect(dashboardStateSpy.updateFilters).toHaveBeenCalledWith({ status: TripStatus.Scheduled });
  });

  it('should have correct icons and colors for each status', () => {
    const mockSummary: Record<TripStatus, number> = {
      [TripStatus.Scheduled]: 1,
      [TripStatus.PickedUp]: 1,
      [TripStatus.InTransit]: 1,
      [TripStatus.Delivered]: 1,
      [TripStatus.Paid]: 1
    };

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of(mockSummary));

    fixture.detectChanges();

    expect(component.summaryCards[0].icon).toBe('schedule');
    expect(component.summaryCards[0].color).toBe('#E3F2FD');
    
    expect(component.summaryCards[1].icon).toBe('local_shipping');
    expect(component.summaryCards[1].color).toBe('#FFF3E0');
    
    expect(component.summaryCards[2].icon).toBe('directions');
    expect(component.summaryCards[2].color).toBe('#F3E5F5');
    
    expect(component.summaryCards[3].icon).toBe('check_circle');
    expect(component.summaryCards[3].color).toBe('#E8F5E9');
    
    expect(component.summaryCards[4].icon).toBe('payments');
    expect(component.summaryCards[4].color).toBe('#E0F2F1');
  });

  xit('should build API filters correctly with date range', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    dashboardStateSpy.filters$ = of({
      dateRange: { startDate, endDate },
      status: TripStatus.Scheduled,
      brokerId: 'broker-123',
      lorryId: 'lorry-456',
      driverId: null,
      driverName: 'John Doe'
    });

    tripServiceSpy.getTripSummaryByStatus.and.returnValue(of({
      [TripStatus.Scheduled]: 5,
      [TripStatus.PickedUp]: 0,
      [TripStatus.InTransit]: 0,
      [TripStatus.Delivered]: 0,
      [TripStatus.Paid]: 0
    }));

    fixture.detectChanges();

    expect(tripServiceSpy.getTripSummaryByStatus).toHaveBeenCalledWith({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: TripStatus.Scheduled,
      brokerId: 'broker-123',
      lorryId: 'lorry-456',
      driverName: 'John Doe'
    });
  });
});
