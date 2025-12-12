import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('financial')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('trips/:tripId/mileage-breakdown')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
  async getMileageBreakdown(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.financialService.calculateMileageBreakdown(tripId, user.userId, user.role as UserRole);
  }

  @Get('trips/:tripId/financial-breakdown')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
  async getFinancialBreakdown(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.financialService.calculateFinancialBreakdown(tripId, user.userId, user.role as UserRole);
  }

  @Get('drivers/:driverId/trips/:tripId/payment-calculation')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getDriverPaymentCalculation(
    @Param('driverId') driverId: string,
    @Param('tripId') tripId: string,
  ) {
    return await this.financialService.calculateDriverPayment(tripId, driverId);
  }

  @Get('outstanding-payments')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getOutstandingPayments(@CurrentUser() user: CurrentUserData) {
    return await this.financialService.getOutstandingPayments(user.userId, user.role as UserRole);
  }

  @Get('fuel-efficiency')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFuelEfficiency(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.financialService.calculateFuelEfficiency(user.userId, user.role as UserRole, start, end);
  }

  @Get('revenue-analysis')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getRevenueAnalysis(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.financialService.generateRevenueAnalysis(user.userId, user.role as UserRole, start, end);
  }
}