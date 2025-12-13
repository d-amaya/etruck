import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TripListComponent } from './trip-list.component';
import { TripService } from '../../../core/services';
import { Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('TripListComponent', () => {
  let component: TripListComponent;
  let fixture: ComponentFixture<TripListComponent>;
  let mockTripService: jasmine.SpyObj<TripService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockTripService = jasmine.createSpyObj('TripService', ['getTrips', 'getBrokers']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockTripService.getTrips.and.returnValue(of({ trips: [], lastEvaluatedKey: undefined }));
    mockTripService.getBrokers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [TripListComponent, NoopAnimationsModule],
      providers: [
        { provide: TripService, useValue: mockTripService },
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

  it('should load trips on init', () => {
    fixture.detectChanges();
    expect(mockTripService.getTrips).toHaveBeenCalled();
  });

  it('should load brokers on init', () => {
    fixture.detectChanges();
    expect(mockTripService.getBrokers).toHaveBeenCalled();
  });

  it('should apply filters when onApplyFilters is called', () => {
    fixture.detectChanges();
    mockTripService.getTrips.calls.reset();
    
    component.onApplyFilters();
    
    expect(mockTripService.getTrips).toHaveBeenCalled();
  });

  it('should clear filters when onClearFilters is called', () => {
    fixture.detectChanges();
    component.filterForm.patchValue({ lorryId: 'ABC123' });
    
    component.onClearFilters();
    
    expect(component.filterForm.value.lorryId).toBe('');
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
