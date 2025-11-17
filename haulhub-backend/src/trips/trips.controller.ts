import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
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
   * GET /trips/:id
   * Get a specific trip by ID
   * Requirements: 4.4, 19.2
   * 
   * Authorization: User must be the dispatcher who created the trip,
   * or the driver assigned to the trip, or the lorry owner, or admin
   */
  @Get(':id')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner, UserRole.Admin)
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
      dto.status,
    );
  }

  /**
   * GET /trips
   * Get trips with role-based filtering
   * Requirements: 4.5, 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5, 19.2, 19.3, 19.4
   * 
   * For dispatchers: Returns their trips
   * For drivers: Returns assigned trips
   * For lorry owners: Returns trips for their approved lorries
   * 
   * Supports filtering by:
   * - Date range (startDate, endDate)
   * - Broker (brokerId)
   * - Lorry (lorryId)
   * - Driver (driverId)
   * - Status (status)
   * 
   * Supports pagination with limit and lastEvaluatedKey
   */
  @Get()
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
  async getTrips(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: TripFilters,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    return this.tripsService.getTrips(
      user.userId,
      user.role as UserRole,
      filters,
    );
  }

  /**
   * GET /trips/reports/payments
   * Get payment reports with role-based aggregation
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 11.4, 11.5
   * 
   * For dispatchers: Aggregate broker payments (income), driver payments (expense), 
   *                  lorry owner payments (expense), calculate profit
   * For drivers: Aggregate driver payments, sum distance traveled
   * For lorry owners: Aggregate lorry owner payments across all lorries
   * 
   * Supports filtering by:
   * - Date range (startDate, endDate)
   * - Broker (brokerId)
   * - Lorry (lorryId)
   * - Driver (driverId)
   * 
   * Supports grouping by:
   * - broker (dispatcher only)
   * - driver (dispatcher only)
   * - lorry (dispatcher and lorry owner)
   * - dispatcher (driver and lorry owner)
   */
  @Get('reports/payments')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
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
}
