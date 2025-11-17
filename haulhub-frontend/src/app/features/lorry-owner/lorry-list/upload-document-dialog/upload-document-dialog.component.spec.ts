import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { UploadDocumentDialogComponent } from './upload-document-dialog.component';
import { LorryService } from '../../../../core/services';
import { Lorry, LorryVerificationStatus } from '@haulhub/shared';

describe('UploadDocumentDialogComponent', () => {
  let component: UploadDocumentDialogComponent;
  let fixture: ComponentFixture<UploadDocumentDialogComponent>;
  let lorryServiceSpy: jasmine.SpyObj<LorryService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<UploadDocumentDialogComponent>>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockLorry: Lorry = {
    lorryId: 'ABC-123',
    ownerId: 'owner1',
    make: 'Volvo',
    model: 'FH16',
    year: 2020,
    verificationStatus: LorryVerificationStatus.Pending,
    verificationDocuments: [],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  };

  beforeEach(async () => {
    lorryServiceSpy = jasmine.createSpyObj('LorryService', [
      'requestDocumentUploadUrl',
      'uploadDocumentToS3'
    ]);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        UploadDocumentDialogComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: LorryService, useValue: lorryServiceSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: { lorry: mockLorry } },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    })
    .overrideComponent(UploadDocumentDialogComponent, {
      set: {
        providers: [
          { provide: MatSnackBar, useValue: snackBarSpy }
        ]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadDocumentDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept valid PDF file', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const event = {
      target: {
        files: [file],
        value: ''
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBe(file);
    expect(component.fileError).toBeNull();
  });

  it('should reject file exceeding size limit', () => {
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    const event = {
      target: {
        files: [largeFile],
        value: ''
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toBe('File size must not exceed 10MB');
  });

  it('should reject invalid file type', () => {
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    const event = {
      target: {
        files: [invalidFile],
        value: ''
      }
    } as any;

    component.onFileSelected(event);

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toContain('Please upload a PDF');
  });

  it('should remove selected file', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    component.selectedFile = file;

    component.removeFile();

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toBeNull();
  });

  it('should show error when uploading without file', () => {
    component.selectedFile = null;

    component.onUpload();

    expect(component.fileError).toBe('Please select a file to upload');
  });

  it('should close dialog on cancel', () => {
    component.onCancel();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });

  it('should display file size correctly', () => {
    const file = new File(['x'.repeat(1024 * 1024)], 'test.pdf', { type: 'application/pdf' });
    component.selectedFile = file;

    const sizeDisplay = component.fileSizeDisplay;

    expect(sizeDisplay).toContain('MB');
  });
});
