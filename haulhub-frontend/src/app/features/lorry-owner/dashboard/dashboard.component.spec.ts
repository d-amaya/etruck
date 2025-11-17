import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { LorryService, TripService } from '../../../core/services';
import { Lorry, LorryVerificationStatus, Trip, TripStatus } from '@haulhub/shared';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let lorryServiceSpy: jasmine.SpyObj<LorryService>;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockLorries: Lorry[] = [
    {
      lorryId: 'ABC-123',
      ownerId: 'owner-1',
      make: 'Volvo',
      model: 'FH16',
      year: 2020,
      verificationStatus: LorryVerificationStatus.Approved,
      verificationDocuments: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      lorryId: 'XYZ-789',
      ownerId: 'owner-1',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2021,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [],
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z'
    }
  ];

  const mockTrips: Trip[] = [
    {
      tripId: 'trip-1',
      dispatcherId: 'dispatcher-1',
      pickupLocation: 'City A',
      dropoffLocation: 'City B',
      scheduledPickupDatetime: '2024-01-15T10:00:00Z',
      brokerId: 'broker-1',
      brokerName: 'Broker One',
      lorryId: 'ABC-123',
      driverId: 'driver-1',
      driverName: 'John Doe',
      brokerPayment: 1000,
      lorryOwnerPayment: 600,
      driverPayment: 300,
      status: TripStatus.Delivered,
      createdAt: '2024-01-10T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    }
  ];

  beforeEach(async () => {
    const lorryService = jasmine.createSpyObj('LorryService', ['getLorries']);
    const tripService = jasmine.createSpyObj('TripService', ['getTrips']);
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: LorryService, useValue: lorryService },
        { provide: TripService, useValue: tripService },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    }).compileComponents();

    lorryServiceSpy = TestBed.inject(LorryService) as jasmine.SpyObj<LorryService>;
    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;

    lorryServiceSpy.getLorries.and.returnValue(of(mockLorries));
    tripServiceSpy.getTrips.and.returnValue(of(mockTrips));

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load lorries on init', () => {
    fixture.detectChanges();

    expect(lorryServiceSpy.getLorries).toHaveBeenCalled();
    expect(component.lorries).toEqual(mockLorries);
    expect(component.loading).toBeFalsy();
  });

  it('should load recent trips on init', () => {
    fixture.detectChanges();

    expect(tripServiceSpy.getTrips).toHaveBeenCalled();
    expect(component.recentTrips.length).toBeGreaterThan(0);
    expect(component.loadingTrips).toBeFalsy();
  });

  it('should calculate statistics correctly', () => {
    fixture.detectChanges();

    expect(component.totalLorries).toBe(2);
    expect(component.approvedLorries).toBe(1);
    expect(component.pendingLorries).toBe(1);
  });



  it('should navigate to register lorry page', () => {
    component.onRegisterLorry();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/register']);
  });

  it('should navigate to lorries list page', () => {
    component.onViewLorries();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/lorries']);
  });

  it('should navigate to trips page', () => {
    component.onViewTrips();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/trips']);
  });

  it('should navigate to payments page', () => {
    component.onViewPayments();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/payments']);
  });

  it('should navigate to lorry details', () => {
    const lorry = mockLorries[0];
    component.onViewLorryDetails(lorry);

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/lorries', lorry.lorryId]);
  });

  it('should return correct status color', () => {
    expect(component.getStatusColor(LorryVerificationStatus.Approved)).toBe('primary');
    expect(component.getStatusColor(LorryVerificationStatus.Pending)).toBe('accent');
    expect(component.getStatusColor(LorryVerificationStatus.Rejected)).toBe('warn');
    expect(component.getStatusColor(LorryVerificationStatus.NeedsMoreEvidence)).toBe('accent');
  });

  it('should return correct status label', () => {
    expect(component.getStatusLabel(LorryVerificationStatus.Approved)).toBe('Approved');
    expect(component.getStatusLabel(LorryVerificationStatus.Pending)).toBe('Pending');
    expect(component.getStatusLabel(LorryVerificationStatus.Rejected)).toBe('Rejected');
    expect(component.getStatusLabel(LorryVerificationStatus.NeedsMoreEvidence)).toBe('Needs More Evidence');
  });
});
