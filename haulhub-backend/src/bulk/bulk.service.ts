import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import {
  BulkStatusUpdateDto,
  BulkPaymentProcessDto,
  BulkExportDto,
  ExportFormat,
  ExportType,
} from './dto';
import { UserRole, TripStatus, Trip } from '@haulhub/shared';
import { GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{ id: string; error: string }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

@Injectable()
export class BulkService {
  private readonly tripsTableName: string;

  constructor(
    private readonly tripsService: TripsService,
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.tripsTableName = this.configService.tripsTableName;
  }

  /**
   * Bulk update trip statuses
   * Requirements: 11.4 - Filtering and sorting by detailed status categories
   * 
   * Validates that:
   * - User has permission to update each trip
   * - Status transitions are valid
   * - Trips exist
   */
  async bulkUpdateStatus(
    userId: string,
    userRole: UserRole,
    dto: BulkStatusUpdateDto,
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
    };

    // Validate maximum batch size
    if (dto.tripIds.length > 100) {
      throw new BadRequestException('Maximum 100 trips can be updated at once');
    }

    // Process each trip
    for (const tripId of dto.tripIds) {
      result.totalProcessed++;
      
      try {
        // Update trip status using existing service method
        await this.tripsService.updateTripStatus(
          tripId,
          userId,
          userRole,
          dto.status,
        );
        
        result.successful.push(tripId);
        result.successCount++;
      } catch (error: any) {
        result.failed.push({
          id: tripId,
          error: error.message || 'Unknown error',
        });
        result.failureCount++;
      }
    }

    return result;
  }

  /**
   * Bulk process payments for trips
   * Requirements: 15.5 - Aging reports for invoices, advances, and outstanding payments
   * 
   * Marks trips as paid and records payment information
   */
  async bulkProcessPayments(
    userId: string,
    userRole: UserRole,
    dto: BulkPaymentProcessDto,
  ): Promise<BulkOperationResult> {
    // Only dispatchers can process payments
    if (userRole !== UserRole.Dispatcher) {
      throw new ForbiddenException('Only dispatchers can process payments');
    }

    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
    };

    // Validate maximum batch size
    if (dto.tripIds.length > 100) {
      throw new BadRequestException('Maximum 100 trips can be processed at once');
    }

    // Process each trip
    for (const tripId of dto.tripIds) {
      result.totalProcessed++;
      
      try {
        // First verify the trip belongs to this dispatcher
        const trip = await this.tripsService.getTripById(tripId, userId, userRole);
        
        // Verify trip is in Delivered status
        if (trip.status !== TripStatus.Delivered) {
          throw new BadRequestException('Trip must be in Delivered status to process payment');
        }

        // Update trip status to Paid
        await this.tripsService.updateTripStatus(
          tripId,
          userId,
          userRole,
          TripStatus.Paid,
        );
        
        result.successful.push(tripId);
        result.successCount++;
      } catch (error: any) {
        result.failed.push({
          id: tripId,
          error: error.message || 'Unknown error',
        });
        result.failureCount++;
      }
    }

    return result;
  }

  /**
   * Bulk export data in various formats
   * Requirements: 18.5 - Downloadable reports in CSV and PDF formats
   * 
   * Supports exporting:
   * - Trips data
   * - Payment reports
   * - Analytics data
   * - Document lists
   */
  async bulkExport(
    userId: string,
    userRole: UserRole,
    dto: BulkExportDto,
  ): Promise<{ data: string; filename: string; contentType: string }> {
    // Get data based on export type
    let data: any[];
    
    switch (dto.exportType) {
      case ExportType.TRIPS:
        data = await this.getTripsForExport(userId, userRole, dto);
        break;
      case ExportType.PAYMENTS:
        data = await this.getPaymentsForExport(userId, userRole, dto);
        break;
      case ExportType.ANALYTICS:
        data = await this.getAnalyticsForExport(userId, userRole, dto);
        break;
      case ExportType.DOCUMENTS:
        data = await this.getDocumentsForExport(userId, userRole, dto);
        break;
      default:
        throw new BadRequestException('Invalid export type');
    }

    // Format data based on requested format
    switch (dto.format) {
      case ExportFormat.CSV:
        return this.formatAsCSV(data, dto.exportType);
      case ExportFormat.JSON:
        return this.formatAsJSON(data, dto.exportType);
      case ExportFormat.PDF:
        return this.formatAsPDF(data, dto.exportType);
      default:
        throw new BadRequestException('Invalid export format');
    }
  }

  /**
   * Get trips data for export
   */
  private async getTripsForExport(
    userId: string,
    userRole: UserRole,
    dto: BulkExportDto,
  ): Promise<any[]> {
    const filters: any = {};
    
    if (dto.startDate) filters.startDate = dto.startDate;
    if (dto.endDate) filters.endDate = dto.endDate;
    if (dto.brokerId) filters.brokerId = dto.brokerId;
    if (dto.driverId) filters.driverId = dto.driverId;
    if (dto.lorryId) filters.lorryId = dto.lorryId;
    if (dto.statuses) filters.status = dto.statuses;
    
    // Get all trips (paginate if needed)
    const result = await this.tripsService.getTrips(userId, userRole, filters);
    
    return result.trips;
  }

  /**
   * Get payments data for export
   */
  private async getPaymentsForExport(
    userId: string,
    userRole: UserRole,
    dto: BulkExportDto,
  ): Promise<any[]> {
    const filters: any = {};
    
    if (dto.startDate) filters.startDate = dto.startDate;
    if (dto.endDate) filters.endDate = dto.endDate;
    if (dto.brokerId) filters.brokerId = dto.brokerId;
    if (dto.driverId) filters.driverId = dto.driverId;
    if (dto.lorryId) filters.lorryId = dto.lorryId;
    
    // Get payment report
    const report = await this.tripsService.getPaymentReport(userId, userRole, filters);
    
    // Convert report to array format for export
    return this.convertPaymentReportToArray(report);
  }

  /**
   * Get analytics data for export
   */
  private async getAnalyticsForExport(
    userId: string,
    userRole: UserRole,
    dto: BulkExportDto,
  ): Promise<any[]> {
    const filters: any = {};
    
    if (dto.startDate) filters.startDate = dto.startDate;
    if (dto.endDate) filters.endDate = dto.endDate;
    
    // Get payment summary for analytics
    const summary = await this.tripsService.getPaymentSummary(userId, filters);
    
    // Convert summary to array format
    return [
      {
        metric: 'Total Broker Payments',
        value: summary.totalBrokerPayments,
      },
      {
        metric: 'Total Driver Payments',
        value: summary.totalDriverPayments,
      },
      {
        metric: 'Total Lorry Owner Payments',
        value: summary.totalLorryOwnerPayments,
      },
      {
        metric: 'Total Lumper Fees',
        value: summary.totalLumperFees,
      },
      {
        metric: 'Total Detention Fees',
        value: summary.totalDetentionFees,
      },
      {
        metric: 'Total Additional Fees',
        value: summary.totalAdditionalFees,
      },
      {
        metric: 'Total Profit',
        value: summary.totalProfit,
      },
    ];
  }

  /**
   * Get documents data for export
   */
  private async getDocumentsForExport(
    userId: string,
    userRole: UserRole,
    dto: BulkExportDto,
  ): Promise<any[]> {
    // This would integrate with DocumentsService
    // For now, return placeholder
    return [];
  }

  /**
   * Convert payment report to array format
   */
  private convertPaymentReportToArray(report: any): any[] {
    const result: any[] = [];
    
    if (report.trips) {
      report.trips.forEach((trip: any) => {
        result.push({
          tripId: trip.tripId,
          pickupLocation: trip.pickupLocation,
          dropoffLocation: trip.dropoffLocation,
          scheduledDate: trip.scheduledPickupDatetime,
          status: trip.status,
          brokerPayment: trip.brokerPayment,
          driverPayment: trip.driverPayment,
          lorryOwnerPayment: trip.lorryOwnerPayment,
          lumperFees: trip.lumperFees || 0,
          detentionFees: trip.detentionFees || 0,
          distance: trip.distance,
        });
      });
    }
    
    return result;
  }

  /**
   * Format data as CSV
   */
  private formatAsCSV(
    data: any[],
    exportType: ExportType,
  ): { data: string; filename: string; contentType: string } {
    if (data.length === 0) {
      return {
        data: '',
        filename: `${exportType}_${Date.now()}.csv`,
        contentType: 'text/csv',
      };
    }

    // Get headers from first object
    const headers = Object.keys(data[0]);
    
    // Build CSV content
    let csv = headers.join(',') + '\n';
    
    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      });
      csv += values.join(',') + '\n';
    });

    return {
      data: csv,
      filename: `${exportType}_${Date.now()}.csv`,
      contentType: 'text/csv',
    };
  }

  /**
   * Format data as JSON
   */
  private formatAsJSON(
    data: any[],
    exportType: ExportType,
  ): { data: string; filename: string; contentType: string } {
    return {
      data: JSON.stringify(data, null, 2),
      filename: `${exportType}_${Date.now()}.json`,
      contentType: 'application/json',
    };
  }

  /**
   * Format data as PDF
   * Note: This is a placeholder. In production, use a PDF library like pdfkit or puppeteer
   */
  private formatAsPDF(
    data: any[],
    exportType: ExportType,
  ): { data: string; filename: string; contentType: string } {
    // For now, return a simple text representation
    // In production, implement proper PDF generation
    const textContent = JSON.stringify(data, null, 2);
    
    return {
      data: textContent,
      filename: `${exportType}_${Date.now()}.pdf`,
      contentType: 'application/pdf',
    };
  }
}
