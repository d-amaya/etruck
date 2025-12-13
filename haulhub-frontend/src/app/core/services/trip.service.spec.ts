import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TripService } from './trip.service';
import { ApiService } from './api.service';
import { AdminService } from './admin.service';
import { Trip, Broker, CreateTripDto, TripStatus } from '@haulhub/shared';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';

describe('TripService', () => {
  let service: TripService;
  let httpMock: HttpTestingController;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;

  beforeEach(() => {
    const adminSpy = jasmine.createSpyObj('AdminService', ['getAllBrokers']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TripService,
        ApiService,
        { provide: AdminService, useValue: adminSpy }
      ]
    });
    service = TestBed.inject(TripService);
    httpMock = TestBed.inject(HttpTestingController);
    adminServiceSpy = TestBed.inject(AdminService) as jasmine.SpyObj<AdminService>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create a trip', () => {
    const mockTrip: CreateTripDto = {
      pickupLocation: 'New York',
      dropoffLocation: 'Boston',
      scheduledPickupDatetime: '2024-12-01T10:00:00Z',
      brokerId: 'broker-1',
      lorryId: 'ABC-123',
      driverId: 'driver-1',
      driverName: 'John Doe',
      brokerPayment: 1000,
      lorryOwnerPayment: 600,
      driverPayment: 300
    };

    const mockResponse: Trip = {
      tripId: 'trip-1',
      dispatcherId: 'dispatcher-1',
      ...mockTrip,
      brokerName: 'Test Broker',
      status: TripStatus.Scheduled,
      createdAt: '2024-11-16T10:00:00Z',
      updatedAt: '2024-11-16T10:00:00Z'
    };

    service.createTrip(mockTrip).subscribe(trip => {
      expect(trip).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/trips`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(mockTrip);
    req.flush(mockResponse);
  });

  it('should get brokers', () => {
    const mockBrokers: Broker[] = [
      {
        brokerId: 'broker-1',
        brokerName: 'Test Broker 1',
        isActive: true,
        createdAt: '2024-11-16T10:00:00Z',
        updatedAt: '2024-11-16T10:00:00Z'
      },
      {
        brokerId: 'broker-2',
        brokerName: 'Test Broker 2',
        isActive: true,
        createdAt: '2024-11-16T10:00:00Z',
        updatedAt: '2024-11-16T10:00:00Z'
      }
    ];

    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));

    service.getBrokers().subscribe(brokers => {
      expect(brokers).toEqual(mockBrokers);
      expect(brokers.length).toBe(2);
      expect(adminServiceSpy.getAllBrokers).toHaveBeenCalledWith(true);
    });
  });

  it('should get trips', () => {
    const mockTrips: Trip[] = [
      {
        tripId: 'trip-1',
        dispatcherId: 'dispatcher-1',
        pickupLocation: 'New York',
        dropoffLocation: 'Boston',
        scheduledPickupDatetime: '2024-12-01T10:00:00Z',
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        lorryId: 'ABC-123',
        driverId: 'driver-1',
        driverName: 'John Doe',
        brokerPayment: 1000,
        lorryOwnerPayment: 600,
        driverPayment: 300,
        status: TripStatus.Scheduled,
        createdAt: '2024-11-16T10:00:00Z',
        updatedAt: '2024-11-16T10:00:00Z'
      }
    ];

    service.getTrips().subscribe(response => {
      expect(response.trips).toEqual(mockTrips);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/trips`);
    expect(req.request.method).toBe('GET');
    req.flush({ trips: mockTrips });
  });

  it('should get payment report', () => {
    const mockReport = {
      totalBrokerPayments: 10000,
      totalDriverPayments: 3000,
      totalLorryOwnerPayments: 4000,
      profit: 3000,
      tripCount: 5,
      trips: [],
      groupedByBroker: {},
      groupedByDriver: {},
      groupedByLorry: {}
    };

    service.getPaymentReport({ startDate: '2024-01-01', endDate: '2024-01-31' }).subscribe(report => {
      expect(report).toEqual(mockReport);
    });

    const req = httpMock.expectOne((request) => 
      request.url === `${environment.apiUrl}/trips/reports/payments` &&
      request.params.get('startDate') === '2024-01-01' &&
      request.params.get('endDate') === '2024-01-31'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockReport);
  });
});
