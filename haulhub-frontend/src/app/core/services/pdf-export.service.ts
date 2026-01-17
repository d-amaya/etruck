import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TripService } from './trip.service';
import { DashboardStateService, DashboardFilters } from '../../features/dispatcher/dashboard/dashboard-state.service';
import { Trip, TripStatus, TripFilters, calculateTripProfit } from '@haulhub/shared';
import { forkJoin, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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

    // Load all required data - fetch ALL trips by following pagination
    forkJoin({
      trips: this.fetchAllTrips(this.buildApiFilters(filters)),
      summaryByStatus: this.tripService.getTripSummaryByStatus(this.buildApiFilters(filters)),
      paymentSummary: this.tripService.getPaymentSummary(this.buildApiFilters(filters))
    }).subscribe({
      next: (data) => {
        this.generatePdf(data.trips, data.summaryByStatus, data.paymentSummary, filters);
      },
      error: (error) => {
        console.error('Error loading dashboard data for PDF export:', error);
        alert('Failed to export PDF. Please try again.');
      }
    });
  }

  private fetchAllTrips(filters: TripFilters): Observable<Trip[]> {
    const allTrips: Trip[] = [];
    
    const fetchPage = (lastKey?: string): Observable<Trip[]> => {
      const pageFilters = lastKey ? { ...filters, lastEvaluatedKey: lastKey } : filters;
      
      return this.tripService.getTrips(pageFilters).pipe(
        switchMap(response => {
          allTrips.push(...response.trips);
          
          // If there's more data, fetch the next page
          if (response.lastEvaluatedKey) {
            return fetchPage(response.lastEvaluatedKey);
          }
          
          // No more pages, return all trips
          return of(allTrips);
        })
      );
    };
    
    return fetchPage();
  }

  private generatePdf(
    trips: Trip[],
    summaryByStatus: Record<TripStatus, number>,
    paymentSummary: any,
    filters: DashboardFilters
  ): void {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Brand Colors (as tuples for jsPDF)
    const primaryBlue: [number, number, number] = [25, 118, 210]; // #1976d2
    const lightBlue: [number, number, number] = [227, 242, 253]; // #e3f2fd
    const darkGray: [number, number, number] = [66, 66, 66];
    const lightGray: [number, number, number] = [245, 245, 245];
    const profitGreen: [number, number, number] = [46, 125, 50]; // #2e7d32
    const lossRed: [number, number, number] = [211, 47, 47]; // #d32f2f

    let yPosition = 20;

    // ========== HEADER SECTION ==========
    // Add colored banner at top
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');

    // Company Name
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);

    // Report Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Dispatcher Dashboard Report', pageWidth / 2, 22, { align: 'center' });

    // Generation Date (top right)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPosition = 45;

    // ========== APPLIED FILTERS SECTION ==========
    const filterText = this.buildFilterText(filters);
    if (filterText) {
      doc.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
      doc.rect(14, yPosition - 5, pageWidth - 28, 12, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(filterText, pageWidth / 2, yPosition + 2, { align: 'center' });
      yPosition += 18;
    }

    // ========== SUMMARY CARDS SECTION ==========
    const cardWidth = (pageWidth - 28 - 30) / 4; // 4 cards with gaps
    const cardHeight = 25;
    const cardGap = 10;
    const cardY = yPosition;

    // Card 1: Total Trips
    this.drawSummaryCard(doc, 14, cardY, cardWidth, cardHeight, 
      'Total Trips', trips.length.toString(), primaryBlue);

    // Card 2: Total Revenue
    this.drawSummaryCard(doc, 14 + cardWidth + cardGap, cardY, cardWidth, cardHeight,
      'Total Revenue', this.formatCurrency(paymentSummary.totalBrokerPayments), profitGreen);

    // Card 3: Total Expenses
    this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 2, cardY, cardWidth, cardHeight,
      'Total Expenses', this.formatCurrency(paymentSummary.totalDriverPayments + paymentSummary.totalLorryOwnerPayments), lossRed);

    // Card 4: Net Profit
    const isProfit = paymentSummary.totalProfit >= 0;
    this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 3, cardY, cardWidth, cardHeight,
      isProfit ? 'Net Profit' : 'Net Loss', 
      this.formatCurrency(Math.abs(paymentSummary.totalProfit)), 
      isProfit ? profitGreen : lossRed);

    yPosition = cardY + cardHeight + 15;

    // ========== TRIP STATUS BREAKDOWN ==========
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text('Trip Status Breakdown', 14, yPosition);
    yPosition += 6;

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
      headStyles: { 
        fillColor: primaryBlue,
        textColor: [255, 255, 255], 
        fontStyle: 'bold',
        fontSize: 10
      },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14 },
      alternateRowStyles: { fillColor: lightGray }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // ========== TRIPS TABLE SECTION ==========
    if (trips.length > 0) {
      // Check if we need a new page
      if (yPosition > 150) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(`Trip Details (${trips.length} trips)`, 14, yPosition);
      yPosition += 6;

      const tripTableData = trips.map(trip => {
        const profit = this.calculateProfit(trip);
        return [
          this.formatDate(trip.scheduledPickupDatetime),
          this.truncateText(trip.pickupLocation, 20),
          this.truncateText(trip.dropoffLocation, 20),
          this.truncateText(trip.brokerName, 18),
          trip.lorryId,
          this.truncateText(trip.driverName, 18),
          this.getStatusLabel(trip.status),
          this.formatCurrency(trip.brokerPayment),
          this.formatCurrency(trip.driverPayment),
          this.formatCurrency(trip.lorryOwnerPayment),
          this.formatCurrency(profit)
        ];
      });

      autoTable(doc, {
        startY: yPosition,
        head: [['Date', 'Pickup', 'Dropoff', 'Broker', 'Truck', 'Driver', 'Status', 'Broker Pay', 'Driver Pay', 'Owner Pay', 'Profit']],
        body: tripTableData,
        theme: 'striped',
        headStyles: { 
          fillColor: primaryBlue,
          textColor: [255, 255, 255], 
          fontStyle: 'bold', 
          fontSize: 8,
          halign: 'center'
        },
        styles: { 
          fontSize: 7, 
          cellPadding: 2,
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 26 },
          2: { cellWidth: 26 },
          3: { cellWidth: 20 },
          4: { cellWidth: 16 },
          5: { cellWidth: 20 },
          6: { cellWidth: 18, halign: 'center' },
          7: { cellWidth: 20, halign: 'right' },
          8: { cellWidth: 20, halign: 'right' },
          9: { cellWidth: 20, halign: 'right' },
          10: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: lightGray },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          // Color profit column based on value
          if (data.column.index === 10 && data.section === 'body') {
            const profitText = data.cell.text[0];
            if (profitText && profitText.includes('-')) {
              data.cell.styles.textColor = lossRed;
            } else {
              data.cell.styles.textColor = profitGreen;
            }
          }
          
          // Color status column
          if (data.column.index === 6 && data.section === 'body') {
            const status = data.cell.text[0];
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 7;
          }
        }
      });
    } else {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('No trips found matching the selected filters.', 14, yPosition);
    }

    // ========== FOOTER ON EACH PAGE ==========
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Footer line
      doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.setLineWidth(0.5);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
      // Footer text
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('eTrucky - Transportation Management System', 14, pageHeight - 10);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }

    // Save PDF
    const filename = this.generateFilename(filters);
    doc.save(filename);
  }

  /**
   * Draw a summary card with icon, label, and value
   */
  private drawSummaryCard(
    doc: jsPDF, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    label: string, 
    value: string,
    color: [number, number, number]
  ): void {
    // Card background
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    // Colored top border
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, width, 3, 'F');
    
    // Label
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + width / 2, y + 12, { align: 'center' });
    
    // Value
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, x + width / 2, y + 20, { align: 'center' });
  }

  /**
   * Truncate text to fit in cell
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
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
    return calculateTripProfit(trip);
  }

  /**
   * Draw a professional truck logo using vector shapes
   */
  private drawTruckLogo(doc: jsPDF, x: number, y: number, scale: number, color: [number, number, number]): void {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.3);
    
    // Truck cabin (front)
    doc.roundedRect(x, y + 3*scale, 3*scale, 5*scale, 0.5*scale, 0.5*scale, 'FD');
    
    // Truck cargo box (back)
    doc.roundedRect(x + 3*scale, y + 1*scale, 7*scale, 7*scale, 0.5*scale, 0.5*scale, 'FD');
    
    // Wheels
    doc.circle(x + 1.5*scale, y + 8.5*scale, 1.2*scale, 'FD');
    doc.circle(x + 5*scale, y + 8.5*scale, 1.2*scale, 'FD');
    doc.circle(x + 8*scale, y + 8.5*scale, 1.2*scale, 'FD');
    
    // Window detail on cabin
    const primaryBlue: [number, number, number] = [25, 118, 210];
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(x + 0.5*scale, y + 3.5*scale, 2*scale, 2*scale, 'F');
    
    // Cargo door lines for detail
    doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.setLineWidth(0.5);
    doc.line(x + 6*scale, y + 2*scale, x + 6*scale, y + 7*scale);
  }
}
