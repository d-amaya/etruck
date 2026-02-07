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
      orderConfirmation: 'ORDER-123',
      pickupCompany: 'Acme Corp',
      pickupAddress: '123 Main St',
      pickupCity: 'New York',
      pickupState: 'NY',
      pickupZip: '10001',
      pickupPhone: '555-0100',
      pickupNotes: '',
      deliveryCompany: 'Beta Inc',
      deliveryAddress: '456 Oak Ave',
      deliveryCity: 'Boston',
      deliveryState: 'MA',
      deliveryZip: '02101',
      deliveryPhone: '555-0200',
      deliveryNotes: '',
      scheduledTimestamp: '2024-12-01T10:00:00Z',
      brokerId: 'broker-1',
      truckId: 'truck-1',
      trailerId: 'trailer-1',
      driverId: 'driver-1',
      truckOwnerId: 'owner-1',
      carrierId: 'carrier-1',
      brokerPayment: 1000,
      truckOwnerPayment: 600,
      driverPayment: 300,
      mileageOrder: 200,
      mileageEmpty: 20,
      mileageTotal: 220,
      notes: ''
    };

    const mockResponse: Trip = {
      tripId: 'trip-1',
      dispatcherId: 'dispatcher-1',
      carrierId: 'carrier-1',
      driverId: 'driver-1',
      truckId: 'truck-1',
      truckOwnerId: 'owner-1',
      trailerId: 'trailer-1',
      orderConfirmation: 'ORDER-123',
      scheduledTimestamp: '2024-12-01T10:00:00Z',
      pickupTimestamp: null,
      deliveryTimestamp: null,
      pickupCompany: 'Acme Corp',
      pickupAddress: '123 Main St',
      pickupCity: 'New York',
      pickupState: 'NY',
      pickupZip: '10001',
      pickupPhone: '555-0100',
      pickupNotes: '',
      deliveryCompany: 'Beta Inc',
      deliveryAddress: '456 Oak Ave',
      deliveryCity: 'Boston',
      deliveryState: 'MA',
      deliveryZip: '02101',
      deliveryPhone: '555-0200',
      deliveryNotes: '',
      brokerId: 'broker-1',
      brokerPayment: 1000,
      truckOwnerPayment: 600,
      driverPayment: 300,
      mileageOrder: 200,
      mileageEmpty: 20,
      mileageTotal: 220,
      brokerRate: 5.0,
      driverRate: 1.5,
      truckOwnerRate: 3.0,
      dispatcherRate: 0.5,
      factoryRate: 0,
      orderRate: 5.0,
      orderAverage: 5.0,
      dispatcherPayment: 100,
      brokerAdvance: 0,
      driverAdvance: 0,
      factoryAdvance: 0,
      fuelCost: 100,
      fuelGasAvgCost: 3.5,
      fuelGasAvgGallxMil: 0.15,
      brokerCost: 0,
      factoryCost: 0,
      lumperValue: 0,
      detentionValue: 0,
      orderExpenses: 900,
      orderRevenue: 1000,
      notes: '',
      orderStatus: TripStatus.Scheduled,
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
      brokerName: 'Test Broker',
        isActive: true,
        createdAt: '2024-11-16T10:00:00Z',
        updatedAt: '2024-11-16T10:00:00Z'
      },
      {
        brokerId: 'broker-2',
      brokerName: 'Test Broker',
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
        carrierId: 'carrier-1',
        driverId: 'driver-1',
        truckId: 'truck-1',
        truckOwnerId: 'owner-1',
        trailerId: 'trailer-1',
        orderConfirmation: 'ORDER-123',
        scheduledTimestamp: '2024-12-01T10:00:00Z',
        pickupTimestamp: null,
        deliveryTimestamp: null,
        pickupCompany: 'Acme Corp',
        pickupAddress: '123 Main St',
        pickupCity: 'New York',
        pickupState: 'NY',
        pickupZip: '10001',
        pickupPhone: '555-0100',
        pickupNotes: '',
        deliveryCompany: 'Beta Inc',
        deliveryAddress: '456 Oak Ave',
        deliveryCity: 'Boston',
        deliveryState: 'MA',
        deliveryZip: '02101',
        deliveryPhone: '555-0200',
        deliveryNotes: '',
        brokerId: 'broker-1',
        brokerPayment: 1000,
        truckOwnerPayment: 600,
        driverPayment: 300,
        mileageOrder: 200,
        mileageEmpty: 20,
        mileageTotal: 220,
        brokerRate: 5.0,
        driverRate: 1.5,
        truckOwnerRate: 3.0,
        dispatcherRate: 0.5,
        factoryRate: 0,
        orderRate: 5.0,
        orderAverage: 5.0,
        dispatcherPayment: 100,
        brokerAdvance: 0,
        driverAdvance: 0,
        factoryAdvance: 0,
        fuelCost: 100,
        fuelGasAvgCost: 3.5,
        fuelGasAvgGallxMil: 0.15,
        brokerCost: 0,
        factoryCost: 0,
        lumperValue: 0,
        detentionValue: 0,
        orderExpenses: 900,
        orderRevenue: 1000,
        notes: '',
        orderStatus: TripStatus.Scheduled,
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
      totalTruckOwnerPayments: 4000,
      profit: 3000,
      tripCount: 5,
      trips: [],
      groupedByBroker: {},
      groupedByDriver: {},
      groupedByTruck: {}
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
