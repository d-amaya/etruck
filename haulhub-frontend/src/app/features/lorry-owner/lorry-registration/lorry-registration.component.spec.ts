import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { LorryRegistrationComponent } from './lorry-registration.component';
import { LorryService } from '../../../core/services';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LorryRegistrationComponent', () => {
  let component: LorryRegistrationComponent;
  let fixture: ComponentFixture<LorryRegistrationComponent>;
  let lorryServiceSpy: jasmine.SpyObj<LorryService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockLorry: Lorry = {
    lorryId: 'ABC-123',
    ownerId: 'owner-1',
    make: 'Volvo',
    model: 'FH16',
    year: 2020,
    verificationStatus: LorryVerificationStatus.Pending,
    verificationDocuments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    const lorryService = jasmine.createSpyObj('LorryService', [
      'registerLorry',
      'requestDocumentUploadUrl',
      'uploadDocumentToS3'
    ]);
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        LorryRegistrationComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: LorryService, useValue: lorryService },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    })
    .overrideComponent(LorryRegistrationComponent, {
      set: {
        providers: [
          { provide: MatSnackBar, useValue: snackBar }
        ]
      }
    })
    .compileComponents();

    lorryServiceSpy = TestBed.inject(LorryService) as jasmine.SpyObj<LorryService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;

    fixture = TestBed.createComponent(LorryRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty values', () => {
    expect(component.lorryForm.get('lorryId')?.value).toBe('');
    expect(component.lorryForm.get('make')?.value).toBe('');
    expect(component.lorryForm.get('model')?.value).toBe('');
    expect(component.lorryForm.get('year')?.value).toBe('');
  });

  it('should validate required fields', () => {
    const form = component.lorryForm;
    expect(form.valid).toBeFalsy();

    form.patchValue({
      lorryId: 'ABC-123',
      make: 'Volvo',
      model: 'FH16',
      year: 2020
    });

    expect(form.valid).toBeTruthy();
  });

  it('should validate license plate format', () => {
    const lorryIdControl = component.lorryForm.get('lorryId');
    
    lorryIdControl?.setValue('ABC-123');
    expect(lorryIdControl?.valid).toBeTruthy();

    lorryIdControl?.setValue('A');
    expect(lorryIdControl?.hasError('minlength')).toBeTruthy();

    lorryIdControl?.setValue('ABC@123');
    expect(lorryIdControl?.hasError('pattern')).toBeTruthy();
  });

  it('should validate year range', () => {
    const yearControl = component.lorryForm.get('year');
    const currentYear = new Date().getFullYear();
    
    yearControl?.setValue(1899);
    expect(yearControl?.hasError('min')).toBeTruthy();

    yearControl?.setValue(currentYear + 2);
    expect(yearControl?.hasError('max')).toBeTruthy();

    yearControl?.setValue(2020);
    expect(yearControl?.valid).toBeTruthy();
  });

  it('should handle file selection', () => {
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    const event = {
      target: {
        files: [file]
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBe(file);
    expect(component.fileError).toBeNull();
  });

  it('should reject files larger than 10MB', () => {
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    const event = {
      target: {
        files: [largeFile],
        value: 'large.pdf'
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toBe('File size must not exceed 10MB');
    expect(event.target.value).toBe('');
  });

  it('should reject invalid file types', () => {
    const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
    const event = {
      target: {
        files: [invalidFile],
        value: 'test.exe'
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toContain('Please upload a PDF');
    expect(event.target.value).toBe('');
  });

  it('should remove selected file', () => {
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    component.selectedFile = file;

    component.removeFile();

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toBeNull();
  });

  it('should not submit if form is invalid', () => {
    expect(component.lorryForm.valid).toBeFalsy();
    
    component.onSubmit();

    expect(lorryServiceSpy.registerLorry).not.toHaveBeenCalled();
    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('should not submit if no file is selected', () => {
    component.lorryForm.patchValue({
      lorryId: 'ABC-123',
      make: 'Volvo',
      model: 'FH16',
      year: 2020
    });

    expect(component.lorryForm.valid).toBeTruthy();
    expect(component.selectedFile).toBeNull();

    component.onSubmit();

    expect(lorryServiceSpy.registerLorry).not.toHaveBeenCalled();
    expect(snackBarSpy.open).toHaveBeenCalled();
    expect(component.fileError).toBe('Please upload a verification document');
  });



  it('should navigate to dashboard on cancel', () => {
    component.onCancel();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lorry-owner/dashboard']);
  });

  it('should display file size correctly', () => {
    const file = new File(['x'.repeat(1024 * 1024)], 'test.pdf', { type: 'application/pdf' });
    component.selectedFile = file;

    const sizeDisplay = component.fileSizeDisplay;

    expect(sizeDisplay).toContain('MB');
  });
});
