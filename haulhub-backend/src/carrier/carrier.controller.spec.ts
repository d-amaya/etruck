import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CarrierController } from './carrier.controller';
import { CarrierService } from './carrier.service';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { TripsService } from '../trips/trips.service';
import { LorriesService } from '../lorries/lorries.service';
import { BrokersService } from '../admin/brokers.service';

describe('CarrierController', () => {
  let controller: CarrierController;
  let usersService: jest.Mocked<UsersService>;
  let tripsService: jest.Mocked<TripsService>;
  let lorriesService: jest.Mocked<LorriesService>;
  let brokersService: jest.Mocked<BrokersService>;

  beforeEach(async () => {
    // Create mock services
    const mockUsersService = {
      getUsersByCarrier: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deactivateUser: jest.fn(),
      reactivateUser: jest.fn(),
    };

    const mockTripsService = {
      getTripsByCarrier: jest.fn(),
    };

    const mockLorriesService = {
      getTrucksByCarrier: jest.fn(),
      getTrailersByCarrier: jest.fn(),
      getDriversByCarrier: jest.fn(),
    };

    const mockBrokersService = {
      getAllBrokers: jest.fn(),
    };

    const mockCarrierService = {
      getDashboard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarrierController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: TripsService, useValue: mockTripsService },
        { provide: LorriesService, useValue: mockLorriesService },
        { provide: BrokersService, useValue: mockBrokersService },
        { provide: CarrierService, useValue: mockCarrierService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CarrierController>(CarrierController);
    usersService = module.get(UsersService);
    tripsService = module.get(TripsService);
    lorriesService = module.get(LorriesService);
    brokersService = module.get(BrokersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Authorization', () => {
    describe('validateCarrierAccess', () => {
      it('should throw ForbiddenException when carrierId is missing from JWT', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          // carrierId is missing
        };

        expect(() => {
          // Access private method via type assertion for testing
          (controller as any).validateCarrierAccess(user);
        }).toThrow(ForbiddenException);

        expect(() => {
          (controller as any).validateCarrierAccess(user);
        }).toThrow('Carrier ID not found in authentication token');
      });

      it('should throw ForbiddenException when requested carrierId does not match JWT carrierId', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          carrierId: 'carrier-123',
        };

        const requestedCarrierId = 'carrier-456'; // Different carrier

        expect(() => {
          (controller as any).validateCarrierAccess(user, requestedCarrierId);
        }).toThrow(ForbiddenException);

        expect(() => {
          (controller as any).validateCarrierAccess(user, requestedCarrierId);
        }).toThrow('You do not have permission to access this resource');
      });

      it('should not throw when carrierId is present and no specific carrierId is requested', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          carrierId: 'carrier-123',
        };

        expect(() => {
          (controller as any).validateCarrierAccess(user);
        }).not.toThrow();
      });

      it('should not throw when requested carrierId matches JWT carrierId', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          carrierId: 'carrier-123',
        };

        const requestedCarrierId = 'carrier-123'; // Same carrier

        expect(() => {
          (controller as any).validateCarrierAccess(user, requestedCarrierId);
        }).not.toThrow();
      });
    });

    describe('getCarrierId', () => {
      it('should return carrierId when present', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          carrierId: 'carrier-123',
        };

        const result = (controller as any).getCarrierId(user);
        expect(result).toBe('carrier-123');
      });

      it('should throw ForbiddenException when carrierId is missing', () => {
        const user: CurrentUserData = {
          userId: 'user-123',
          email: 'carrier@test.com',
          role: UserRole.Carrier,
          username: 'carrier@test.com',
          // carrierId is missing
        };

        expect(() => {
          (controller as any).getCarrierId(user);
        }).toThrow(ForbiddenException);

        expect(() => {
          (controller as any).getCarrierId(user);
        }).toThrow('Carrier ID not found in authentication token');
      });
    });
  });

  describe('Endpoint Stubs', () => {
    const mockUser: CurrentUserData = {
      userId: 'user-123',
      email: 'carrier@test.com',
      role: UserRole.Carrier,
      username: 'carrier@test.com',
      carrierId: 'carrier-123',
    };

    it('should call getDashboard and return metrics', async () => {
      // Mock all service calls
      tripsService.getTripsByCarrier.mockResolvedValue([]);
      lorriesService.getTrucksByCarrier.mockResolvedValue([]);
      lorriesService.getTrailersByCarrier.mockResolvedValue([]);
      usersService.getUsersByCarrier.mockResolvedValue([]);
      brokersService.getAllBrokers.mockResolvedValue([]);

      const result = await controller.getDashboard(mockUser);
      
      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.financialSummary).toBeDefined();
      expect(result.topBrokers).toBeDefined();
      expect(result.topDrivers).toBeDefined();
      expect(result.recentActivity).toBeDefined();
    });

    it('should call getUsers and return users list', async () => {
      const mockUsers: any = [
        {
          userId: 'user-1',
          carrierId: 'carrier-123',
          role: 'DISPATCHER',
          name: 'John Dispatcher',
          email: 'john@test.com',
          isActive: true,
        },
      ];
      usersService.getUsersByCarrier.mockResolvedValue(mockUsers);

      const result = await controller.getUsers(mockUser, 'DISPATCHER', 'john');
      
      expect(result.users.length).toBe(1);
      expect(result.total).toBe(1);
      expect(usersService.getUsersByCarrier).toHaveBeenCalledWith('carrier-123', 'DISPATCHER', 'john');
    });

    it('should call createUser and return created user with password', async () => {
      const dto = { 
        role: 'DISPATCHER' as const, 
        name: 'John Doe', 
        email: 'john@test.com',
        phone: '(555) 123-4567',
        address: '123 Main St',
        city: 'Atlanta',
        state: 'GA',
        zip: '30301',
        ein: '12-3456789',
        ss: '123-45-6789',
        rate: 5.0,
      };
      const mockResult = {
        user: {
          userId: 'user-1',
          carrierId: 'carrier-123',
          role: 'DISPATCHER' as const,
          name: 'John Doe',
          email: 'john@test.com',
          isActive: true,
        } as any,
        temporaryPassword: 'TempPass123!',
      };
      usersService.createUser.mockResolvedValue(mockResult);

      const result = await controller.createUser(mockUser, dto);
      
      expect(result.user).toEqual(mockResult.user);
      expect(result.temporaryPassword).toBe('TempPass123!');
      expect(usersService.createUser).toHaveBeenCalledWith('carrier-123', dto);
    });

    it('should get trucks for carrier with filters', async () => {
      const mockTrucks = [
        { truckId: 'truck-1', plate: 'ABC123', truckOwnerId: 'owner-123', isActive: true },
        { truckId: 'truck-2', plate: 'XYZ789', truckOwnerId: 'owner-456', isActive: true },
      ];
      
      jest.spyOn(lorriesService, 'getTrucksByCarrier').mockResolvedValue(mockTrucks as any);
      
      const result = await controller.getTrucks(mockUser, 'owner-123', 'ABC');
      
      expect(result.trucks).toBeDefined();
      expect(result.total).toBe(1); // Filtered by owner and search
      expect(lorriesService.getTrucksByCarrier).toHaveBeenCalledWith('carrier-123');
    });

    it('should get trailers for carrier with search filter', async () => {
      const mockTrailers = [
        { trailerId: 'trailer-1', plate: 'TRL123', isActive: true },
        { trailerId: 'trailer-2', plate: 'XYZ789', isActive: true },
      ];
      
      jest.spyOn(lorriesService, 'getTrailersByCarrier').mockResolvedValue(mockTrailers as any);
      
      const result = await controller.getTrailers(mockUser, 'TRL');
      
      expect(result.trailers).toBeDefined();
      expect(result.total).toBe(1); // Filtered by search
      expect(lorriesService.getTrailersByCarrier).toHaveBeenCalledWith('carrier-123');
    });
  });
});
