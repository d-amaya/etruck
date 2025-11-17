import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { LorryListComponent } from './lorry-list.component';
import { LorryService } from '../../../core/services';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';

describe('LorryListComponent', () => {
  let component: LorryListComponent;
  let fixture: ComponentFixture<LorryListComponent>;
  let lorryServiceSpy: jasmine.SpyObj<LorryService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  const mockLorries: Lorry[] = [
    {
      lorryId: 'ABC-123',
      ownerId: 'owner1',
      make: 'Volvo',
      model: 'FH16',
      year: 2020,
      verificationStatus: LorryVerificationStatus.Approved,
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
      updatedAt: '2024-01-16T10:00:00Z'
    },
    {
      lorryId: 'XYZ-789',
      ownerId: 'owner1',
      make: 'Scania',
      model: 'R500',
      year: 2019,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [],
      createdAt: '2024-01-20T10:00:00Z',
      updatedAt: '2024-01-20T10:00:00Z'
    },
    {
      lorryId: 'DEF-456',
      ownerId: 'owner1',
      make: 'Mercedes',
      model: 'Actros',
      year: 2021,
      verificationStatus: LorryVerificationStatus.Rejected,
      verificationDocuments: [],
      rejectionReason: 'Document not clear',
      createdAt: '2024-01-25T10:00:00Z',
      updatedAt: '2024-01-26T10:00:00Z'
    }
  ];

  beforeEach(async () => {
    lorryServiceSpy = jasmine.createSpyObj('LorryService', ['getLorries']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        LorryListComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: LorryService, useValue: lorryServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: dialogSpy }
      ]
    })
    .overrideComponent(LorryListComponent, {
      set: {
        providers: [
          { provide: MatSnackBar, useValue: snackBarSpy },
          { provide: MatDialog, useValue: dialogSpy }
        ]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(LorryListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([]));
    expect(component).toBeTruthy();
  });

  it('should load lorries on init', () => {
    lorryServiceSpy.getLorries.and.returnValue(of(mockLorries));

    fixture.detectChanges();

    expect(lorryServiceSpy.getLorries).toHaveBeenCalled();
    expect(component.lorries).toEqual(mockLorries);
    expect(component.loading).toBeFalse();
  });

  it('should handle error when loading lorries fails', () => {
    const error = { error: { message: 'Failed to load' } };
    lorryServiceSpy.getLorries.and.returnValue(throwError(() => error));

    fixture.detectChanges();

    expect(component.loading).toBeFalse();
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Failed to load lorries. Please try again.',
      'Close',
      jasmine.any(Object)
    );
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

  it('should return correct status icon', () => {
    expect(component.getStatusIcon(LorryVerificationStatus.Approved)).toBe('check_circle');
    expect(component.getStatusIcon(LorryVerificationStatus.Pending)).toBe('schedule');
    expect(component.getStatusIcon(LorryVerificationStatus.Rejected)).toBe('cancel');
    expect(component.getStatusIcon(LorryVerificationStatus.NeedsMoreEvidence)).toBe('info');
  });

  it('should allow document upload for pending lorries', () => {
    const pendingLorry = mockLorries[1];
    expect(component.canUploadDocuments(pendingLorry)).toBeTrue();
  });

  it('should allow document upload for rejected lorries', () => {
    const rejectedLorry = mockLorries[2];
    expect(component.canUploadDocuments(rejectedLorry)).toBeTrue();
  });

  it('should not allow document upload for approved lorries', () => {
    const approvedLorry = mockLorries[0];
    expect(component.canUploadDocuments(approvedLorry)).toBeFalse();
  });

  it('should navigate to trips with lorry filter', () => {
    lorryServiceSpy.getLorries.and.returnValue(of(mockLorries));
    fixture.detectChanges();

    const lorry = mockLorries[0];
    component.onViewTrips(lorry);

    expect(routerSpy.navigate).toHaveBeenCalledWith(
      ['/lorry-owner/trips'],
      { queryParams: { lorryId: lorry.lorryId } }
    );
  });

  it('should navigate to register new lorry', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([]));
    fixture.detectChanges();

    component.onRegisterNewLorry();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/register']);
  });

  it('should navigate back to dashboard', () => {
    lorryServiceSpy.getLorries.and.returnValue(of([]));
    fixture.detectChanges();

    component.onBackToDashboard();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/dashboard']);
  });

  it('should return correct document count', () => {
    expect(component.getDocumentCount(mockLorries[0])).toBe(1);
    expect(component.getDocumentCount(mockLorries[1])).toBe(0);
  });

  it('should detect rejection reason', () => {
    expect(component.hasRejectionReason(mockLorries[2])).toBeTrue();
    expect(component.hasRejectionReason(mockLorries[0])).toBeFalse();
  });

  it('should return rejection tooltip', () => {
    expect(component.getRejectionTooltip(mockLorries[2])).toBe('Document not clear');
    expect(component.getRejectionTooltip(mockLorries[0])).toBe('');
  });
});
