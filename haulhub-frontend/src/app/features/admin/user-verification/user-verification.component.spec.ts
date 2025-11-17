import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { UserVerificationComponent } from './user-verification.component';
import { AdminService } from '../../../core/services/admin.service';
import { User, UserRole, VerificationStatus } from '@haulhub/shared';

describe('UserVerificationComponent', () => {
  let component: UserVerificationComponent;
  let fixture: ComponentFixture<UserVerificationComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockUsers: User[] = [
    {
      userId: 'user-1',
      email: 'dispatcher@test.com',
      fullName: 'John Dispatcher',
      phoneNumber: '+12345678901',
      role: UserRole.Dispatcher,
      verificationStatus: VerificationStatus.Pending,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z'
    },
    {
      userId: 'user-2',
      email: 'driver@test.com',
      fullName: 'Jane Driver',
      phoneNumber: '+12345678902',
      role: UserRole.Driver,
      verificationStatus: VerificationStatus.Pending,
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z'
    }
  ];

  beforeEach(async () => {
    const adminService = jasmine.createSpyObj('AdminService', ['getPendingUsers', 'verifyUser']);
    const dialog = jasmine.createSpyObj('MatDialog', ['open']);
    const snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        UserVerificationComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    })
    .overrideComponent(UserVerificationComponent, {
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

    fixture = TestBed.createComponent(UserVerificationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    adminServiceSpy.getPendingUsers.and.returnValue(of([]));
    expect(component).toBeTruthy();
  });

  it('should load pending users on init', () => {
    adminServiceSpy.getPendingUsers.and.returnValue(of(mockUsers));

    fixture.detectChanges();

    expect(adminServiceSpy.getPendingUsers).toHaveBeenCalled();
    expect(component.users).toEqual(mockUsers);
    expect(component.loading).toBe(false);
  });

  it('should set error state when loading users fails', () => {
    const error = new Error('Failed to load');
    adminServiceSpy.getPendingUsers.and.returnValue(throwError(() => error));

    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.error).toBe('Failed to load pending users. Please try again.');
  });

  it('should return correct status color', () => {
    expect(component.getStatusColor(VerificationStatus.Pending)).toBe('accent');
    expect(component.getStatusColor(VerificationStatus.Rejected)).toBe('warn');
    expect(component.getStatusColor(VerificationStatus.Verified)).toBe('primary');
  });

  it('should return correct role label', () => {
    expect(component.getRoleLabel(UserRole.Dispatcher)).toBe('Dispatcher');
    expect(component.getRoleLabel(UserRole.LorryOwner)).toBe('Lorry Owner');
    expect(component.getRoleLabel(UserRole.Driver)).toBe('Driver');
    expect(component.getRoleLabel(UserRole.Admin)).toBe('Admin');
  });

  it('should open verification dialog', () => {
    adminServiceSpy.getPendingUsers.and.returnValue(of(mockUsers));

    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    fixture.detectChanges();

    component.openVerificationDialog(mockUsers[0]);

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('should call verifyUser with correct parameters', () => {
    adminServiceSpy.getPendingUsers.and.returnValue(of(mockUsers));
    adminServiceSpy.verifyUser.and.returnValue(of(mockUsers[0]));

    fixture.detectChanges();

    component.verifyUser('user-1', 'Verified');

    expect(adminServiceSpy.verifyUser).toHaveBeenCalledWith('user-1', 'Verified', undefined);
  });

  it('should format date correctly', () => {
    const dateString = '2024-01-15T10:00:00Z';
    const formatted = component.formatDate(dateString);
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });
});
