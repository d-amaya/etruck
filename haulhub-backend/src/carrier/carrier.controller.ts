import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole, TripFilters } from '@haulhub/shared';
import { UsersService } from '../users/users.service';
import { TripsService } from '../trips/trips.service';
import { LorriesService } from '../lorries/lorries.service';
import { BrokersService } from '../admin/brokers.service';
import { CarrierService } from './carrier.service';

/**
 * Carrier Controller
 * 
 * Handles all carrier-specific operations including:
 * - Dashboard metrics and overview
 * - User management (dispatchers, drivers, truck owners)
 * - Asset management (trucks and trailers)
 * 
 * Authorization:
 * - All endpoints require CARRIER role
 * - Validates that requested carrierId matches JWT carrierId
 * - Ensures carriers can only access their own organization data
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
@Controller('carrier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Carrier)
export class CarrierController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tripsService: TripsService,
    private readonly lorriesService: LorriesService,
    private readonly brokersService: BrokersService,
    private readonly carrierService: CarrierService,
  ) {}

  /**
   * Validate that the user is a carrier and has access to the requested carrier data
   * 
   * This method implements the core authorization logic for carrier endpoints:
   * 1. Verifies user has CARRIER role (handled by @Roles decorator)
   * 2. Extracts carrierId from JWT token (available in user.carrierId)
   * 3. Validates requested carrierId matches JWT carrierId
   * 
   * @param user - Current authenticated user from JWT token
   * @param requestedCarrierId - Carrier ID from request (query param, body, etc.)
   * @throws ForbiddenException if carrierId doesn't match or is missing
   * 
   * Requirements: 9.1, 9.2, 9.3
   */
  private validateCarrierAccess(user: CurrentUserData, requestedCarrierId?: string): void {
    // Extract carrierId from JWT token (set by JwtAuthGuard)
    const jwtCarrierId = user.carrierId;

    // Ensure carrierId exists in JWT token
    if (!jwtCarrierId) {
      throw new ForbiddenException('Carrier ID not found in authentication token');
    }

    // If a specific carrierId is requested, validate it matches the JWT carrierId
    if (requestedCarrierId && requestedCarrierId !== jwtCarrierId) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
  }

  /**
   * Get the carrier ID from the current user
   * 
   * @param user - Current authenticated user
   * @returns Carrier ID from JWT token
   * @throws ForbiddenException if carrierId is missing
   */
  private getCarrierId(user: CurrentUserData): string {
    const carrierId = user.carrierId;
    
    if (!carrierId) {
      throw new ForbiddenException('Carrier ID not found in authentication token');
    }
    
    return carrierId;
  }

  // ============================================================================
  // Dashboard Endpoints
  // ============================================================================

  /**
   * Get unified dashboard data (aggregates + paginated trips)
   * 
   * This consolidates multiple endpoints into one for better performance:
   * - Status summary (trip counts by status)
   * - Payment summary (revenue, expenses, profit)
   * - Top performers (brokers, drivers, trucks)
   * - Paginated trips for the table
   * 
   * Performance: Reduces API calls from 4+ to 1
   * 
   * @param user - Current authenticated carrier user
   * @param filters - Trip filters (date range, status, broker, etc.)
   * @param paginationToken - Pagination token from previous request
   * @returns Unified dashboard data
   * 
   * @example
   * GET /api/carrier/dashboard-unified?startDate=2024-01-01&endDate=2024-12-31&limit=20
   * Authorization: Bearer <carrier-jwt-token>
   */
  @Get('dashboard-unified')
  async getDashboardUnified(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
    @Headers('x-pagination-token') paginationToken?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    const filtersWithToken = {
      ...filters,
      lastEvaluatedKey: paginationToken,
    };

    return this.carrierService.getDashboard(carrierId, filtersWithToken);
  }

  /**
   * Get trips only (no aggregates) - for pagination
   */
  @Get('trips')
  async getTrips(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
    @Headers('x-pagination-token') paginationToken?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    const filtersWithToken = {
      ...filters,
      lastEvaluatedKey: paginationToken,
    };

    const result = await this.tripsService.getTrips(carrierId, UserRole.Carrier, filtersWithToken);
    
    return {
      trips: result.trips,
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  /**
   * Get carrier dashboard metrics and overview
   * 
   * Returns comprehensive dashboard data including:
   * - Active trips, assets, and users counts
   * - Trip status breakdown
   * - Financial summary for current month
   * - Top brokers and drivers
   * - Recent activity feed
   * 
   * @param user - Current authenticated carrier user
   * @returns Dashboard metrics and data
   * 
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 11.1, 11.2, 11.3, 11.4
   * 
   * @example
   * GET /api/carrier/dashboard
   * Authorization: Bearer <carrier-jwt-token>
   */
  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('brokerId') brokerId?: string,
    @Query('dispatcherId') dispatcherId?: string,
    @Query('driverId') driverId?: string,
    @Query('truckId') truckId?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      // Parse date filters if provided
      let dateFilter: { start?: Date; end?: Date } = {};
      if (startDate) {
        dateFilter.start = new Date(startDate);
      }
      if (endDate) {
        dateFilter.end = new Date(endDate);
      }

      // Get all data in parallel for better performance
      const [allTrips, trucks, trailers, users, brokers] = await Promise.all([
        this.tripsService.getTripsByCarrier(carrierId, dateFilter.start && dateFilter.end ? { startDate: dateFilter.start.toISOString(), endDate: dateFilter.end.toISOString() } : {}),
        this.lorriesService.getTrucksByCarrier(carrierId),
        this.lorriesService.getTrailersByCarrier(carrierId),
        this.usersService.getUsersByCarrier(carrierId),
        this.brokersService.getAllBrokers(true), // Only active brokers
      ]);

      // Calculate active trips count (status not 'Paid') from ALL trips
      const activeTrips = allTrips.filter(trip => trip.orderStatus !== 'Paid').length;

      // Calculate active assets count (trucks + trailers with isActive=true)
      // Note: trucks and trailers are returned with eTrucky schema (isActive field)
      const activeTrucks = trucks.filter((truck: any) => truck.isActive).length;
      const activeTrailers = trailers.filter((trailer: any) => trailer.isActive).length;

      // Calculate active users count by role (isActive=true)
      const activeUsers = users.filter(user => user.isActive);
      const dispatchers = activeUsers.filter(u => u.role === 'DISPATCHER').length;
      const drivers = activeUsers.filter(u => u.role === 'DRIVER').length;
      const truckOwners = activeUsers.filter(u => u.role === 'TRUCK_OWNER').length;

      // Calculate trip status breakdown from ALL trips
      const tripStatusBreakdown = {
        scheduled: allTrips.filter(t => t.orderStatus === 'Scheduled').length,
        pickedUp: allTrips.filter(t => t.orderStatus === 'Picked Up').length,
        inTransit: allTrips.filter(t => t.orderStatus === 'In Transit').length,
        delivered: allTrips.filter(t => t.orderStatus === 'Delivered').length,
        paid: allTrips.filter(t => t.orderStatus === 'Paid').length,
      };

      // Calculate financial summary for the filtered date range (or current month if no filter)
      let financialPeriodLabel: string;
      let financialTrips: any[];
      
      if (dateFilter.start && dateFilter.end) {
        // Use provided date range
        financialTrips = allTrips; // Use ALL trips for financial calculations
        const startMonth = dateFilter.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const endMonth = dateFilter.end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        financialPeriodLabel = startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`;
      } else {
        // Default to current month
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        financialTrips = allTrips.filter(trip => {
          const tripDate = new Date(trip.scheduledTimestamp);
          return tripDate >= currentMonthStart && tripDate <= currentMonthEnd;
        });
        
        financialPeriodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      const totalRevenue = financialTrips.reduce((sum, trip) => sum + (trip.brokerPayment || 0), 0);
      const totalExpenses = financialTrips.reduce((sum, trip) => {
        return sum + 
          (trip.driverPayment || 0) + 
          (trip.truckOwnerPayment || 0) + 
          (trip.dispatcherPayment || 0) + 
          (trip.fuelCost || 0);
      }, 0);
      const netProfit = totalRevenue - totalExpenses;

      // Get top 5 brokers by trip volume
      const brokerTripCounts = new Map<string, { brokerId: string; brokerName: string; tripCount: number }>();
      
      for (const trip of allTrips) {
        if (trip.brokerId) {
          const existing = brokerTripCounts.get(trip.brokerId);
          if (existing) {
            existing.tripCount++;
          } else {
            // Find broker name from brokers list
            const broker = brokers.find(b => b.brokerId === trip.brokerId);
            brokerTripCounts.set(trip.brokerId, {
              brokerId: trip.brokerId,
              brokerName: broker?.brokerName || 'Unknown Broker',
              tripCount: 1,
            });
          }
        }
      }

      const topBrokers = Array.from(brokerTripCounts.values())
        .sort((a, b) => b.tripCount - a.tripCount)
        .slice(0, 5);

      // Get top 5 drivers by completed trips (Delivered or Paid status)
      const driverTripCounts = new Map<string, { driverId: string; driverName: string; completedTrips: number }>();
      
      const completedTrips = allTrips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid');
      
      for (const trip of completedTrips) {
        if (trip.driverId) {
          const existing = driverTripCounts.get(trip.driverId);
          if (existing) {
            existing.completedTrips++;
          } else {
            // Find driver name from users list
            const driver = users.find(u => u.userId === trip.driverId);
            driverTripCounts.set(trip.driverId, {
              driverId: trip.driverId,
              driverName: driver?.name || 'Unknown Driver',
              completedTrips: 1,
            });
          }
        }
      }

      const topDrivers = Array.from(driverTripCounts.values())
        .sort((a, b) => b.completedTrips - a.completedTrips)
        .slice(0, 5);

      // Get last 10 trips for recent activity (ordered by scheduledTimestamp descending)
      const recentActivity = [...allTrips]
        .sort((a, b) => {
          const dateA = new Date(a.scheduledTimestamp).getTime();
          const dateB = new Date(b.scheduledTimestamp).getTime();
          return dateB - dateA; // Descending order
        })
        .slice(0, 10)
        .map(trip => {
          // Enrich with names for display
          const dispatcher = users.find(u => u.userId === trip.dispatcherId);
          const driver = users.find(u => u.userId === trip.driverId);
          
          return {
            tripId: trip.tripId,
            orderConfirmation: trip.orderConfirmation,
            orderStatus: trip.orderStatus,
            scheduledTimestamp: trip.scheduledTimestamp,
            pickupCity: trip.pickupCity,
            deliveryCity: trip.deliveryCity,
            dispatcherName: dispatcher?.name || 'Unknown',
            driverName: driver?.name || 'Unknown',
          };
        });

      // Calculate broker performance (for charts) from ALL trips
      const brokerPerformance = new Map<string, { revenue: number; count: number; name: string }>();
      allTrips.forEach(trip => {
        if (trip.brokerId) {
          const broker = brokers.find(b => b.brokerId === trip.brokerId);
          const brokerName = broker?.brokerName || 'Unknown Broker';
          const existing = brokerPerformance.get(trip.brokerId);
          if (existing) {
            existing.revenue += trip.brokerPayment || 0;
            existing.count++;
          } else {
            brokerPerformance.set(trip.brokerId, {
              revenue: trip.brokerPayment || 0,
              count: 1,
              name: brokerName
            });
          }
        }
      });

      const topBrokersByRevenue = Array.from(brokerPerformance.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(b => ({ name: b.name, revenue: b.revenue, count: b.count }));

      // Calculate dispatcher performance (for charts) from ALL trips
      const dispatcherPerformance = new Map<string, { profit: number; count: number; name: string }>();
      allTrips.forEach(trip => {
        if (trip.dispatcherId) {
          const dispatcher = users.find(u => u.userId === trip.dispatcherId);
          const dispatcherName = dispatcher?.name || 'Unknown Dispatcher';
          const profit = (trip.brokerPayment || 0) - 
                        (trip.driverPayment || 0) - 
                        (trip.truckOwnerPayment || 0) - 
                        (trip.dispatcherPayment || 0) - 
                        (trip.fuelCost || 0);
          const existing = dispatcherPerformance.get(trip.dispatcherId);
          if (existing) {
            existing.profit += profit;
            existing.count++;
          } else {
            dispatcherPerformance.set(trip.dispatcherId, {
              profit,
              count: 1,
              name: dispatcherName
            });
          }
        }
      });

      const topDispatchersByProfit = Array.from(dispatcherPerformance.values())
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5)
        .map(d => ({ name: d.name, profit: d.profit, count: d.count }));

      // Calculate aggregated chart data from ALL trips (date-filtered only)
      const chartAggregates = {
        totalRevenue: allTrips.reduce((sum, t) => sum + (t.brokerPayment || 0), 0),
        totalExpenses: allTrips.reduce((sum, t) => sum + (t.driverPayment || 0) + (t.truckOwnerPayment || 0) + (t.fuelCost || 0), 0),
        statusBreakdown: tripStatusBreakdown,
        topBrokers: topBrokersByRevenue,
        topDispatchers: topDispatchersByProfit,
        topDrivers: topDrivers.slice(0, 5).map(d => ({ name: d.driverName, trips: d.completedTrips })),
        totalTripsInRange: allTrips.length
      };

      // Apply table-specific filters for pagination (status, broker, dispatcher, driver, truck)
      let filteredTripsForTable = allTrips;
      
      // Removed debug log
      
      if (status) {
        // Removed debug log
        filteredTripsForTable = filteredTripsForTable.filter(t => {
          const matches = t.orderStatus === status;
          if (!matches) {
            // Removed debug log
          }
          return matches;
        });
        // Removed debug log
      }
      if (brokerId) {
        filteredTripsForTable = filteredTripsForTable.filter(t => t.brokerId === brokerId);
      }
      if (dispatcherId) {
        filteredTripsForTable = filteredTripsForTable.filter(t => t.dispatcherId === dispatcherId);
      }
      if (driverId) {
        filteredTripsForTable = filteredTripsForTable.filter(t => t.driverId === driverId);
      }
      if (truckId) {
        filteredTripsForTable = filteredTripsForTable.filter(t => t.truckId === truckId);
      }

      // Return only requested page of table-filtered trips (10 by default)
      const currentPage = page ? parseInt(page, 10) : 0;
      const currentPageSize = pageSize ? parseInt(pageSize, 10) : 10;
      const startIndex = currentPage * currentPageSize;
      const endIndex = startIndex + currentPageSize;
      const paginatedTrips = filteredTripsForTable.slice(startIndex, endIndex);

      // Removed debug log

      return {
        metrics: {
          activeTrips,
          activeAssets: {
            trucks: activeTrucks,
            trailers: activeTrailers,
          },
          activeUsers: {
            dispatchers,
            drivers,
            truckOwners,
          },
          tripStatusBreakdown,
        },
        financialSummary: {
          totalRevenue,
          totalExpenses,
          netProfit,
          month: financialPeriodLabel,
        },
        topBrokers,
        topDrivers,
        recentActivity,
        chartAggregates, // Pre-calculated aggregates for charts
        trips: paginatedTrips, // Only requested page of trips
        pagination: {
          page: currentPage,
          pageSize: currentPageSize,
          totalTrips: filteredTripsForTable.length,
          totalPages: Math.ceil(filteredTripsForTable.length / currentPageSize),
        },
      };
    } catch (error: any) {
      console.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  // ============================================================================
  // User Management Endpoints
  // ============================================================================

  /**
   * Get all users for the carrier organization
   * 
   * Supports filtering by:
   * - role: Filter by user role (DISPATCHER, DRIVER, TRUCK_OWNER)
   * - search: Search by name or email (case-insensitive)
   * 
   * @param user - Current authenticated carrier user
   * @param role - Optional role filter
   * @param search - Optional search term for name/email
   * @returns List of users and total count
   * 
   * Requirements: 3.14, 3.15, 3.16, 3.17
   * 
   * @example
   * GET /api/carrier/users?role=DISPATCHER&search=john
   * Authorization: Bearer <carrier-jwt-token>
   */
  @Get('users')
  async getUsers(
    @CurrentUser() user: CurrentUserData,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const users = await this.usersService.getUsersByCarrier(carrierId, role, search);
      
      return {
        users,
        total: users.length,
      };
    } catch (error: any) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  /**
   * Create a new user (dispatcher, driver, or truck owner)
   * 
   * Creates user in both Cognito and DynamoDB:
   * - Generates UUID for userId (from Cognito sub)
   * - Sets custom Cognito attributes (carrierId, nationalId, role)
   * - Generates temporary password
   * - Stores user in eTrucky-Users table
   * 
   * @param user - Current authenticated carrier user
   * @param createUserDto - User creation data
   * @returns Created user and temporary password
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13
   * 
   * @example
   * POST /api/carrier/users
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { role: "DISPATCHER", name: "John Doe", email: "john@example.com", ... }
   */
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @CurrentUser() user: CurrentUserData,
    @Body() createUserDto: any, // Using any for now - DTOs are defined in users.service.ts
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const result = await this.usersService.createUser(carrierId, createUserDto);
      
      return {
        user: result.user,
        temporaryPassword: result.temporaryPassword,
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update an existing user
   * 
   * Allows updating:
   * - name, phone, address, city, state, zip, rate
   * - Role-specific fields (corpName, cdlClass, etc. for drivers)
   * 
   * Prevents updating:
   * - email, userId, carrierId, role, ein, ss
   * 
   * @param user - Current authenticated carrier user
   * @param userId - ID of user to update
   * @param updateUserDto - Updated user data
   * @returns Updated user
   * 
   * Requirements: 3.18, 3.19
   * 
   * @example
   * PUT /api/carrier/users/abc-123
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { name: "John Updated", phone: "(555) 999-9999" }
   */
  @Put('users/:userId')
  async updateUser(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
    @Body() updateUserDto: any, // Using any for now - DTOs are defined in users.service.ts
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const updatedUser = await this.usersService.updateUser(userId, carrierId, updateUserDto);
      
      return {
        user: updatedUser,
      };
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Activate or deactivate a user
   * 
   * Soft delete implementation:
   * - Sets isActive to true/false
   * - Does not delete the DynamoDB record
   * 
   * @param user - Current authenticated carrier user
   * @param userId - ID of user to update
   * @param statusDto - Status update data { isActive: boolean }
   * @returns Updated user
   * 
   * Requirements: 3.20, 3.21
   * 
   * @example
   * PATCH /api/carrier/users/abc-123/status
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { isActive: false }
   */
  @Patch('users/:userId/status')
  async updateUserStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      let updatedUser;
      
      if (statusDto.isActive) {
        updatedUser = await this.usersService.reactivateUser(userId, carrierId);
      } else {
        updatedUser = await this.usersService.deactivateUser(userId, carrierId);
      }
      
      return {
        user: updatedUser,
      };
    } catch (error: any) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  // ============================================================================
  // Asset Management Endpoints - Trucks
  // ============================================================================

  /**
   * Get all trucks for the carrier
   * 
   * Supports filtering by:
   * - ownerId: Filter by truck owner ID
   * - search: Search by license plate (case-insensitive)
   * 
   * @param user - Current authenticated carrier user
   * @param ownerId - Optional truck owner ID filter
   * @param search - Optional search term for plate
   * @returns List of trucks and total count
   * 
   * Requirements: 4.9, 4.10, 4.11, 4.12
   * 
   * @example
   * GET /api/carrier/trucks?ownerId=xyz-789&search=ABC
   * Authorization: Bearer <carrier-jwt-token>
   */
  @Get('trucks')
  async getTrucks(
    @CurrentUser() user: CurrentUserData,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      // Get all trucks for the carrier
      let trucks = await this.lorriesService.getTrucksByCarrier(carrierId);

      // Apply owner filter if provided (Requirement 4.12)
      if (ownerId) {
        trucks = trucks.filter((truck: any) => truck.truckOwnerId === ownerId);
      }

      // Apply search filter if provided (Requirement 4.11)
      if (search) {
        const searchLower = search.toLowerCase();
        trucks = trucks.filter((truck: any) => 
          truck.plate?.toLowerCase().includes(searchLower)
        );
      }

      return {
        trucks,
        total: trucks.length,
      };
    } catch (error: any) {
      console.error('Error getting trucks:', error);
      throw error;
    }
  }

  /**
   * Create a new truck
   * 
   * Validates:
   * - Truck owner belongs to same carrier
   * - VIN uniqueness
   * - Plate uniqueness
   * - Year range (1900 to current + 1)
   * 
   * @param user - Current authenticated carrier user
   * @param createTruckDto - Truck creation data
   * @returns Created truck
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 13.2, 13.3, 13.6, 13.7, 13.8
   * 
   * @example
   * POST /api/carrier/trucks
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { truckOwnerId: "xyz-789", plate: "ABC123", brand: "Freightliner", ... }
   */
  @Post('trucks')
  @HttpCode(HttpStatus.CREATED)
  async createTruck(
    @CurrentUser() user: CurrentUserData,
    @Body() createTruckDto: any, // TODO: Import CreateTruckDto from shared package
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const truck = await this.lorriesService.createTruck(carrierId, createTruckDto);
      
      return {
        truck,
      };
    } catch (error: any) {
      console.error('Error creating truck:', error);
      throw error;
    }
  }

  /**
   * Update an existing truck
   * 
   * Allows updating:
   * - plate, brand, year, vin, color, truckOwnerId
   * 
   * Prevents updating:
   * - truckId, carrierId
   * 
   * @param user - Current authenticated carrier user
   * @param truckId - ID of truck to update
   * @param updateTruckDto - Updated truck data
   * @returns Updated truck
   * 
   * Requirements: 4.13, 4.14
   * 
   * @example
   * PUT /api/carrier/trucks/truck-123
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { plate: "XYZ789", color: "Blue" }
   */
  @Put('trucks/:truckId')
  async updateTruck(
    @CurrentUser() user: CurrentUserData,
    @Param('truckId') truckId: string,
    @Body() updateTruckDto: any, // TODO: Import UpdateTruckDto from shared package
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const truck = await this.lorriesService.updateTruck(truckId, carrierId, updateTruckDto);
      
      return {
        truck,
      };
    } catch (error: any) {
      console.error('Error updating truck:', error);
      throw error;
    }
  }

  /**
   * Activate or deactivate a truck
   * 
   * Soft delete implementation:
   * - Sets isActive to true/false
   * - Does not delete the DynamoDB record
   * 
   * @param user - Current authenticated carrier user
   * @param truckId - ID of truck to update
   * @param statusDto - Status update data { isActive: boolean }
   * @returns Updated truck
   * 
   * Requirements: 4.15, 4.16
   * 
   * @example
   * PATCH /api/carrier/trucks/truck-123/status
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { isActive: false }
   */
  @Patch('trucks/:truckId/status')
  async updateTruckStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('truckId') truckId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      let truck;
      
      if (statusDto.isActive) {
        truck = await this.lorriesService.reactivateTruck(truckId, carrierId);
      } else {
        truck = await this.lorriesService.deactivateTruck(truckId, carrierId);
      }
      
      return {
        truck,
      };
    } catch (error: any) {
      console.error('Error updating truck status:', error);
      throw error;
    }
  }

  // ============================================================================
  // Asset Management Endpoints - Trailers
  // ============================================================================

  /**
   * Get all trailers for the carrier
   * 
   * Supports filtering by:
   * - search: Search by license plate (case-insensitive)
   * 
   * @param user - Current authenticated carrier user
   * @param search - Optional search term for plate
   * @returns List of trailers and total count
   * 
   * Requirements: 5.8, 5.9, 5.10
   * 
   * @example
   * GET /api/carrier/trailers?search=TRL
   * Authorization: Bearer <carrier-jwt-token>
   */
  @Get('trailers')
  async getTrailers(
    @CurrentUser() user: CurrentUserData,
    @Query('search') search?: string,
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      // Get all trailers for the carrier
      let trailers = await this.lorriesService.getTrailersByCarrier(carrierId);

      // Apply search filter if provided (Requirement 5.10)
      if (search) {
        const searchLower = search.toLowerCase();
        trailers = trailers.filter((trailer: any) => 
          trailer.plate?.toLowerCase().includes(searchLower)
        );
      }

      return {
        trailers,
        total: trailers.length,
      };
    } catch (error: any) {
      console.error('Error getting trailers:', error);
      throw error;
    }
  }

  /**
   * Create a new trailer
   * 
   * Validates:
   * - VIN uniqueness
   * - Plate uniqueness
   * - Year range (1900 to current + 1)
   * 
   * @param user - Current authenticated carrier user
   * @param createTrailerDto - Trailer creation data
   * @returns Created trailer
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 13.4, 13.5
   * 
   * @example
   * POST /api/carrier/trailers
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { plate: "TRL123", brand: "Great Dane", year: 2020, ... }
   */
  @Post('trailers')
  @HttpCode(HttpStatus.CREATED)
  async createTrailer(
    @CurrentUser() user: CurrentUserData,
    @Body() createTrailerDto: any, // TODO: Import CreateTrailerDto from shared package
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const trailer = await this.lorriesService.createTrailer(carrierId, createTrailerDto);
      
      return {
        trailer,
      };
    } catch (error: any) {
      console.error('Error creating trailer:', error);
      throw error;
    }
  }

  /**
   * Update an existing trailer
   * 
   * Allows updating:
   * - plate, brand, year, vin, color, reefer
   * 
   * Prevents updating:
   * - trailerId, carrierId
   * 
   * @param user - Current authenticated carrier user
   * @param trailerId - ID of trailer to update
   * @param updateTrailerDto - Updated trailer data
   * @returns Updated trailer
   * 
   * Requirements: 5.11, 5.12
   * 
   * @example
   * PUT /api/carrier/trailers/trailer-123
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { plate: "TRL999", reefer: "TK-6000" }
   */
  @Put('trailers/:trailerId')
  async updateTrailer(
    @CurrentUser() user: CurrentUserData,
    @Param('trailerId') trailerId: string,
    @Body() updateTrailerDto: any, // TODO: Import UpdateTrailerDto from shared package
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      const trailer = await this.lorriesService.updateTrailer(trailerId, carrierId, updateTrailerDto);
      
      return {
        trailer,
      };
    } catch (error: any) {
      console.error('Error updating trailer:', error);
      throw error;
    }
  }

  /**
   * Activate or deactivate a trailer
   * 
   * Soft delete implementation:
   * - Sets isActive to true/false
   * - Does not delete the DynamoDB record
   * 
   * @param user - Current authenticated carrier user
   * @param trailerId - ID of trailer to update
   * @param statusDto - Status update data { isActive: boolean }
   * @returns Updated trailer
   * 
   * Requirements: 5.13, 5.14
   * 
   * @example
   * PATCH /api/carrier/trailers/trailer-123/status
   * Authorization: Bearer <carrier-jwt-token>
   * Body: { isActive: false }
   */
  @Patch('trailers/:trailerId/status')
  async updateTrailerStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('trailerId') trailerId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    this.validateCarrierAccess(user);
    const carrierId = this.getCarrierId(user);

    try {
      let trailer;
      
      if (statusDto.isActive) {
        trailer = await this.lorriesService.reactivateTrailer(trailerId, carrierId);
      } else {
        trailer = await this.lorriesService.deactivateTrailer(trailerId, carrierId);
      }
      
      return {
        trailer,
      };
    } catch (error: any) {
      console.error('Error updating trailer status:', error);
      throw error;
    }
  }
}
