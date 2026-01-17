import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { Trip, TripStatus, UserRole } from '@haulhub/shared';

export interface InvoiceStatus {
  invoiceId: string;
  tripId: string;
  amount: number;
  dueDate: Date;
  status: 'pending' | 'paid' | 'overdue' | 'disputed';
  daysOverdue?: number;
}

export interface OutstandingPayments {
  totalOutstanding: number;
  overdueAmount: number;
  currentAmount: number;
  invoices: InvoiceStatus[];
}

@Injectable()
export class FinancialService {
  constructor(
    private readonly tripsService: TripsService,
  ) {}

  /**
   * Get outstanding payments and invoice status
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  async getOutstandingPayments(userId: string, userRole: UserRole): Promise<OutstandingPayments> {
    // Get all trips for the user
    const { trips } = await this.tripsService.getTrips(userId, userRole, {});

    // Filter trips that are delivered but not paid
    const unpaidTrips = trips.filter(trip => 
      trip.status === TripStatus.Delivered && 
      trip.deliveredAt
    );

    const invoices: InvoiceStatus[] = unpaidTrips.map(trip => {
      const dueDate = new Date(trip.deliveredAt!);
      dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms

      const now = new Date();
      const isOverdue = now > dueDate;
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : undefined;

      let status: 'pending' | 'paid' | 'overdue' | 'disputed' = 'pending';
      if (isOverdue) {
        status = 'overdue';
      }

      return {
        invoiceId: `INV-${trip.tripId}`,
        tripId: trip.tripId,
        amount: trip.brokerPayment,
        dueDate,
        status,
        daysOverdue,
      };
    });

    const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const overdueAmount = invoices
      .filter(invoice => invoice.status === 'overdue')
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const currentAmount = totalOutstanding - overdueAmount;

    return {
      totalOutstanding,
      overdueAmount,
      currentAmount,
      invoices,
    };
  }
}
