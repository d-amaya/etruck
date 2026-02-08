import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';
import { DispatcherPaymentReport } from '@haulhub/shared';
import { CarrierFilterService } from '../shared/carrier-filter.service';

@Component({
  selector: 'app-carrier-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './payment-report.component.html',
  styleUrls: ['./payment-report.component.scss']
})
export class CarrierPaymentReportComponent implements OnInit, OnDestroy {
  @Input() isWrapped = false;
  
  private destroy$ = new Subject<void>();
  report: DispatcherPaymentReport | null = null;
  loading = false;
  activeTabIndex = 0;

  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  truckColumns: string[] = ['truckName', 'totalPayment', 'tripCount'];
  
  enrichedDriverData: any[] = [];
  enrichedTruckData: any[] = [];
  
  private truckMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();

  constructor(
    private tripService: TripService,
    private snackBar: MatSnackBar,
    private filterService: CarrierFilterService
  ) {}

  ngOnInit(): void {
    this.loadAssetMaps();
    
    this.filterService.dateFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadReport();
      });
  }

  private loadAssetMaps(): void {
    this.tripService.getTrucksByCarrier().subscribe({
      next: (trucks) => {
        trucks.forEach(truck => this.truckMap.set(truck.truckId, truck));
      },
      error: (error) => console.error('Error loading trucks:', error)
    });
    
    this.tripService.getDriversByCarrier().subscribe({
      next: (drivers) => {
        drivers.forEach(driver => this.driverMap.set(driver.userId, driver));
      },
      error: (error) => console.error('Error loading drivers:', error)
    });
    
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        brokers.forEach(broker => this.brokerMap.set(broker.brokerId, broker));
      },
      error: (error) => console.error('Error loading brokers:', error)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private enrichGroupedData(): void {
    if (!this.report) return;
    
    if (this.report.groupedByDriver) {
      this.enrichedDriverData = Object.entries(this.report.groupedByDriver).map(([driverId, data]) => {
        const driver = this.driverMap.get(driverId);
        return {
          driverName: driver?.name || driverId.substring(0, 8),
          totalPayment: data.totalPayment,
          tripCount: data.tripCount
        };
      });
    }
    
    if (this.report.groupedByTruck) {
      this.enrichedTruckData = Object.entries(this.report.groupedByTruck).map(([truckId, data]) => {
        const truck = this.truckMap.get(truckId);
        const truckName = truck ? `${truck.plate} (${truck.brand} ${truck.year})` : truckId.substring(0, 8);
        return {
          truckName,
          totalPayment: data.totalPayment,
          tripCount: data.tripCount
        };
      });
    }
  }

  loadReport(): void {
    this.loading = true;
    const filters = this.filterService.getCurrentFilter();
    
    const groupBy = this.activeTabIndex === 0 ? 'broker' : 
                    this.activeTabIndex === 1 ? 'driver' : 'truck';
    
    this.tripService.getPaymentReport({
      startDate: filters.startDate?.toISOString().split('T')[0],
      endDate: filters.endDate?.toISOString().split('T')[0],
      groupBy
    }).subscribe({
      next: (report) => {
        this.report = report as DispatcherPaymentReport;
        this.enrichGroupedData();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading payment report:', error);
        this.snackBar.open('Failed to load payment report', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  onTabChange(index: number): void {
    this.activeTabIndex = index;
    this.loadReport();
  }

  getBrokerName(brokerId: string): string {
    const broker = this.brokerMap.get(brokerId);
    return broker?.brokerName || brokerId.substring(0, 8);
  }

  getEnrichedBrokerData(): any[] {
    if (!this.report?.groupedByBroker) return [];
    
    return Object.entries(this.report.groupedByBroker).map(([brokerId, data]) => ({
      brokerName: this.getBrokerName(brokerId),
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
  }
}
