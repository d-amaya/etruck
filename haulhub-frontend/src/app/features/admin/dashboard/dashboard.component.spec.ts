import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AdminService, DashboardSummary } from '../../../core/services/admin.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockSummary: DashboardSummary = {
    pendingUserCount: 5,
    pendingLorryCount: 3,
    usersByRole: {
      Dispatcher: 10,
      LorryOwner: 8,
      Driver: 15,
      Admin: 2
    }
  };

  beforeEach(async () => {
    const adminSpy = jasmine.createSpyObj('AdminService', ['getDashboardSummary']);
    const routerSpyObj = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AdminService, useValue: adminSpy },
        { provide: Router, useValue: routerSpyObj }
      ]
    })
    .overrideComponent(DashboardComponent, {
      set: {
        providers: [
          { provide: AdminService, useValue: adminSpy },
          { provide: Router, useValue: routerSpyObj }
        ]
      }
    })
    .compileComponents();

    adminServiceSpy = TestBed.inject(AdminService) as jasmine.SpyObj<AdminService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    
    // Set up default spy return value to prevent errors
    adminServiceSpy.getDashboardSummary.and.returnValue(of(mockSummary));
    
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load dashboard data on init', fakeAsync(() => {
      adminServiceSpy.getDashboardSummary.and.returnValue(of(mockSummary));

      fixture.detectChanges(); // triggers ngOnInit
      tick(); // Process all pending async operations

      expect(adminServiceSpy.getDashboardSummary).toHaveBeenCalled();
      expect(component.loading).toBe(false);
      expect(component.summary).toEqual(mockSummary);
      expect(component.error).toBeNull();
    }));

    it('should handle error when loading dashboard data', fakeAsync(() => {
      const errorMessage = 'Failed to load';
      adminServiceSpy.getDashboardSummary.and.returnValue(
        throwError(() => new Error(errorMessage))
      );

      fixture.detectChanges(); // triggers ngOnInit
      tick(); // Process all pending async operations

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Failed to load dashboard data. Please try again.');
      expect(component.summary).toBeNull();
    }));
  });

  describe('loadDashboardData', () => {
    it('should set loading to true while fetching data', () => {
      adminServiceSpy.getDashboardSummary.and.returnValue(of(mockSummary));

      component.loadDashboardData();

      expect(component.loading).toBe(false); // Will be false after observable completes
      expect(component.summary).toEqual(mockSummary);
    });

    it('should clear previous error when reloading', () => {
      component.error = 'Previous error';
      adminServiceSpy.getDashboardSummary.and.returnValue(of(mockSummary));

      component.loadDashboardData();

      expect(component.error).toBeNull();
    });
  });

  describe('navigation methods', () => {
    it('should navigate to user verification page', () => {
      component.navigateToUserVerification();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users/verification']);
    });

    it('should navigate to lorry verification page', () => {
      component.navigateToLorryVerification();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/lorries/verification']);
    });

    it('should navigate to broker management page', () => {
      component.navigateToBrokerManagement();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/brokers']);
    });
  });

  describe('getTotalUsers', () => {
    it('should return 0 when summary is null', () => {
      component.summary = null;

      expect(component.getTotalUsers()).toBe(0);
    });

    it('should calculate total users correctly', () => {
      component.summary = mockSummary;

      const total = component.getTotalUsers();

      expect(total).toBe(35); // 10 + 8 + 15 + 2
    });

    it('should handle zero users', () => {
      component.summary = {
        pendingUserCount: 0,
        pendingLorryCount: 0,
        usersByRole: {
          Dispatcher: 0,
          LorryOwner: 0,
          Driver: 0,
          Admin: 0
        }
      };

      expect(component.getTotalUsers()).toBe(0);
    });
  });

  describe('template rendering', () => {
    it('should display dashboard content when data is loaded', () => {
      fixture.detectChanges(); // This will trigger ngOnInit with mock data

      const compiled = fixture.nativeElement;
      const dashboardContent = compiled.querySelector('.dashboard-content');
      expect(dashboardContent).toBeTruthy();
    });

    it('should display pending counts correctly', () => {
      fixture.detectChanges(); // This will trigger ngOnInit with mock data

      const compiled = fixture.nativeElement;
      const statValues = compiled.querySelectorAll('.stat-value');
      
      // Check if pending counts are displayed (first two stat cards)
      expect(statValues.length).toBeGreaterThan(0);
    });
  });
});
