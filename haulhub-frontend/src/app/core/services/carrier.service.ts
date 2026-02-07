import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Truck, Trailer, Driver } from './trip.service';
import { Broker } from '@haulhub/shared';

// ============================================================================
// Interfaces
// ============================================================================

export interface DashboardMetrics {
  activeTrips: number;
  activeAssets: {
    trucks: number;
    trailers: number;
  };
  activeUsers: {
    dispatchers: number;
    drivers: number;
    truckOwners: number;
  };
  tripStatusBreakdown: {
    scheduled: number;
    pickedUp: number;
    inTransit: number;
    delivered: number;
    paid: number;
  };
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  month: string;
}

export interface TopBroker {
  brokerId: string;
  brokerName: string;
  tripCount: number;
}

export interface TopDriver {
  driverId: string;
  driverName: string;
  completedTrips: number;
}

export interface ChartAggregates {
  totalRevenue: number;
  totalExpenses: number;
  statusBreakdown: { [key: string]: number };
  topBrokers: Array<{ name: string; revenue: number; count: number }>;
  topDispatchers: Array<{ name: string; profit: number; count: number }>;
  topDrivers: Array<{ name: string; trips: number }>;
  totalTripsInRange: number;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  financialSummary: FinancialSummary;
  topBrokers: TopBroker[];
  topDrivers: TopDriver[];
  recentActivity: any[];
  chartAggregates: ChartAggregates; // Pre-calculated aggregates
  trips: any[]; // Current page of trips
  pagination?: {
    page: number;
    pageSize: number;
    totalTrips: number;
    totalPages: number;
  };
}

export interface User {
  userId: string;
  carrierId: string;
  role: 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ein: string;
  ss: string;
  isActive: boolean;
  
  // Role-specific fields
  company?: string;        // TRUCK_OWNER only
  rate?: number;           // DISPATCHER (commission %) or DRIVER (per mile)
  corpName?: string;       // DRIVER only
  dob?: string;            // DRIVER only (ISO date)
  cdlClass?: string;       // DRIVER only (A, B, C)
  cdlState?: string;       // DRIVER only
  cdlIssued?: string;      // DRIVER only (ISO date)
  cdlExpires?: string;     // DRIVER only (ISO date)
  fax?: string;            // DRIVER only
}

export interface CreateUserDto {
  role: 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ein: string;
  ss: string;
  
  // Dispatcher-specific
  rate?: number;
  
  // Driver-specific
  corpName?: string;
  dob?: string;
  cdlClass?: string;
  cdlState?: string;
  cdlIssued?: string;
  cdlExpires?: string;
  fax?: string;
  
  // Truck Owner-specific
  company?: string;
}

export interface UpdateUserDto {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  rate?: number;
  
  // Driver-specific updatable fields
  corpName?: string;
  cdlClass?: string;
  cdlState?: string;
  cdlIssued?: string;
  cdlExpires?: string;
  fax?: string;
  
  // Truck Owner-specific updatable fields
  company?: string;
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string;
}

export interface UsersResponse {
  users: User[];
  total: number;
}

export interface CreateTruckDto {
  truckOwnerId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
}

export interface UpdateTruckDto {
  truckOwnerId?: string;
  plate?: string;
  brand?: string;
  year?: number;
  vin?: string;
  color?: string;
}

export interface TrucksResponse {
  trucks: Truck[];
  total: number;
}

export interface CreateTrailerDto {
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  reefer?: string | null;
}

export interface UpdateTrailerDto {
  plate?: string;
  brand?: string;
  year?: number;
  vin?: string;
  color?: string;
  reefer?: string | null;
}

export interface TrailersResponse {
  trailers: Trailer[];
  total: number;
}

/**
 * Service for carrier-specific operations
 * Handles user management, asset management, and dashboard metrics
 */
@Injectable({
  providedIn: 'root'
})
export class CarrierService {
  constructor(private apiService: ApiService) {}

  // ============================================================================
  // Dashboard Operations
  // ============================================================================

