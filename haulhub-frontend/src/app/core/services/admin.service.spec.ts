import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminService } from './admin.service';
import { ApiService } from './api.service';
import { Lorry, User, Broker, LorryVerificationStatus, VerificationStatus, UserRole } from '@haulhub/shared';

describe('AdminService', () => {
  let service: AdminService;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

  const mockLorries: Lorry[] = [
    {
      lorryId: 'ABC-123',
      ownerId: 'owner1',
      make: 'Volvo',
      model: 'FH16',
      year: 2020,
      verificationStatus: LorryVerificationStatus.Pending,
      verificationDocuments: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ];

  const mockUsers: User[] = [
    {
      userId: 'user1',
      email: 'test@example.com',
      fullName: 'Test User',
      phoneNumber: '1234567890',
      role: UserRole.Dispatcher,
      verificationStatus: VerificationStatus.Pending,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ];

  const mockBrokers: Broker[] = [
    {
      brokerId: 'broker1',
      brokerName: 'Test Broker',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get']);

    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: ApiService, useValue: apiSpy }
      ]
    });

    service = TestBed.inject(AdminService);
    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPendingLorries', () => {
    it('should call API with correct endpoint', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockLorries));

      service.getPendingLorries().subscribe({
        next: (lorries) => {
          expect(apiServiceSpy.get).toHaveBeenCalledWith('/admin/lorries/pending');
          expect(lorries).toEqual(mockLorries);
          done();
        }
      });
    });

    it('should return array of lorries', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockLorries));

      service.getPendingLorries().subscribe({
        next: (lorries) => {
          expect(Array.isArray(lorries)).toBe(true);
          expect(lorries.length).toBe(1);
          expect(lorries[0].lorryId).toBe('ABC-123');
          done();
        }
      });
    });
  });

  describe('getPendingUsers', () => {
    it('should call API with correct endpoint', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockUsers));

      service.getPendingUsers().subscribe({
        next: (users) => {
          expect(apiServiceSpy.get).toHaveBeenCalledWith('/admin/users/pending');
          expect(users).toEqual(mockUsers);
          done();
        }
      });
    });

    it('should return array of users', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockUsers));

      service.getPendingUsers().subscribe({
        next: (users) => {
          expect(Array.isArray(users)).toBe(true);
          expect(users.length).toBe(1);
          expect(users[0].userId).toBe('user1');
          done();
        }
      });
    });
  });

  describe('getAllBrokers', () => {
    it('should call API with correct endpoint without params', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockBrokers));

      service.getAllBrokers(false).subscribe({
        next: (brokers) => {
          expect(apiServiceSpy.get).toHaveBeenCalledWith('/brokers', {});
          expect(brokers).toEqual(mockBrokers);
          done();
        }
      });
    });

    it('should call API with activeOnly param when true', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockBrokers));

      service.getAllBrokers(true).subscribe({
        next: (brokers) => {
          expect(apiServiceSpy.get).toHaveBeenCalledWith('/brokers', { activeOnly: 'true' });
          expect(brokers).toEqual(mockBrokers);
          done();
        }
      });
    });

    it('should return array of brokers', (done) => {
      apiServiceSpy.get.and.returnValue(of(mockBrokers));

      service.getAllBrokers().subscribe({
        next: (brokers) => {
          expect(Array.isArray(brokers)).toBe(true);
          expect(brokers.length).toBe(1);
          expect(brokers[0].brokerId).toBe('broker1');
          done();
        }
      });
    });
  });

  describe('getDashboardSummary', () => {
    it('should aggregate data from multiple endpoints', (done) => {
      apiServiceSpy.get.and.returnValues(
        of(mockUsers),
        of(mockLorries)
      );

      service.getDashboardSummary().subscribe({
        next: (summary) => {
          expect(summary.pendingUserCount).toBe(1);
          expect(summary.pendingLorryCount).toBe(1);
          expect(apiServiceSpy.get).toHaveBeenCalledTimes(2);
          done();
        }
      });
    });

    it('should return zero counts when no pending items', (done) => {
      apiServiceSpy.get.and.returnValues(
        of([]),
        of([])
      );

      service.getDashboardSummary().subscribe({
        next: (summary) => {
          expect(summary.pendingUserCount).toBe(0);
          expect(summary.pendingLorryCount).toBe(0);
          done();
        }
      });
    });

    it('should initialize usersByRole with zeros', (done) => {
      apiServiceSpy.get.and.returnValues(
        of([]),
        of([])
      );

      service.getDashboardSummary().subscribe({
        next: (summary) => {
          expect(summary.usersByRole.Dispatcher).toBe(0);
          expect(summary.usersByRole.LorryOwner).toBe(0);
          expect(summary.usersByRole.Driver).toBe(0);
          expect(summary.usersByRole.Admin).toBe(0);
          done();
        }
      });
    });
  });
});
