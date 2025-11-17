import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { LorryVerificationComponent } from './lorry-verification.component';
import { AdminService } from '../../../core/services/admin.service';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';

describe('LorryVerificationComponent', () => {
  let component: LorryVerificationComponent;
  let fixture: ComponentFixture<LorryVerificationComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockLorries: Lorry[] = [
    {
      lorryId: 'ABC-123',
      ownerId: 'owner1',
      make: 'Volvo',
      model: 'FH16',
      year: 2020,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [
        {
          documentId: 'doc1',
          fileName: 'registration.pdf',
          fileSize: 1024000,
          contentType: 'application/pdf',
          uploadedAt: '2024-01-15T10:00:00Z'
        }
      ],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z'
    }
  ];

  beforeEach(async () => {
    adminServiceSpy = jasmine.createSpyObj('AdminService', ['getPendingLorries', 'verifyLorry']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        LorryVerificationComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AdminService, useValue: adminServiceSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    })
    .overrideComponent(LorryVerificationComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialogSpy },
          { provide: MatSnackBar, useValue: snackBarSpy }
        ]
      }
    })
    .compileComponents();

    adminServiceSpy.getPendingLorries.and.returnValue(of(mockLorries));
    fixture = TestBed.createComponent(LorryVerificationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load pending lorries on init', () => {
    fixture.detectChanges();

    expect(adminServiceSpy.getPendingLorries).toHaveBeenCalled();
    expect(component.lorries).toEqual(mockLorries);
    expect(component.loading).toBe(false);
  });

  it('should handle error when loading lorries fails', () => {
    adminServiceSpy.getPendingLorries.and.returnValue(throwError(() => new Error('API Error')));

    fixture.detectChanges();

    expect(component.error).toBe('Failed to load pending lorries. Please try again.');
    expect(component.loading).toBe(false);
    expect(snackBarSpy.open).toHaveBeenCalledWith('Failed to load pending lorries', 'Close', { duration: 3000 });
  });

  it('should return correct status color', () => {
    expect(component.getStatusColor(LorryVerificationStatus.Pending)).toBe('accent');
    expect(component.getStatusColor(LorryVerificationStatus.NeedsMoreEvidence)).toBe('warn');
    expect(component.getStatusColor(LorryVerificationStatus.Approved)).toBe('primary');
  });

  it('should open document viewer dialog', () => {
    component.viewDocuments(mockLorries[0]);

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('should open verification dialog and verify lorry on result', () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of({ decision: 'Approved' }));
    dialogSpy.open.and.returnValue(dialogRefSpy);
    adminServiceSpy.verifyLorry.and.returnValue(of(mockLorries[0]));

    component.openVerificationDialog(mockLorries[0]);

    expect(dialogSpy.open).toHaveBeenCalled();
    expect(adminServiceSpy.verifyLorry).toHaveBeenCalledWith('ABC-123', 'Approved', undefined);
  });

  it('should handle verification error', () => {
    adminServiceSpy.verifyLorry.and.returnValue(throwError(() => new Error('API Error')));

    component.verifyLorry('ABC-123', 'Approved');

    expect(snackBarSpy.open).toHaveBeenCalledWith('Failed to verify lorry. Please try again.', 'Close', { duration: 3000 });
  });
});
