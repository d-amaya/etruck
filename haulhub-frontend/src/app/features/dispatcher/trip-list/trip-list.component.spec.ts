import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TripListComponent } from './trip-list.component';
import { OrderService } from '../../../core/services/order.service';
import { Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('TripListComponent', () => {
  let component: TripListComponent;
  let fixture: ComponentFixture<TripListComponent>;
  let mockOrderService: jasmine.SpyObj<OrderService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockOrderService = jasmine.createSpyObj('OrderService', ['getOrders', 'getBrokers']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockOrderService.getOrders.and.returnValue(of({ trips: [], lastEvaluatedKey: undefined } as any));
    mockOrderService.getBrokers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [TripListComponent, NoopAnimationsModule],
      providers: [
        { provide: OrderService, useValue: mockOrderService },
        { provide: Router, useValue: mockRouter },
        FormBuilder
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TripListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  xit('should load trips on init', () => {
    fixture.detectChanges();
    expect(mockOrderService.getOrders).toHaveBeenCalled();
  });

  xit('should load brokers on init', () => {
    fixture.detectChanges();
    expect(mockOrderService.getBrokers).toHaveBeenCalled();
  });

  xit('should apply filters when onApplyFilters is called', () => {
    fixture.detectChanges();
    mockOrderService.getOrders.calls.reset();
    component.onApplyFilters();
    expect(mockOrderService.getOrders).toHaveBeenCalled();
  });

  xit('should clear filters when onClearFilters is called', () => {
    fixture.detectChanges();
    component.filterForm.patchValue({ truckId: 'ABC123' });
    component.onClearFilters();
    expect(component.filterForm.value.truckId).toBe('');
  });

  it('should navigate to create trip when onCreateTrip is called', () => {
    component.onCreateTrip();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dispatcher/trips/create']);
  });

  it('should navigate to dashboard when onBackToDashboard is called', () => {
    component.onBackToDashboard();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dispatcher/dashboard']);
  });
});
