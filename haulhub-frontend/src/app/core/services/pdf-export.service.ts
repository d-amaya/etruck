import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TripService } from './trip.service';
import { DashboardStateService, DashboardFilters } from '../../features/dispatcher/dashboard/dashboard-state.service';
import { Trip, TripStatus, TripFilters } from '@haulhub/shared';
import { forkJoin } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PdfExportService {
  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService
  ) {}

  exportDashboard(): void {
    const filters = this.dashboardState['filtersSubject'].value;

    // Load all required data
    forkJoin({
      tripsResponse: this.tripService.getTrips(this.buildApiFilters(filters)),
      summaryByStatus: this.tripService.getTripSummaryByStatus(this.buildApiFilters(filters)),
      paymentSummary: this.tripService.getPaymentSummary(this.buildApiFilters(filters))
    }).subscribe({
      next: (data) => {
        this.generatePdf(data.tripsResponse.trips, data.summaryByStatus, data.paymentSummary, filters);
      },
      error: (error) => {
        console.error('Error loading dashboard data for PDF export:', error);
        alert('Failed to export PDF. Please try again.');
      }
    });
  }

  private generatePdf(
    trips: Trip[],
    summaryByStatus: Record<TripStatus, number>,
    paymentSummary: any,
    filters: DashboardFilters
  ): void {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Dispatcher Dashboard Report', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    // Applied Filters
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const filterText = this.buildFilterText(filters);
    if (filterText) {
      doc.text(filterText, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;
    }

    // Generation Date
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Trip Summary Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Trip Summary by Status', 14, yPosition);
    yPosition += 8;

    const summaryData = [
      ['Scheduled', summaryByStatus[TripStatus.Scheduled] || 0],
      ['Picked Up', summaryByStatus[TripStatus.PickedUp] || 0],
      ['In Transit', summaryByStatus[TripStatus.InTransit] || 0],
      ['Delivered', summaryByStatus[TripStatus.Delivered] || 0],
      ['Paid', summaryByStatus[TripStatus.Paid] || 0]
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Status', 'Count']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14 }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Payment Summary Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Summary', 14, yPosition);
    yPosition += 8;

    const paymentData = [
      ['Broker Payments', this.formatCurrency(paymentSummary.totalBrokerPayments)],
      ['Driver Payments', this.formatCurrency(paymentSummary.totalDriverPayments)],
      ['Lorry Owner Payments', this.formatCurrency(paymentSummary.totalLorryOwnerPayments)],
      ['Profit', this.formatCurrency(paymentSummary.totalProfit)]
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Category', 'Amount']],
      body: paymentData,
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60, halign: 'right' }
      },
      margin: { left: 14 }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Trips Table Section
    if (trips.length > 0) {
      // Check if we need a new page
      if (yPosition > 150) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Trips (${trips.length} total)`, 14, yPosition);
      yPosition += 8;

      const tripTableData = trips.map(trip => [
        this.formatDate(trip.scheduledPickupDatetime),
        trip.pickupLocation,
        trip.dropoffLocation,
        trip.brokerName,
        trip.lorryId,
        trip.driverName,
        this.getStatusLabel(trip.status),
        this.formatCurrency(trip.brokerPayment),
        this.formatCurrency(this.calculateProfit(trip))
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['Date', 'Pickup', 'Dropoff', 'Broker', 'Lorry', 'Driver', 'Status', 'Broker Pay', 'Profit']],
        body: tripTableData,
        theme: 'striped',
        headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
          6: { cellWidth: 20 },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 22, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });
    } else {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('No trips found matching the selected filters.', 14, yPosition);
    }

    // Save PDF
    const filename = this.generateFilename(filters);
    doc.save(filename);
  }

  private buildFilterText(filters: DashboardFilters): string {
    const parts: string[] = [];

    if (filters.dateRange.startDate || filters.dateRange.endDate) {
      const start = filters.dateRange.startDate ? this.formatDate(filters.dateRange.startDate.toISOString()) : 'Beginning';
      const end = filters.dateRange.endDate ? this.formatDate(filters.dateRange.endDate.toISOString()) : 'Now';
      parts.push(`Date Range: ${start} - ${end}`);
    }

    if (filters.status) {
      parts.push(`Status: ${this.getStatusLabel(filters.status)}`);
    }

    if (filters.brokerId) {
      const broker = this.dashboardState.getBrokers().find(b => b.brokerId === filters.brokerId);
      if (broker) {
        parts.push(`Broker: ${broker.brokerName}`);
      }
    }

    if (filters.lorryId) {
      parts.push(`Lorry: ${filters.lorryId}`);
    }

    if (filters.driverName) {
      parts.push(`Driver: ${filters.driverName}`);
    }

    return parts.length > 0 ? `Filters: ${parts.join(' | ')}` : '';
  }

  private generateFilename(filters: DashboardFilters): string {
    const timestamp = new Date().toISOString().split('T')[0];
    let filename = `dashboard-report-${timestamp}`;

    if (filters.dateRange.startDate && filters.dateRange.endDate) {
      const start = filters.dateRange.startDate.toISOString().split('T')[0];
      const end = filters.dateRange.endDate.toISOString().split('T')[0];
      filename = `dashboard-report-${start}-to-${end}`;
    }

    return `${filename}.pdf`;
  }

  private buildApiFilters(filters: DashboardFilters): TripFilters {
    const apiFilters: TripFilters = {};

    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }
    if (filters.status) {
      apiFilters.status = filters.status;
    }
    if (filters.brokerId) {
      apiFilters.brokerId = filters.brokerId;
    }
    if (filters.lorryId) {
      apiFilters.lorryId = filters.lorryId;
    }
    if (filters.driverName) {
      apiFilters.driverName = filters.driverName;
    }

    return apiFilters;
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  private getStatusLabel(status: TripStatus): string {
    const labels: Record<TripStatus, string> = {
      [TripStatus.Scheduled]: 'Scheduled',
      [TripStatus.PickedUp]: 'Picked Up',
      [TripStatus.InTransit]: 'In Transit',
      [TripStatus.Delivered]: 'Delivered',
      [TripStatus.Paid]: 'Paid',
      [TripStatus.Canceled]: 'Canceled'
    };
    return labels[status] || status;
  }

  private calculateProfit(trip: Trip): number {
    return trip.brokerPayment - trip.driverPayment - trip.lorryOwnerPayment;
  }
}
