import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DriverDashboardStateService } from './driver-dashboard-state.service';
import { DriverAssetCacheService } from './driver-asset-cache.service';
import { Trip, TripStatus } from '../../../core/services/trip.service';

@Injectable({
  providedIn: 'root'
})
export class DriverPdfExportService {
  constructor(
    private dashboardState: DriverDashboardStateService,
    private assetCache: DriverAssetCacheService
  ) {}

  exportDashboard(): void {
    // Get current dashboard data and cached assets
    const dashboardData = this.dashboardState['dashboardDataSubject'].value;
    const cache = this.assetCache['cacheSubject'].value;
    const filters = this.dashboardState['filtersSubject'].value;

    if (!dashboardData || !cache) {
      alert('Please wait for data to load before exporting.');
      return;
    }

    // Use the currently displayed trips (filtered and paginated data)
    // Get all trips by fetching without pagination
    const allFilters = { ...filters, limit: 1000 };
    
    // For now, use the dashboard data we have
    // TODO: Fetch all filtered trips if we want complete data beyond current page
    this.generatePdf(
      dashboardData.trips,
      dashboardData.chartAggregates.statusSummary,
      dashboardData.chartAggregates.paymentSummary,
      cache,
      filters
    );
  }

  private generatePdf(
    trips: Trip[],
    summaryByStatus: Record<TripStatus, number>,
    paymentSummary: any,
    cache: any,
    filters: any
  ): void {
    // Use cached assets
    const truckMap = cache.trucks;
    const trailerMap = cache.trailers;
    const dispatcherMap = cache.dispatchers;

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Brand Colors
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const lightBlue: [number, number, number] = [227, 242, 253];
    const lightGray: [number, number, number] = [245, 245, 245];
    const profitGreen: [number, number, number] = [46, 125, 50];

    let yPosition = 20;

    // ========== HEADER SECTION ==========
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Driver Dashboard Report', pageWidth / 2, 22, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPosition = 45;

    // ========== APPLIED FILTERS SECTION ==========
    const filterText = this.buildFilterText(filters, truckMap);
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
    const cardWidth = (pageWidth - 28 - 20) / 3;
    const cardHeight = 25;
    const cardGap = 10;
    const cardY = yPosition;

    // Recalculate from visible trips (not from paymentSummary which includes all trips)
    const visibleTripCount = trips.length;
    const visibleTotalPayment = trips.reduce((sum, trip) => sum + (trip.driverPayment || 0), 0);
    const visibleAvgPayment = visibleTripCount > 0 ? visibleTotalPayment / visibleTripCount : 0;

    // Card 1: Total Trips
    this.drawSummaryCard(doc, 14, cardY, cardWidth, cardHeight, 
      'Total Orders', visibleTripCount.toString(), primaryBlue);

    // Card 2: Total Driver Payment
    this.drawSummaryCard(doc, 14 + cardWidth + cardGap, cardY, cardWidth, cardHeight,
      'Total Payment', this.formatCurrency(visibleTotalPayment), profitGreen);

    // Card 3: Average Payment per Trip
    this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 2, cardY, cardWidth, cardHeight,
      'Avg Payment/Order', this.formatCurrency(visibleAvgPayment), profitGreen);

    yPosition = cardY + cardHeight + 15;

    // ========== TRIP STATUS BREAKDOWN ==========
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text('Order Status Breakdown', 14, yPosition);
    yPosition += 6;

    // Recalculate status summary from visible trips
    const visibleStatusSummary: Record<string, number> = {};
    trips.forEach(trip => {
      const status = trip.orderStatus || 'Scheduled';
      visibleStatusSummary[status] = (visibleStatusSummary[status] || 0) + 1;
    });

