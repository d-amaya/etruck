import { TestBed } from '@angular/core/testing';
import { LorryService } from './lorry.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { Lorry, RegisterLorryDto, PresignedUrlResponse, LorryVerificationStatus } from '@haulhub/shared';

describe('LorryService', () => {
  let service: LorryService;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

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

  beforeEach(() => {
    const spy = jasmine.createSpyObj('ApiService', ['get', 'post']);

    TestBed.configureTestingModule({
      providers: [
        LorryService,
        { provide: ApiService, useValue: spy }
      ]
    });

    service = TestBed.inject(LorryService);
    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getLorries', () => {
    it('should fetch all lorries for the current owner', (done) => {
      const mockLorries: Lorry[] = [mockLorry];
      apiServiceSpy.get.and.returnValue(of(mockLorries));

      service.getLorries().subscribe(lorries => {
        expect(lorries).toEqual(mockLorries);
        expect(apiServiceSpy.get).toHaveBeenCalledWith('/lorries');
        done();
      });
    });
  });

  describe('getLorryById', () => {
    it('should fetch a specific lorry by ID', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockLorry));

      service.getLorryById('ABC-123').subscribe(lorry => {
        expect(lorry).toEqual(mockLorry);
        expect(apiServiceSpy.get).toHaveBeenCalledWith('/lorries/ABC-123');
        done();
      });
    });

    it('should encode lorry ID in URL', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockLorry));

      service.getLorryById('ABC 123').subscribe(() => {
        expect(apiServiceSpy.get).toHaveBeenCalledWith('/lorries/ABC%20123');
        done();
      });
    });
  });

  describe('registerLorry', () => {
    it('should register a new lorry', (done) => {
      const registerDto: RegisterLorryDto = {
        lorryId: 'ABC-123',
        make: 'Volvo',
        model: 'FH16',
        year: 2020
      };
      apiServiceSpy.post.and.returnValue(of(mockLorry));

      service.registerLorry(registerDto).subscribe(lorry => {
        expect(lorry).toEqual(mockLorry);
        expect(apiServiceSpy.post).toHaveBeenCalledWith('/lorries', registerDto);
        done();
      });
    });
  });

  describe('requestDocumentUploadUrl', () => {
    it('should request a presigned URL for document upload', (done) => {
      const mockResponse: PresignedUrlResponse = {
        uploadUrl: 'https://s3.amazonaws.com/bucket/key?signature=xyz',
        documentId: 'doc-123',
        expiresIn: 900
      };
      const uploadDto = {
        fileName: 'registration.pdf',
        fileSize: 1024000,
        contentType: 'application/pdf'
      };
      apiServiceSpy.post.and.returnValue(of(mockResponse));

      service.requestDocumentUploadUrl('ABC-123', uploadDto).subscribe(response => {
        expect(response).toEqual(mockResponse);
        expect(apiServiceSpy.post).toHaveBeenCalledWith('/lorries/ABC-123/documents', uploadDto);
        done();
      });
    });
  });

  describe('getDocumentViewUrl', () => {
    it('should get presigned URL to view a document', (done) => {
      const mockResponse = { viewUrl: 'https://s3.amazonaws.com/bucket/key?signature=xyz' };
      apiServiceSpy.get.and.returnValue(of(mockResponse));

      service.getDocumentViewUrl('ABC-123', 'doc-123').subscribe(response => {
        expect(response).toEqual(mockResponse);
        expect(apiServiceSpy.get).toHaveBeenCalledWith('/lorries/ABC-123/documents/doc-123');
        done();
      });
    });
  });
});
