import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should make GET request with correct URL', () => {
    const mockData = { id: 1, name: 'Test' };
    
    service.get('/test').subscribe(data => {
      expect(data).toEqual(mockData);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/test`);
    expect(req.request.method).toBe('GET');
    req.flush(mockData);
  });

  it('should make POST request with body', () => {
    const mockBody = { name: 'Test' };
    const mockResponse = { id: 1, name: 'Test' };
    
    service.post('/test', mockBody).subscribe(data => {
      expect(data).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(mockBody);
    req.flush(mockResponse);
  });

  it('should make PUT request with body', () => {
    const mockBody = { id: 1, name: 'Updated' };
    
    service.put('/test/1', mockBody).subscribe(data => {
      expect(data).toEqual(mockBody);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/test/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(mockBody);
    req.flush(mockBody);
  });

  it('should make DELETE request', () => {
    service.delete('/test/1').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/test/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('should handle query parameters in GET request', () => {
    const params = { page: 1, limit: 10 };
    
    service.get('/test', params).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/test?page=1&limit=10`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
