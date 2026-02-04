import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('fleet-overview')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getFleetOverview(@CurrentUser() user: CurrentUserData) {
    return await this.analyticsService.getFleetOverview(user.userId);
  }

  @Get('trip-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getTripAnalytics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getTripAnalytics(user.userId, start, end);
  }

  @Get('driver-performance')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getDriverPerformance(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getDriverPerformance(user.userId, start, end);
  }

  @Get('vehicle-utilization')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getVehicleUtilization(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getVehicleUtilization(user.userId, start, end);
  }

  @Get('revenue-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getRevenueAnalytics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getRevenueAnalytics(user.userId, start, end);
  }

  @Get('maintenance-alerts')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getMaintenanceAlerts(@CurrentUser() user: CurrentUserData) {
    return await this.analyticsService.getMaintenanceAlerts(user.userId);
  }

  @Get('broker-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getBrokerAnalytics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getBrokerAnalytics(user.userId, start, end);
  }

  @Get('fuel-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  async getFuelAnalytics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getFuelAnalytics(user.userId, start, end);
  }
}