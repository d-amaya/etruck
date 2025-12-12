import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeesService, CreateFeeDto } from './fees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Post()
  @Roles(UserRole.Dispatcher, UserRole.Driver)
  async recordFee(
    @CurrentUser() user: CurrentUserData,
    @Body() createFeeDto: CreateFeeDto,
  ) {
    return await this.feesService.recordFee(user.userId, user.role as UserRole, createFeeDto);
  }

  @Get('trips/:tripId')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
  async getTripFees(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.feesService.getTripFees(tripId, user.userId, user.role as UserRole);
  }

  @Get('summary')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getFeesSummary(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.feesService.getFeesSummary(user.userId, user.role as UserRole, start, end);
  }

  @Get('lumper/statistics')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getLumperFeeStatistics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.feesService.getLumperFeeStatistics(user.userId, user.role as UserRole, start, end);
  }

  @Get('detention/statistics')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getDetentionChargeStatistics(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.feesService.getDetentionChargeStatistics(user.userId, user.role as UserRole, start, end);
  }

  @Put(':feeId')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async updateFee(
    @Param('feeId') feeId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() updateData: Partial<CreateFeeDto>,
  ) {
    return await this.feesService.updateFee(feeId, user.userId, user.role as UserRole, updateData);
  }

  @Delete(':feeId')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async deleteFee(
    @Param('feeId') feeId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.feesService.deleteFee(feeId, user.userId, user.role as UserRole);
  }
}