    const summaryData = [
      ['Scheduled', visibleStatusSummary['Scheduled'] || 0],
      ['Picked Up', visibleStatusSummary['Picked Up'] || 0],
      ['In Transit', visibleStatusSummary['In Transit'] || 0],
      ['Delivered', visibleStatusSummary['Delivered'] || 0],
      ['Paid', visibleStatusSummary['Paid'] || 0]
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
      if (yPosition > 150) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(`Order Details (${trips.length} orders)`, 14, yPosition);
      yPosition += 6;

      const tripTableData = trips.map(trip => {
        const pickupLocation = trip.pickupCity && trip.pickupState ? `${trip.pickupCity}, ${trip.pickupState}` : '';
        const dropoffLocation = trip.deliveryCity && trip.deliveryState ? `${trip.deliveryCity}, ${trip.deliveryState}` : '';
        
        // Use same logic as trip table display methods
        const truck = truckMap.get(trip.truckId);
        const truckPlate = truck?.plate || trip.truckId;
        
        const trailer = trailerMap.get(trip.trailerId);
        const trailerPlate = trailer?.plate || trip.trailerId || 'N/A';
        
        const dispatcher = dispatcherMap.get(trip.dispatcherId);
        const dispatcherName = dispatcher?.name || trip.dispatcherId;
        
        return [
          this.getStatusLabel(trip.orderStatus as any),
          this.formatDate(trip.scheduledTimestamp),
          this.truncateText(pickupLocation, 25),
          this.truncateText(dropoffLocation, 25),
          this.truncateText(dispatcherName, 20),
          this.truncateText(truckPlate, 14),
          this.truncateText(trailerPlate, 14),
          this.formatCurrency(trip.driverPayment || 0)
        ];
      });

      autoTable(doc, {
        startY: yPosition,
        head: [['Status', 'Date', 'Pickup', 'Delivery', 'Dispatcher', 'Truck', 'Trailer', 'Payment']],
        body: tripTableData,
        theme: 'striped',
        headStyles: { 
          fillColor: primaryBlue,
          textColor: [255, 255, 255], 
          fontStyle: 'bold', 
          fontSize: 9,
          halign: 'center'
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 2,
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 24 },
          2: { cellWidth: 32 },
          3: { cellWidth: 32 },
          4: { cellWidth: 26 },
          5: { cellWidth: 18 },
          6: { cellWidth: 18 },
          7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: lightGray },
        margin: { left: 14, right: 14 }
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
      
      doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.setLineWidth(0.5);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
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
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, width, 3, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + width / 2, y + 12, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, x + width / 2, y + 20, { align: 'center' });
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  }

  private buildFilterText(filters: any, truckMap: Map<string, any>): string {
    const parts: string[] = [];

    if (filters.dateRange.startDate || filters.dateRange.endDate) {
      const start = filters.dateRange.startDate ? this.formatDate(filters.dateRange.startDate.toISOString()) : 'Beginning';
      const end = filters.dateRange.endDate ? this.formatDate(filters.dateRange.endDate.toISOString()) : 'Now';
      parts.push(`Date Range: ${start} - ${end}`);
    }

    if (filters.status) {
      parts.push(`Status: ${this.getStatusLabel(filters.status)}`);
    }

    if (filters.truckId) {
      const truck = truckMap.get(filters.truckId);
      const truckPlate = truck?.plate || filters.truckId;
      parts.push(`Truck: ${truckPlate}`);
    }

    return parts.length > 0 ? `Filters: ${parts.join(' | ')}` : '';
  }

  private generateFilename(filters: any): string {
    const timestamp = new Date().toISOString().split('T')[0];
    let filename = `driver-report-${timestamp}`;

    if (filters.dateRange.startDate && filters.dateRange.endDate) {
      const start = filters.dateRange.startDate.toISOString().split('T')[0];
      const end = filters.dateRange.endDate.toISOString().split('T')[0];
      filename = `driver-report-${start}-to-${end}`;
    }

    return `${filename}.pdf`;
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
      [TripStatus.Canceled]: 'Canceled',
      WaitingRC: 'Waiting RC'
    };
    return labels[status] || status;
  }
}
