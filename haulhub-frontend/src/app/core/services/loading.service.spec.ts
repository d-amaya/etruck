import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoadingService]
    });
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with loading false', (done) => {
    service.loading$.subscribe(loading => {
      expect(loading).toBe(false);
      done();
    });
  });

  it('should show loading when show() is called', (done) => {
    service.show();

    service.loading$.subscribe(loading => {
      expect(loading).toBe(true);
      done();
    });
  });

  it('should hide loading when hide() is called', (done) => {
    service.show();
    service.hide();

    service.loading$.subscribe(loading => {
      expect(loading).toBe(false);
      done();
    });
  });

  it('should handle multiple concurrent requests', () => {
    service.show();
    service.show();
    service.show();

    expect(service.isLoading()).toBe(true);

    service.hide();
    expect(service.isLoading()).toBe(true);

    service.hide();
    expect(service.isLoading()).toBe(true);

    service.hide();
    expect(service.isLoading()).toBe(false);
  });

  it('should reset loading state', (done) => {
    service.show();
    service.show();
    service.reset();

    service.loading$.subscribe(loading => {
      expect(loading).toBe(false);
      done();
    });
  });

  it('should return current loading state', () => {
    expect(service.isLoading()).toBe(false);
    
    service.show();
    expect(service.isLoading()).toBe(true);
    
    service.hide();
    expect(service.isLoading()).toBe(false);
  });
});
