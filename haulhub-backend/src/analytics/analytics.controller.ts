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
import { UserRole } from '@haulhub/shared';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('fleet-overview')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFleetOverview() {
    return await this.analyticsService.getFleetOverview();
  }

  @Get('trip-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getTripAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getTripAnalytics(start, end);
  }

  @Get('driver-performance')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getDriverPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getDriverPerformance(start, end);
  }

  @Get('vehicle-utilization')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getVehicleUtilization(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getVehicleUtilization(start, end);
  }

  @Get('revenue-analytics')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getRevenueAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.analyticsService.getRevenueAnalytics(start, end);
  }

  @Get('maintenance-alerts')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getMaintenanceAlerts() {
    return await this.analyticsService.getMaintenanceAlerts();
  }
}