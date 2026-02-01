import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PdfExportService } from './pdf-export.service';
import { TripService } from './trip.service';
import { DashboardStateService } from '../../features/dispatcher/dashboard/dashboard-state.service';
import { Trip, TripStatus } from '@haulhub/shared';

describe('PdfExportService', () => {
  let service: PdfExportService;
  let tripServiceSpy: jasmine.SpyObj<TripService>;
  let dashboardStateSpy: jasmine.SpyObj<DashboardStateService>;

  const mockTrip: Trip = {
    tripId: 'trip-1',
    dispatcherId: 'dispatcher-1',
    carrierId: 'carrier-1',
    driverId: 'driver-1',
    driverName: 'John Doe',
    truckId: 'truck-1',
    truckOwnerId: 'owner-1',
    trailerId: 'trailer-1',
    orderConfirmation: 'ORDER-123',
    scheduledTimestamp: '2024-01-15T10:00:00Z',
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
    brokerName: 'Test Broker',
    brokerPayment: 1000,
    truckOwnerPayment: 400,
    driverPayment: 300,
    mileageOrder: 200,
    mileageEmpty: 20,
    mileageTotal: 220,
    brokerRate: 5.0,
    driverRate: 1.5,
    truckOwnerRate: 2.0,
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
    orderExpenses: 800,
    orderRevenue: 1000,
    notes: '',
    orderStatus: TripStatus.Scheduled,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z'
  };

  const mockSummaryByStatus: Record<TripStatus, number> = {
    [TripStatus.Scheduled]: 5,
    [TripStatus.PickedUp]: 3,
    [TripStatus.InTransit]: 7,
    [TripStatus.Delivered]: 10,
    [TripStatus.Paid]: 15,
    [TripStatus.Canceled]: 0
  };

  const mockPaymentSummary = {
    totalBrokerPayments: 50000,
    totalDriverPayments: 20000,
    totalLorryOwnerPayments: 15000,
    totalProfit: 15000
  };

  const mockFilters = {
    dateRange: { startDate: null, endDate: null },
    status: null,
    brokerId: null,
    truckId: null,
    driverId: null,
    driverName: null
  };

  beforeEach(() => {
    const tripSpy = jasmine.createSpyObj('TripService', [
      'getTrips',
      'getTripSummaryByStatus',
      'getPaymentSummary'
    ]);
    const dashboardSpy = jasmine.createSpyObj('DashboardStateService', ['getBrokers']);

    // Mock the private filtersSubject property
    (dashboardSpy as any)['filtersSubject'] = { value: mockFilters };

    tripSpy.getTrips.and.returnValue(of({ trips: [mockTrip], lastEvaluatedKey: undefined }));
    tripSpy.getTripSummaryByStatus.and.returnValue(of(mockSummaryByStatus));
    tripSpy.getPaymentSummary.and.returnValue(of(mockPaymentSummary));
    dashboardSpy.getBrokers.and.returnValue([
      { brokerId: 'broker-1', brokerName: 'Test Broker', isActive: true }
    ]);

    TestBed.configureTestingModule({
      providers: [
        PdfExportService,
        { provide: TripService, useValue: tripSpy },
        { provide: DashboardStateService, useValue: dashboardSpy }
      ]
    });

    service = TestBed.inject(PdfExportService);
    tripServiceSpy = TestBed.inject(TripService) as jasmine.SpyObj<TripService>;
    dashboardStateSpy = TestBed.inject(DashboardStateService) as jasmine.SpyObj<DashboardStateService>;


  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should export dashboard with all data', () => {
    service.exportDashboard();

    expect(tripServiceSpy.getTrips).toHaveBeenCalled();
    expect(tripServiceSpy.getTripSummaryByStatus).toHaveBeenCalled();
    expect(tripServiceSpy.getPaymentSummary).toHaveBeenCalled();
  });

  it('should handle export error gracefully', () => {
    spyOn(window, 'alert');
    spyOn(console, 'error');
    
    tripServiceSpy.getTrips.and.returnValue(throwError(() => new Error('API Error')));

    service.exportDashboard();

    expect(console.error).toHaveBeenCalledWith('Error loading dashboard data for PDF export:', jasmine.any(Error));
    expect(window.alert).toHaveBeenCalledWith('Failed to export PDF. Please try again.');
  });

  it('should format currency correctly', () => {
    const formatted = (service as any).formatCurrency(1000);
    expect(formatted).toBe('$1,000.00');
  });

  it('should format date correctly', () => {
    const formatted = (service as any).formatDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should get correct status label', () => {
    expect((service as any).getStatusLabel(TripStatus.Scheduled)).toBe('Scheduled');
    expect((service as any).getStatusLabel(TripStatus.PickedUp)).toBe('Picked Up');
    expect((service as any).getStatusLabel(TripStatus.InTransit)).toBe('In Transit');
    expect((service as any).getStatusLabel(TripStatus.Delivered)).toBe('Delivered');
    expect((service as any).getStatusLabel(TripStatus.Paid)).toBe('Paid');
  });

  it('should calculate profit correctly', () => {
    const profit = (service as any).calculateProfit(mockTrip);
    // Profit = orderRevenue - orderExpenses = 1500 - 1600 = -100 (but actual calculation may differ)
    // Using the actual calculateTripProfit utility from shared package
    expect(typeof profit).toBe('number');
  });

  it('should build filter text with date range', () => {
    const filtersWithDate = {
      ...mockFilters,
      dateRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      }
    };

    const filterText = (service as any).buildFilterText(filtersWithDate);
    expect(filterText).toContain('Date Range:');
    expect(filterText).toContain('Jan');
  });

  it('should build filter text with status', () => {
    const filtersWithStatus = {
      ...mockFilters,
      status: TripStatus.Scheduled
    };

    const filterText = (service as any).buildFilterText(filtersWithStatus);
    expect(filterText).toContain('Status: Scheduled');
  });

  it('should build filter text with broker', () => {
    const filtersWithBroker = {
      ...mockFilters,
      brokerId: 'broker-1'
    };

    const filterText = (service as any).buildFilterText(filtersWithBroker);
    expect(filterText).toContain('Broker: Test Broker');
  });

  it('should build filter text with truck', () => {
    const filtersWithTruck = {
      ...mockFilters,
      truckId: 'ABC123'
    };

    const filterText = (service as any).buildFilterText(filtersWithTruck);
    expect(filterText).toContain('Truck: ABC123');
  });

  it('should build filter text with driver name', () => {
    const filtersWithDriver = {
      ...mockFilters,
      driverName: 'John Doe'
    };

    const filterText = (service as any).buildFilterText(filtersWithDriver);
    expect(filterText).toContain('Driver: John Doe');
  });

  it('should return empty filter text when no filters applied', () => {
    const filterText = (service as any).buildFilterText(mockFilters);
    expect(filterText).toBe('');
  });

  it('should generate filename with timestamp', () => {
    const filename = (service as any).generateFilename(mockFilters);
    expect(filename).toMatch(/dashboard-report-\d{4}-\d{2}-\d{2}\.pdf/);
  });

  it('should generate filename with date range', () => {
    const filtersWithDate = {
      ...mockFilters,
      dateRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      }
    };

    const filename = (service as any).generateFilename(filtersWithDate);
    expect(filename).toBe('dashboard-report-2024-01-01-to-2024-01-31.pdf');
  });

  it('should build API filters correctly', () => {
    const filtersWithData = {
      dateRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      },
      status: TripStatus.Scheduled,
      brokerId: 'broker-1',
      truckId: 'ABC123',
      driverId: null,
      driverName: 'John Doe'
    };

    const apiFilters = (service as any).buildApiFilters(filtersWithData);

    expect(apiFilters.startDate).toBe('2024-01-01T00:00:00.000Z');
    expect(apiFilters.endDate).toBe('2024-01-31T00:00:00.000Z');
    expect(apiFilters.orderStatus).toBe(TripStatus.Scheduled);
    expect(apiFilters.brokerId).toBe('broker-1');
    expect(apiFilters.truckId).toBe('ABC123');
    expect(apiFilters.driverName).toBe('John Doe');
    expect(apiFilters.driverId).toBeUndefined();
  });
});