  /**
   * Get unified dashboard data (aggregates + paginated trips)
   */
  getDashboardUnified(filters?: any): Observable<{
    chartAggregates: any;
    trips: any[];
    lastEvaluatedKey?: string;
  }> {
    const { lastEvaluatedKey, ...queryFilters } = filters || {};
    const options = lastEvaluatedKey 
      ? { headers: { 'x-pagination-token': lastEvaluatedKey } as Record<string, string> }
      : undefined;

    return this.apiService.get('/carrier/dashboard-unified', queryFilters, options);
  }

  /**
   * Get trips only (no aggregates) - for pagination
   */
  getTrips(filters?: any): Observable<{
    trips: any[];
    lastEvaluatedKey?: string;
  }> {
    const { lastEvaluatedKey, ...queryFilters } = filters || {};
    const options = lastEvaluatedKey 
      ? { headers: { 'x-pagination-token': lastEvaluatedKey } as Record<string, string> }
      : undefined;

    return this.apiService.get('/carrier/trips', queryFilters, options);
  }

  /**
   * Get dashboard metrics for the carrier with optional date filter and pagination
   * Includes active trips, assets, users, financial summary, top performers, and recent activity
   */
  getDashboardMetrics(
    startDate?: Date | null,
    endDate?: Date | null,
    page?: number,
    pageSize?: number,
    status?: string | null,
    brokerId?: string | null,
    dispatcherId?: string | null,
    driverId?: string | null,
    truckId?: string | null
  ): Observable<DashboardResponse> {
    const params: any = {};
    if (startDate) {
      params.startDate = startDate.toISOString();
    }
    if (endDate) {
      params.endDate = endDate.toISOString();
    }
    if (page !== undefined) {
      params.page = page.toString();
    }
    if (pageSize !== undefined) {
      params.pageSize = pageSize.toString();
    }
    if (status) {
      params.status = status;
    }
    if (brokerId) {
      params.brokerId = brokerId;
    }
    if (dispatcherId) {
      params.dispatcherId = dispatcherId;
    }
    if (driverId) {
      params.driverId = driverId;
    }
    if (truckId) {
      params.truckId = truckId;
    }
    return this.apiService.get<DashboardResponse>('/carrier/dashboard', params);
  }

  // ============================================================================
  // User Management Operations
  // ============================================================================

  /**
   * Get all users for the carrier
   * @param role - Optional role filter (DISPATCHER, DRIVER, TRUCK_OWNER)
   * @param search - Optional search term for name or email
   */
  getUsers(role?: string, search?: string): Observable<UsersResponse> {
    const params: any = {};
    if (role) params.role = role;
    if (search) params.search = search;
    return this.apiService.get<UsersResponse>('/carrier/users', params);
  }

  /**
   * Create a new user (dispatcher, driver, or truck owner)
   * @param dto - User creation data
   * @returns User object and temporary password
   */
  createUser(dto: CreateUserDto): Observable<CreateUserResponse> {
    return this.apiService.post<CreateUserResponse>('/carrier/users', dto);
  }

  /**
   * Update an existing user
   * @param userId - User ID to update
   * @param dto - Updated user data
   */
  updateUser(userId: string, dto: UpdateUserDto): Observable<{ user: User }> {
    return this.apiService.put<{ user: User }>(`/carrier/users/${userId}`, dto);
  }

  /**
   * Deactivate a user (soft delete)
   * @param userId - User ID to deactivate
   */
  deactivateUser(userId: string): Observable<{ user: User }> {
    return this.apiService.patch<{ user: User }>(`/carrier/users/${userId}/status`, { isActive: false });
  }

  /**
   * Reactivate a user
   * @param userId - User ID to reactivate
   */
  reactivateUser(userId: string): Observable<{ user: User }> {
    return this.apiService.patch<{ user: User }>(`/carrier/users/${userId}/status`, { isActive: true });
  }

  // ============================================================================
  // Truck Management Operations
  // ============================================================================

