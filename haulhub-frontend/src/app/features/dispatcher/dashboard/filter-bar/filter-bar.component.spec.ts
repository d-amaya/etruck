import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { FilterBarComponent } from './filter-bar.component';
import { DashboardStateService } from '../dashboard-state.service';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import { TripStatus } from '@haulhub/shared';

describe('FilterBarComponent', () => {
  let component: FilterBarComponent;
  let fixture: ComponentFixture<FilterBarComponent>;
  let dashboardStateService: jasmine.SpyObj<DashboardStateService>;

  beforeEach(async () => {
    const dashboardStateSpy = jasmine.createSpyObj('DashboardStateService', [
      'updateFilters',
      'clearFilters',
      'getBrokers',
      'getActiveFilterCount',
      'completeLoad',
      'getCurrentFilters'
    ], {
      filters$: of({
        dateRange: { startDate: null, endDate: null },
        status: null,
        brokerId: null,
        lorryId: null,
        driverId: null,
        driverName: null
      })
    });

    const pdfExportSpy = jasmine.createSpyObj('PdfExportService', ['exportToPdf', 'exportDashboard']);
    const accessibilitySpy = jasmine.createSpyObj('AccessibilityService', ['getStatusAriaLabel']);

    dashboardStateSpy.getBrokers.and.returnValue([
      { brokerId: '1', brokerName: 'Broker 1', isActive: true },
      { brokerId: '2', brokerName: 'Broker 2', isActive: true }
    ]);
    dashboardStateSpy.getActiveFilterCount.and.returnValue(0);
    dashboardStateSpy.getCurrentFilters.and.returnValue({
      dateRange: { startDate: null, endDate: null },
      status: null,
      brokerId: null,
      lorryId: null,
      driverId: null,
      driverName: null
    });

    await TestBed.configureTestingModule({
      imports: [
        FilterBarComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
        HttpClientTestingModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule
      ],
      providers: [
        { provide: DashboardStateService, useValue: dashboardStateSpy },
        { provide: PdfExportService, useValue: pdfExportSpy },
        { provide: AccessibilityService, useValue: accessibilitySpy }
      ]
    }).compileComponents();

    dashboardStateService = TestBed.inject(DashboardStateService) as jasmine.SpyObj<DashboardStateService>;
    fixture = TestBed.createComponent(FilterBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with null values', () => {
    expect(component.filterForm.value).toEqual({
      startDate: null,
      endDate: null,
      status: null,
      brokerId: null,
      lorryId: '',
      driverName: ''
    });
  });

  it('should load brokers on init', () => {
    expect(component.brokers.length).toBe(2);
    expect(component.brokers[0].brokerName).toBe('Broker 1');
  });

  it('should set min date to 5 years ago', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    
    expect(component.minDate.getFullYear()).toBe(fiveYearsAgo.getFullYear());
  });

  it('should update dashboard state when form changes with debounce', fakeAsync(() => {
    dashboardStateService.completeLoad = jasmine.createSpy('completeLoad');
    
    component.filterForm.patchValue({
      status: TripStatus.Scheduled,
      lorryId: 'ABC123'
    });

    tick(300); // Wait for debounce
    tick(500); // Wait for completeLoad setTimeout

    expect(dashboardStateService.updateFilters).toHaveBeenCalledWith(
      jasmine.objectContaining({
        status: TripStatus.Scheduled,
        lorryId: 'ABC123'
      })
    );
    expect(dashboardStateService.completeLoad).toHaveBeenCalled();
  }));

  it('should set date preset for today', () => {
    const today = new Date();
    component.setDatePreset('today');

    const formValue = component.filterForm.value;
    expect(formValue.startDate).toBeTruthy();
    expect(formValue.endDate).toBeTruthy();
  });

  it('should set date preset for this week', () => {
    component.setDatePreset('week');

    const formValue = component.filterForm.value;
    expect(formValue.startDate).toBeTruthy();
    expect(formValue.endDate).toBeTruthy();
  });

  it('should set date preset for this month', () => {
    component.setDatePreset('month');

    const formValue = component.filterForm.value;
    expect(formValue.startDate).toBeTruthy();
    expect(formValue.endDate).toBeTruthy();
  });

  it('should set date preset for last month', () => {
    component.setDatePreset('lastMonth');

    const formValue = component.filterForm.value;
    expect(formValue.startDate).toBeTruthy();
    expect(formValue.endDate).toBeTruthy();
  });

  it('should set date preset for this year', () => {
    component.setDatePreset('year');

    const formValue = component.filterForm.value;
    expect(formValue.startDate).toBeTruthy();
    expect(formValue.endDate).toBeTruthy();
  });

  it('should clear filters when clearFilters is called', () => {
    component.filterForm.patchValue({
      status: TripStatus.Delivered,
      lorryId: 'XYZ789'
    });

    component.clearFilters();

    expect(component.filterForm.value).toEqual({
      startDate: null,
      endDate: null,
      status: null,
      brokerId: null,
      lorryId: '',
      driverName: ''
    });
    expect(dashboardStateService.clearFilters).toHaveBeenCalled();
  });

  it('should format status label correctly', () => {
    expect(component.getStatusLabel(TripStatus.PickedUp)).toBe('Picked Up');
    expect(component.getStatusLabel(TripStatus.InTransit)).toBe('In Transit');
    expect(component.getStatusLabel(TripStatus.Scheduled)).toBe('Scheduled');
  });

  it('should have all status options', () => {
    expect(component.statusOptions).toEqual([
      TripStatus.Scheduled,
      TripStatus.PickedUp,
      TripStatus.InTransit,
      TripStatus.Delivered,
      TripStatus.Paid
    ]);
  });

  it('should trim whitespace from text inputs', fakeAsync(() => {
    dashboardStateService.completeLoad = jasmine.createSpy('completeLoad');
    
    component.filterForm.patchValue({
      lorryId: '  ABC123  ',
      driverName: '  John Doe  '
    });

    tick(300); // Wait for debounce
    tick(500); // Wait for completeLoad setTimeout

    expect(dashboardStateService.updateFilters).toHaveBeenCalledWith(
      jasmine.objectContaining({
        lorryId: 'ABC123',
        driverName: 'John Doe'
      })
    );
    expect(dashboardStateService.completeLoad).toHaveBeenCalled();
  }));

  it('should call pdfExportService.exportDashboard when exportPDF is called', () => {
    const pdfExportSpy = TestBed.inject(PdfExportService) as jasmine.SpyObj<PdfExportService>;
    component.exportPDF();
    expect(pdfExportSpy.exportDashboard).toHaveBeenCalled();
  });
});
