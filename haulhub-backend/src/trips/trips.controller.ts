import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  CreateTripDto,
  UpdateTripDto,
  UpdateTripStatusDto,
  TripFilters,
  Trip,
  TripStatus,
} from '@haulhub/shared';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  /**
   * POST /trips
   * Create a new trip (Dispatcher only)
   * Requirements: 4.1, 4.2, 19.2, 19.3, 19.4, 20.1
   */
  @Post()
  @Roles(UserRole.Dispatcher)
  async createTrip(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTripDto,
  ): Promise<Trip> {
    return this.tripsService.createTrip(user.userId, dto);
  }

  /**
   * PATCH /trips/:id
   * Update trip details (Dispatcher only)
   * Requirements: 4.4, 20.1
   */
  @Patch(':id')
  @Roles(UserRole.Dispatcher)
  async updateTrip(
    @CurrentUser() user: CurrentUserData,
    @Param('id') tripId: string,
    @Body() dto: UpdateTripDto,
  ): Promise<Trip> {
    return this.tripsService.updateTrip(tripId, user.userId, dto);
  }

  /**
   * PATCH /trips/:id/status
   * Update trip status
   * Requirements: 4.3, 10.1, 10.2, 10.3, 10.4, 10.5
   * 
   * Dispatchers can update to any status
   * Drivers can only update to PickedUp, InTransit, Delivered
   * Drivers can only update trips assigned to them
   */
  @Patch(':id/status')
  @Roles(UserRole.Dispatcher, UserRole.Driver)
  async updateTripStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') tripId: string,
    @Body() dto: UpdateTripStatusDto,
  ): Promise<Trip> {
    return this.tripsService.updateTripStatus(
      tripId,
      user.userId,
      user.role as UserRole,
      dto.orderStatus,
      dto.notes,
    );
  }

  /**
   * GET /trips
   * Get trips with role-based filtering
   * Requirements: 4.5, 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5, 19.2, 19.3, 19.4
   * 
   * For dispatchers: Returns their trips
   * For drivers: Returns assigned trips
   * For truck owners: Returns trips for their approved trucks
   * 
   * Supports filtering by:
   * - Date range (startDate, endDate)
   * - Broker (brokerId)
   * - Truck (truckId)
   * - Driver (driverId)
   * - Status (status)
   * 
   * Supports pagination with limit and lastEvaluatedKey
   */
  @Get()
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Carrier)
  async getTrips(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
    @Headers('x-pagination-token') paginationToken?: string,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string; assets?: any }> {
    // Use pagination token from header if provided, otherwise fall back to query param
    const filtersWithToken = {
      ...filters,
      lastEvaluatedKey: paginationToken || filters.lastEvaluatedKey
    };
    
    return this.tripsService.getTrips(
      user.userId,
      user.role as UserRole,
      filtersWithToken,
    );
  }

  /**
   * GET /trips/reports/payments
   * Get payment reports with role-based aggregation
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 11.4, 11.5
   * 
   * For dispatchers: Aggregate broker payments (income), driver payments (expense), 
   *                  truck owner payments (expense), calculate profit
   * For drivers: Aggregate driver payments, sum distance traveled
   * For truck owners: Aggregate truck owner payments across all trucks
   * 
   * Supports filtering by:
   * - Date range (startDate, endDate)
   * - Broker (brokerId)
   * - Truck (truckId)
   * - Driver (driverId)
   * 
   * Supports grouping by:
   * - broker (dispatcher only)
   * - driver (dispatcher only)
   * - truck (dispatcher and truck owner)
   * - dispatcher (driver and truck owner)
   */
  @Get('reports/payments')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Carrier)
  async getPaymentReport(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: any,
  ): Promise<any> {
    return this.tripsService.getPaymentReport(
      user.userId,
      user.role as UserRole,
      filters,
    );
  }

  /**
   * GET /trips/dashboard/summary-by-status
   * Get trip counts grouped by status for dashboard
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   * 
   * Dispatcher only - returns trip counts for each status
   */
  @Get('dashboard/summary-by-status')
  @Roles(UserRole.Dispatcher)
  async getTripSummaryByStatus(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<Record<TripStatus, number>> {
    return this.tripsService.getTripSummaryByStatus(user.userId, filters);
  }

  /**
   * GET /trips/dashboard/payment-summary
   * Get aggregated payment metrics for dashboard
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5
   * 
   * Dispatcher only - returns total payments and profit including additional fees
   */
  @Get('dashboard/payment-summary')
  @Roles(UserRole.Dispatcher)
  async getPaymentSummary(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<{
    totalBrokerPayments: number;
    totalDriverPayments: number;
    totalTruckOwnerPayments: number;
    totalLumperValue: number;
    totalDetentionValue: number;
    totalAdditionalFees: number;
    totalProfit: number;
  }> {
    return this.tripsService.getPaymentSummary(user.userId, filters);
  }

  /**
   * GET /trips/dashboard/export
   * Get all data needed for PDF export in a single call
   * 
   * Dispatcher and Driver - returns trips, summaries, and asset lookups
   */
  @Get('dashboard/export')
  @Roles(UserRole.Dispatcher, UserRole.Driver)
  async getDashboardExport(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<{
    trips: Trip[];
    summaryByStatus: Record<TripStatus, number>;
    paymentSummary: {
      totalBrokerPayments: number;
      totalDriverPayments: number;
      totalTruckOwnerPayments: number;
      totalProfit: number;
    };
    assets: {
      brokers: Array<{ brokerId: string; brokerName: string }>;
      trucks: Array<{ truckId: string; plate: string }>;
      drivers: Array<{ userId: string; name: string }>;
      trailers: Array<{ trailerId: string; plate: string }>;
    };
  }> {
    return this.tripsService.getDashboardExport(user.userId, user.role as UserRole, filters);
  }

  /**
   * GET /trips/dashboard/payments-timeline
   * Get time-series payment data for dashboard charts
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   * 
   * Dispatcher only - returns monthly payment data for charts
   */
  @Get('dashboard/payments-timeline')
  @Roles(UserRole.Dispatcher)
  async getPaymentsTimeline(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<{
    labels: string[];
    brokerPayments: number[];
    driverPayments: number[];
    truckOwnerPayments: number[];
    profit: number[];
  }> {
    return this.tripsService.getPaymentsTimeline(user.userId, filters);
  }

  /**
   * GET /trips/dashboard/top-performers
   * Get top performing brokers, drivers, and trucks
   * 
   * Dispatcher only - returns top 5 performers by revenue/trips
   */
  @Get('dashboard/top-performers')
  @Roles(UserRole.Dispatcher)
  async getTopPerformers(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<{
    topBrokers: Array<{ name: string; revenue: number; count: number }>;
    topDrivers: Array<{ name: string; trips: number }>;
    topTrucks: Array<{ name: string; trips: number }>;
  }> {
    return this.tripsService.getTopPerformers(user.userId, filters);
  }

  /**
   * GET /trips/dashboard
   * Get unified dashboard data (aggregates + paginated trips)
   * 
   * Dispatcher: Returns chart aggregates from ALL carrier trips + first page of trips
   * Driver: Returns chart aggregates from driver's trips + first page of trips (sensitive data filtered)
   * 
   * This consolidates multiple endpoints into one for better performance
   */
  @Get('dashboard')
  @Roles(UserRole.Dispatcher, UserRole.Driver)
  async getDashboard(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
    @Headers('x-pagination-token') paginationToken?: string,
  ): Promise<{
    chartAggregates: {
      statusSummary: Record<TripStatus, number>;
      paymentSummary: {
        totalBrokerPayments?: number;
        totalDriverPayments: number;
        totalTruckOwnerPayments?: number;
        totalLumperValue?: number;
        totalDetentionValue?: number;
        totalAdditionalFees?: number;
        totalProfit?: number;
      };
      topPerformers: {
        topBrokers?: Array<{ name: string; revenue: number; count: number }>;
        topDrivers?: Array<{ name: string; trips: number }>;
        topTrucks?: Array<{ name: string; trips: number }>;
        topDispatchers?: Array<{ dispatcherId: string; dispatcherName: string; payment: number }>;
      };
    };
    trips: any[];
    lastEvaluatedKey?: string;
  }> {
    // Use pagination token from header if provided, otherwise fall back to query param
    const filtersWithToken = {
      ...filters,
      lastEvaluatedKey: paginationToken || filters.lastEvaluatedKey
    };
    
    return this.tripsService.getDashboard(user.userId, user.role as UserRole, filtersWithToken);
  }

  /**
   * GET /trips/:id
   * Get a specific trip by ID
   * Requirements: 4.4, 19.2
   * 
   * Authorization: User must be the carrier, dispatcher who created the trip,
   * or the driver assigned to the trip, or the lorry owner, or admin
   * 
   * NOTE: This route MUST be after all specific routes (dashboard, reports, etc.)
   * to avoid matching those paths as IDs
   */
  @Get(':id')
  @Roles(UserRole.Carrier, UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Admin)
  async getTripById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') tripId: string,
  ): Promise<Trip> {
    return this.tripsService.getTripById(
      tripId,
      user.userId,
      user.role as UserRole,
    );
  }

  /**
   * DELETE /trips/:id
   * Delete a trip
   * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
   * 
   * Dispatcher only - hard delete the trip from database
   */
  @Delete(':id')
  @Roles(UserRole.Dispatcher)
  async deleteTrip(
    @CurrentUser() user: CurrentUserData,
    @Param('id') tripId: string,
  ): Promise<{ message: string }> {
    await this.tripsService.deleteTrip(tripId, user.userId);
    return { message: 'Trip deleted successfully' };
  }
}