  /**
   * Get all trucks for the carrier
   * @param ownerId - Optional truck owner ID filter
   * @param search - Optional search term for plate
   */
  getTrucks(ownerId?: string, search?: string): Observable<TrucksResponse> {
    const params: any = {};
    if (ownerId) params.ownerId = ownerId;
    if (search) params.search = search;
    return this.apiService.get<TrucksResponse>('/carrier/trucks', params);
  }

  /**
   * Create a new truck
   * @param dto - Truck creation data
   */
  createTruck(dto: CreateTruckDto): Observable<{ truck: Truck }> {
    return this.apiService.post<{ truck: Truck }>('/carrier/trucks', dto);
  }

  /**
   * Update an existing truck
   * @param truckId - Truck ID to update
   * @param dto - Updated truck data
   */
  updateTruck(truckId: string, dto: UpdateTruckDto): Observable<{ truck: Truck }> {
    return this.apiService.put<{ truck: Truck }>(`/carrier/trucks/${truckId}`, dto);
  }

  /**
   * Update truck status (activate/deactivate)
   * @param truckId - Truck ID to update
   * @param isActive - New active status
   */
  updateTruckStatus(truckId: string, isActive: boolean): Observable<{ truck: Truck }> {
    return this.apiService.patch<{ truck: Truck }>(`/carrier/trucks/${truckId}/status`, { isActive });
  }

  /**
   * Deactivate a truck (soft delete)
   * @param truckId - Truck ID to deactivate
   */
  deactivateTruck(truckId: string): Observable<{ truck: Truck }> {
    return this.updateTruckStatus(truckId, false);
  }

  /**
   * Reactivate a truck
   * @param truckId - Truck ID to reactivate
   */
  reactivateTruck(truckId: string): Observable<{ truck: Truck }> {
    return this.updateTruckStatus(truckId, true);
  }

  // ============================================================================
  // Trailer Management Operations
  // ============================================================================

  /**
   * Get all trailers for the carrier
   * @param search - Optional search term for plate
   */
  getTrailers(search?: string): Observable<TrailersResponse> {
    const params: any = {};
    if (search) params.search = search;
    return this.apiService.get<TrailersResponse>('/carrier/trailers', params);
  }

  /**
   * Create a new trailer
   * @param dto - Trailer creation data
   */
  createTrailer(dto: CreateTrailerDto): Observable<{ trailer: Trailer }> {
    return this.apiService.post<{ trailer: Trailer }>('/carrier/trailers', dto);
  }

  /**
   * Update an existing trailer
   * @param trailerId - Trailer ID to update
   * @param dto - Updated trailer data
   */
  updateTrailer(trailerId: string, dto: UpdateTrailerDto): Observable<{ trailer: Trailer }> {
    return this.apiService.put<{ trailer: Trailer }>(`/carrier/trailers/${trailerId}`, dto);
  }

  /**
   * Update trailer status (activate/deactivate)
   * @param trailerId - Trailer ID to update
   * @param isActive - New active status
   */
  updateTrailerStatus(trailerId: string, isActive: boolean): Observable<{ trailer: Trailer }> {
    return this.apiService.patch<{ trailer: Trailer }>(`/carrier/trailers/${trailerId}/status`, { isActive });
  }

  /**
   * Deactivate a trailer (soft delete)
   * @param trailerId - Trailer ID to deactivate
   */
  deactivateTrailer(trailerId: string): Observable<{ trailer: Trailer }> {
    return this.updateTrailerStatus(trailerId, false);
  }

  /**
   * Reactivate a trailer
   * @param trailerId - Trailer ID to reactivate
   */
  reactivateTrailer(trailerId: string): Observable<{ trailer: Trailer }> {
    return this.updateTrailerStatus(trailerId, true);
  }

  // ============================================================================
  // Broker Operations
  // ============================================================================

  /**
   * Get all brokers (global list)
   */
  getBrokers(): Observable<Broker[]> {
    return this.apiService.get<Broker[]>('/brokers', { activeOnly: 'true' });
  }
}
