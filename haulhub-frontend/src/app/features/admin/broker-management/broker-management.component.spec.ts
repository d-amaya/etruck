import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { BrokerManagementComponent } from './broker-management.component';
import { AdminService } from '../../../core/services/admin.service';
import { Broker } from '@haulhub/shared';

describe('BrokerManagementComponent', () => {
  let component: BrokerManagementComponent;
  let fixture: ComponentFixture<BrokerManagementComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockBrokers: Broker[] = [
    {
      brokerId: 'broker-1',
      brokerName: 'ABC Logistics',
      isActive: true,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z'
    },
    {
      brokerId: 'broker-2',
      brokerName: 'XYZ Transport',
      isActive: false,
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z'
    }
  ];

  beforeEach(async () => {
    const adminService = jasmine.createSpyObj('AdminService', [
      'getAllBrokers',
      'createBroker',
      'updateBroker',
      'deleteBroker'
    ]);
    const dialog = jasmine.createSpyObj('MatDialog', ['open']);
    const snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        BrokerManagementComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    })
    .overrideComponent(BrokerManagementComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          { provide: MatSnackBar, useValue: snackBar }
        ]
      }
    })
    .compileComponents();

    adminServiceSpy = TestBed.inject(AdminService) as jasmine.SpyObj<AdminService>;
    dialogSpy = TestBed.inject(MatDialog) as jasmine.SpyObj<MatDialog>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;

    fixture = TestBed.createComponent(BrokerManagementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of([]));
    expect(component).toBeTruthy();
  });

  it('should load brokers on init', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));

    fixture.detectChanges();

    expect(adminServiceSpy.getAllBrokers).toHaveBeenCalledWith(false);
    expect(component.brokers).toEqual(mockBrokers);
    expect(component.loading).toBe(false);
  });

  it('should set error state when loading brokers fails', () => {
    const error = new Error('Failed to load');
    adminServiceSpy.getAllBrokers.and.returnValue(throwError(() => error));

    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.error).toBe('Failed to load brokers. Please try again.');
  });

  it('should return correct status color', () => {
    expect(component.getStatusColor(true)).toBe('primary');
    expect(component.getStatusColor(false)).toBe('warn');
  });

  it('should return correct status label', () => {
    expect(component.getStatusLabel(true)).toBe('Active');
    expect(component.getStatusLabel(false)).toBe('Inactive');
  });

  it('should open add broker dialog', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));

    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    fixture.detectChanges();

    component.openAddBrokerDialog();

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('should open edit broker dialog', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));

    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    fixture.detectChanges();

    component.openEditBrokerDialog(mockBrokers[0]);

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('should open delete confirm dialog', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));

    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(false));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    fixture.detectChanges();

    component.openDeleteConfirmDialog(mockBrokers[0]);

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('should call createBroker with correct parameters', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));
    adminServiceSpy.createBroker.and.returnValue(of(mockBrokers[0]));

    fixture.detectChanges();

    component.createBroker('New Broker');

    expect(adminServiceSpy.createBroker).toHaveBeenCalledWith('New Broker');
  });

  it('should call updateBroker with correct parameters', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));
    adminServiceSpy.updateBroker.and.returnValue(of(mockBrokers[0]));

    fixture.detectChanges();

    component.updateBroker('broker-1', 'Updated Name', true);

    expect(adminServiceSpy.updateBroker).toHaveBeenCalledWith('broker-1', 'Updated Name', true);
  });

  it('should call deleteBroker with correct parameters', () => {
    adminServiceSpy.getAllBrokers.and.returnValue(of(mockBrokers));
    adminServiceSpy.deleteBroker.and.returnValue(of(undefined));

    fixture.detectChanges();

    component.deleteBroker('broker-1');

    expect(adminServiceSpy.deleteBroker).toHaveBeenCalledWith('broker-1');
  });

  it('should format date correctly', () => {
    const dateString = '2024-01-15T10:00:00Z';
    const formatted = component.formatDate(dateString);
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });
});
