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
    scheduledPickupDatetime: '2024-01-15T10:00:00Z',
    pickupLocation: 'New York, NY',
    dropoffLocation: 'Boston, MA',
    brokerId: 'broker-1',
    brokerName: 'Test Broker',
    brokerPayment: 1000,
    lorryId: 'ABC123',
    lorryOwnerPayment: 400,
    driverId: 'driver-1',
    driverName: 'John Doe',
    driverPayment: 300,
    status: TripStatus.Scheduled,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z'
  };

  const mockSummaryByStatus: Record<TripStatus, number> = {
    [TripStatus.Scheduled]: 5,
    [TripStatus.PickedUp]: 3,
    [TripStatus.InTransit]: 7,
    [TripStatus.Delivered]: 10,
    [TripStatus.Paid]: 15
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
    lorryId: null,
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

    tripSpy.getTrips.and.returnValue(of([mockTrip]));
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
    expect(profit).toBe(300); // 1000 - 400 - 300
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

  it('should build filter text with lorry', () => {
    const filtersWithLorry = {
      ...mockFilters,
      lorryId: 'ABC123'
    };

    const filterText = (service as any).buildFilterText(filtersWithLorry);
    expect(filterText).toContain('Lorry: ABC123');
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
      lorryId: 'ABC123',
      driverId: null,
      driverName: 'John Doe'
    };

    const apiFilters = (service as any).buildApiFilters(filtersWithData);

    expect(apiFilters.startDate).toBe('2024-01-01T00:00:00.000Z');
    expect(apiFilters.endDate).toBe('2024-01-31T00:00:00.000Z');
    expect(apiFilters.status).toBe(TripStatus.Scheduled);
    expect(apiFilters.brokerId).toBe('broker-1');
    expect(apiFilters.lorryId).toBe('ABC123');
    expect(apiFilters.driverName).toBe('John Doe');
    expect(apiFilters.driverId).toBeUndefined();
  });
});