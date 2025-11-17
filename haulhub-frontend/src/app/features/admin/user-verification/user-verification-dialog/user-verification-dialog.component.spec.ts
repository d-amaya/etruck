import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UserVerificationDialogComponent, UserVerificationDialogData } from './user-verification-dialog.component';
import { User, UserRole, VerificationStatus } from '@haulhub/shared';

describe('UserVerificationDialogComponent', () => {
  let component: UserVerificationDialogComponent;
  let fixture: ComponentFixture<UserVerificationDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<UserVerificationDialogComponent>>;

  const mockUser: User = {
    userId: 'user-1',
    email: 'test@test.com',
    fullName: 'Test User',
    phoneNumber: '+12345678901',
    role: UserRole.Dispatcher,
    verificationStatus: VerificationStatus.Pending,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  };

  const mockDialogData: UserVerificationDialogData = {
    user: mockUser
  };

  beforeEach(async () => {
    const dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [
        UserVerificationDialogComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    }).compileComponents();

    dialogRefSpy = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<UserVerificationDialogComponent>>;

    fixture = TestBed.createComponent(UserVerificationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty values', () => {
    expect(component.verificationForm.get('decision')?.value).toBe('');
    expect(component.verificationForm.get('reason')?.value).toBe('');
  });

  it('should require decision field', () => {
    const decisionControl = component.verificationForm.get('decision');
    expect(decisionControl?.hasError('required')).toBe(true);

    decisionControl?.setValue('Verified');
    expect(decisionControl?.hasError('required')).toBe(false);
  });

  it('should require reason when decision is Rejected', () => {
    const decisionControl = component.verificationForm.get('decision');
    const reasonControl = component.verificationForm.get('reason');

    decisionControl?.setValue('Rejected');
    expect(reasonControl?.hasError('required')).toBe(true);

    reasonControl?.setValue('Invalid documents');
    expect(reasonControl?.hasError('required')).toBe(false);
  });

  it('should not require reason when decision is Verified', () => {
    const decisionControl = component.verificationForm.get('decision');
    const reasonControl = component.verificationForm.get('reason');

    decisionControl?.setValue('Verified');
    expect(reasonControl?.hasError('required')).toBe(false);
  });

  it('should return true for isReasonRequired when decision is Rejected', () => {
    component.verificationForm.get('decision')?.setValue('Rejected');
    expect(component.isReasonRequired()).toBe(true);
  });

  it('should return false for isReasonRequired when decision is Verified', () => {
    component.verificationForm.get('decision')?.setValue('Verified');
    expect(component.isReasonRequired()).toBe(false);
  });

  it('should close dialog without result on cancel', () => {
    component.onCancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith();
  });

  it('should close dialog with result on valid submit', () => {
    component.verificationForm.patchValue({
      decision: 'Verified'
    });

    component.onSubmit();

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      decision: 'Verified',
      reason: undefined
    });
  });

  it('should include reason in result when provided', () => {
    component.verificationForm.patchValue({
      decision: 'Rejected',
      reason: 'Invalid documents'
    });

    component.onSubmit();

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      decision: 'Rejected',
      reason: 'Invalid documents'
    });
  });

  it('should not submit when form is invalid', () => {
    component.verificationForm.patchValue({
      decision: 'Rejected',
      reason: '' // Required but empty
    });

    component.onSubmit();

    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });
});
