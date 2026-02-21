import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  UseGuards, ForbiddenException, HttpCode, HttpStatus, Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { AssetsService } from '../assets/assets.service';
import { BrokersService } from '../admin/brokers.service';

@Controller('carrier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Carrier)
export class CarrierController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly assetsService: AssetsService,
    private readonly brokersService: BrokersService,
  ) {}

  private getCarrierId(user: CurrentUserData): string {
    if (!user.carrierId) throw new ForbiddenException('Carrier ID not found');
    return user.carrierId;
  }

  // ── Assets ────────────────────────────────────────────────

  @Get('assets')
  async getAllAssets(@CurrentUser() user: CurrentUserData) {
    const carrierId = this.getCarrierId(user);
    const [trucks, trailers, drivers, dispatchers, brokers] = await Promise.all([
      this.assetsService.getTrucksByCarrier(carrierId),
      this.assetsService.getTrailersByCarrier(carrierId),
      this.usersService.getUsersByCarrier(carrierId, 'DRIVER'),
      this.usersService.getUsersByCarrier(carrierId, 'DISPATCHER'),
      this.brokersService.getAllBrokers(true),
    ]);
    return { trucks, trailers, drivers, dispatchers, brokers };
  }

  // ── Orders ────────────────────────────────────────────────

  @Get('orders')
  async getOrders(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: any,
    @Headers('x-pagination-token') paginationToken?: string,
  ) {
    const carrierId = this.getCarrierId(user);
    return this.ordersService.getOrders(
      carrierId, UserRole.Carrier,
      {
        ...filters,
        lastEvaluatedKey: paginationToken,
        includeAggregates: !paginationToken && filters.includeAggregates !== 'false',
      },
    );
  }

  // ── Users ─────────────────────────────────────────────────

  @Get('users')
  async getUsers(
    @CurrentUser() user: CurrentUserData,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    const carrierId = this.getCarrierId(user);
    const users = await this.usersService.getUsersByCarrier(carrierId, role, search);
    return { users, total: users.length };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@CurrentUser() user: CurrentUserData, @Body() dto: any) {
    const carrierId = this.getCarrierId(user);
    const result = await this.usersService.createUser(carrierId, dto);
    return { user: result.user, temporaryPassword: result.temporaryPassword };
  }

  @Put('users/:userId')
  async updateUser(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
    @Body() dto: any,
  ) {
    const carrierId = this.getCarrierId(user);
    return { user: await this.usersService.updateUser(userId, carrierId, dto) };
  }

  @Patch('users/:userId/status')
  async updateUserStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    const carrierId = this.getCarrierId(user);
    const updated = statusDto.isActive
      ? await this.usersService.reactivateUser(userId, carrierId)
      : await this.usersService.deactivateUser(userId, carrierId);
    return { user: updated };
  }

  // ── Trucks ────────────────────────────────────────────────

  @Get('trucks')
  async getTrucks(@CurrentUser() user: CurrentUserData, @Query('search') search?: string) {
    const carrierId = this.getCarrierId(user);
    let trucks = await this.assetsService.getTrucksByCarrier(carrierId);
    if (search) {
      const s = search.toLowerCase();
      trucks = trucks.filter((t: any) => t.plate?.toLowerCase().includes(s));
    }
    return { trucks, total: trucks.length };
  }

  @Post('trucks')
  @HttpCode(HttpStatus.CREATED)
  async createTruck(@CurrentUser() user: CurrentUserData, @Body() dto: any) {
    return { truck: await this.assetsService.createTruck(this.getCarrierId(user), dto) };
  }

  @Put('trucks/:truckId')
  async updateTruck(
    @CurrentUser() user: CurrentUserData,
    @Param('truckId') truckId: string,
    @Body() dto: any,
  ) {
    return { truck: await this.assetsService.updateTruck(truckId, this.getCarrierId(user), dto) };
  }

  @Patch('trucks/:truckId/status')
  async updateTruckStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('truckId') truckId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    return { truck: await this.assetsService.setTruckActive(truckId, this.getCarrierId(user), statusDto.isActive) };
  }

  // ── Trailers ──────────────────────────────────────────────

  @Get('trailers')
  async getTrailers(@CurrentUser() user: CurrentUserData, @Query('search') search?: string) {
    const carrierId = this.getCarrierId(user);
    let trailers = await this.assetsService.getTrailersByCarrier(carrierId);
    if (search) {
      const s = search.toLowerCase();
      trailers = trailers.filter((t: any) => t.plate?.toLowerCase().includes(s));
    }
    return { trailers, total: trailers.length };
  }

  @Post('trailers')
  @HttpCode(HttpStatus.CREATED)
  async createTrailer(@CurrentUser() user: CurrentUserData, @Body() dto: any) {
    return { trailer: await this.assetsService.createTrailer(this.getCarrierId(user), dto) };
  }

  @Put('trailers/:trailerId')
  async updateTrailer(
    @CurrentUser() user: CurrentUserData,
    @Param('trailerId') trailerId: string,
    @Body() dto: any,
  ) {
    return { trailer: await this.assetsService.updateTrailer(trailerId, this.getCarrierId(user), dto) };
  }

  @Patch('trailers/:trailerId/status')
  async updateTrailerStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('trailerId') trailerId: string,
    @Body() statusDto: { isActive: boolean },
  ) {
    return { trailer: await this.assetsService.setTrailerActive(trailerId, this.getCarrierId(user), statusDto.isActive) };
  }
}
