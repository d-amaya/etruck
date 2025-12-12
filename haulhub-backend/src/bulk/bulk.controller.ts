import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { BulkService } from './bulk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import {
  BulkStatusUpdateDto,
  BulkPaymentProcessDto,
  BulkExportDto,
} from './dto';
import { UserRole } from '@haulhub/shared';

@Controller('bulk')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}

  /**
   * POST /bulk/status-update
   * Bulk update trip statuses
   * Requirements: 11.4 - Filtering and sorting by detailed status categories
   * 
   * Dispatchers can update any trips they own
   * Drivers can only update trips assigned to them (limited status transitions)
   */
  @Post('status-update')
  @Roles(UserRole.Dispatcher, UserRole.Driver)
  async bulkUpdateStatus(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BulkStatusUpdateDto,
  ) {
    return this.bulkService.bulkUpdateStatus(
      user.userId,
      user.role as UserRole,
      dto,
    );
  }

  /**
   * POST /bulk/process-payments
   * Bulk process payments for trips
   * Requirements: 15.5 - Aging reports for invoices, advances, and outstanding payments
   * 
   * Dispatcher only - marks trips as paid
   */
  @Post('process-payments')
  @Roles(UserRole.Dispatcher)
  async bulkProcessPayments(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BulkPaymentProcessDto,
  ) {
    return this.bulkService.bulkProcessPayments(
      user.userId,
      user.role as UserRole,
      dto,
    );
  }

  /**
   * POST /bulk/export
   * Bulk export data in various formats
   * Requirements: 18.5 - Downloadable reports in CSV and PDF formats
   * 
   * Supports CSV, JSON, and PDF formats
   * Exports trips, payments, analytics, or documents
   */
  @Post('export')
  @Roles(UserRole.Dispatcher, UserRole.Driver, UserRole.LorryOwner)
  async bulkExport(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BulkExportDto,
    @Res() res: Response,
  ) {
    const result = await this.bulkService.bulkExport(
      user.userId,
      user.role as UserRole,
      dto,
    );

    // Set response headers for file download
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    
    return res.send(result.data);
  }
}
