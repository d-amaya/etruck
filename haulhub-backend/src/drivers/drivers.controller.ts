import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  UpdateEnhancedDriverDto,
  UserRole,
  ValidateCDLDto,
  ValidateBankingDto,
  RecordAdvanceDto,
} from '@haulhub/shared';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /**
   * GET /drivers/profile
   * Get current driver's enhanced profile from DynamoDB
   */
  @Get('profile')
  @Roles(UserRole.Driver)
  async getDriverProfile(@CurrentUser() user: CurrentUserData) {
    return this.driversService.getEnhancedDriverProfile(user.userId);
  }

  /**
   * PATCH /drivers/profile
   * Update current driver's enhanced profile
   * Drivers can only update their own profile
   */
  @Patch('profile')
  @Roles(UserRole.Driver)
  async updateDriverProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() updateDto: UpdateEnhancedDriverDto,
  ) {
    return this.driversService.updateEnhancedDriverProfile(user.userId, updateDto);
  }

  /**
   * GET /drivers/:id/profile
   * Get any driver's enhanced profile (Admin and Dispatcher only)
   */
  @Get(':id/profile')
  @Roles(UserRole.Admin, UserRole.Dispatcher)
  async getDriverById(@Param('id') driverId: string) {
    return this.driversService.getEnhancedDriverProfile(driverId);
  }

  /**
   * PATCH /drivers/:id/profile
   * Update any driver's enhanced profile (Admin only)
   */
  @Patch(':id/profile')
  @Roles(UserRole.Admin)
  async updateDriverById(
    @Param('id') driverId: string,
    @Body() updateDto: UpdateEnhancedDriverDto,
  ) {
    return this.driversService.updateEnhancedDriverProfile(driverId, updateDto);
  }

  /**
   * GET /drivers/profile/payments
   * Get current driver's payment history
   */
  @Get('profile/payments')
  @Roles(UserRole.Driver)
  async getDriverPayments(
    @CurrentUser() user: CurrentUserData,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.driversService.getDriverPaymentHistory(user.userId, startDate, endDate);
  }

  /**
   * GET /drivers/:id/payments
   * Get any driver's payment history (Admin and Dispatcher only)
   */
  @Get(':id/payments')
  @Roles(UserRole.Admin, UserRole.Dispatcher)
  async getDriverPaymentsById(
    @Param('id') driverId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.driversService.getDriverPaymentHistory(driverId, startDate, endDate);
  }

  /**
   * GET /drivers/profile/advances
   * Get current driver's advance tracking
   */
  @Get('profile/advances')
  @Roles(UserRole.Driver)
  async getDriverAdvances(@CurrentUser() user: CurrentUserData) {
    return this.driversService.getDriverAdvances(user.userId);
  }

  /**
   * GET /drivers/:id/advances
   * Get any driver's advance tracking (Admin and Dispatcher only)
   */
  @Get(':id/advances')
  @Roles(UserRole.Admin, UserRole.Dispatcher)
  async getDriverAdvancesById(@Param('id') driverId: string) {
    return this.driversService.getDriverAdvances(driverId);
  }

  /**
   * POST /drivers/profile/advances
   * Record advance payment for current driver (Admin and Dispatcher only)
   */
  @Post('profile/advances')
  @Roles(UserRole.Admin, UserRole.Dispatcher)
  async recordDriverAdvance(
    @CurrentUser() user: CurrentUserData,
    @Body() advanceDto: RecordAdvanceDto,
  ) {
    // For current user context, we need to determine the driver ID
    // This endpoint is for dispatchers/admins to record advances for drivers
    if (!advanceDto.driverId) {
      throw new BadRequestException('Driver ID is required');
    }
    return this.driversService.recordDriverAdvance(advanceDto.driverId, advanceDto);
  }

  /**
   * POST /drivers/:id/advances
   * Record advance payment for specific driver (Admin and Dispatcher only)
   */
  @Post(':id/advances')
  @Roles(UserRole.Admin, UserRole.Dispatcher)
  async recordDriverAdvanceById(
    @Param('id') driverId: string,
    @Body() advanceDto: RecordAdvanceDto,
  ) {
    return this.driversService.recordDriverAdvance(driverId, advanceDto);
  }

  /**
   * POST /drivers/validate/cdl
   * Validate CDL information (utility endpoint)
   */
  @Get('validate/cdl')
  async validateCDL(@Query() cdlInfo: ValidateCDLDto) {
    return this.driversService.validateCDLInfo(cdlInfo);
  }

  /**
   * POST /drivers/validate/banking
   * Validate banking information (utility endpoint)
   */
  @Get('validate/banking')
  async validateBanking(@Query() bankingInfo: ValidateBankingDto) {
    return this.driversService.validateBankingInfo(bankingInfo);
  }
}