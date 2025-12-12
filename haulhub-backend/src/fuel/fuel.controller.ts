import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FuelService } from './fuel.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('fuel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Get('prices')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFuelPrices(
    @Query('location') location?: string,
    @Query('fuelType') fuelType?: 'diesel' | 'gasoline',
  ) {
    return await this.fuelService.getFuelPrices(location, fuelType);
  }

  @Get('efficiency/vehicles')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getVehicleFuelEfficiency(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return await this.fuelService.calculateVehicleFuelEfficiency(
      user.userId,
      user.role as UserRole,
      start,
      end,
    );
  }

  @Get('analysis/cost')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFuelCostAnalysis(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return await this.fuelService.generateFuelCostAnalysis(
      user.userId,
      user.role as UserRole,
      start,
      end,
    );
  }

  @Get('optimization/suggestions')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFuelOptimizationSuggestions(@CurrentUser() user: CurrentUserData) {
    return await this.fuelService.getFuelOptimizationSuggestions(user.userId, user.role as UserRole);
  }

  @Get('prices/trends')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFuelPriceTrends(
    @Query('location') location?: string,
    @Query('fuelType') fuelType?: 'diesel' | 'gasoline',
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : undefined;
    return await this.fuelService.getFuelPriceTrends(location, fuelType, daysNum);
  }
}