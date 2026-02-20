import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { OrderService } from '../../../core/services';
import { AuthService } from '../../../core/services/auth.service';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { CarrierAssetCacheService } from '../../carrier/shared/carrier-asset-cache.service';
import { Order, OrderStatus, calcDispatcherProfit, calculateFuelCost, hasFuelData, UserRole } from '@haulhub/shared';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule
  ],
  templateUrl: './trip-detail.component.html',
  styleUrls: ['./trip-detail.component.scss']
})
export class TripDetailComponent implements OnInit {
  trip?: Order;
  loading = true;
  error?: string;
  OrderStatus = OrderStatus;
  
  // Asset lookup maps from localStorage
  private truckMap = new Map<string, any>();
  private trailerMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderService: OrderService,
    private authService: AuthService,
    private assetCache: AssetCacheService,
    private carrierAssetCache: CarrierAssetCacheService,
    private dashboardState: DashboardStateService
  ) {}

  ngOnInit(): void {
    console.log('[TripDetail] Current user role:', this.authService.userRole);
    console.log('[TripDetail] Can edit trip:', this.canEditTrip());
    
    // Load asset maps from localStorage
    this.loadAssetMapsFromStorage();
    
    const orderId = this.route.snapshot.paramMap.get('orderId') || this.route.snapshot.paramMap.get('tripId');
    if (orderId) {
      this.loadTrip(orderId);
    } else {
      this.error = 'No order ID provided';
      this.loading = false;
    }
  }

  /**
   * Load asset maps from cache service
   */
  private loadAssetMapsFromStorage(): void {
    const role = this.authService.userRole;

    if (role === UserRole.Carrier) {
      this.carrierAssetCache.loadAssets().subscribe(cache => {
        this.truckMap = cache.trucks;
        this.trailerMap = cache.trailers;
        this.driverMap = cache.drivers;
        cache.brokers.forEach((b, id) => this.brokerMap.set(id, b));
      });
    } else {
      this.assetCache.loadAssets().subscribe(cache => {
        this.truckMap = cache.trucks;
        this.trailerMap = cache.trailers;
        this.driverMap = cache.drivers;
      });
      this.dashboardState.brokers$.subscribe(brokers => {
        brokers.forEach(broker => this.brokerMap.set(broker.brokerId, broker));
      });
    }
  }

  private loadTrip(tripId: string): void {
    this.loading = true;
    this.orderService.getOrderById(tripId).subscribe({
      next: (trip: any) => {
        this.trip = trip;
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading trip:', error);
        this.error = error.error?.message || 'Failed to load order details';
        this.loading = false;
      }
    });
  }

  onBackToTrips(): void {
    // Navigate back based on user role
    const role = this.authService.userRole;
    if (role === UserRole.Carrier) {
      this.router.navigate(['/carrier/dashboard']);
    } else {
      this.router.navigate(['/dispatcher/dashboard']);
    }
  }

  onEditTrip(): void {
    if (this.trip) {
      this.router.navigate(['/dispatcher/orders', this.trip.orderId, 'edit']);
    }
  }

  canEditTrip(): boolean {
    // Only dispatchers can edit trips
    return this.authService.userRole === UserRole.Dispatcher;
  }

  getStatusClass(status: OrderStatus | string): string {
    // Handle both OrderStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case OrderStatus.Scheduled:
      case 'Scheduled':
        return 'status-scheduled';
      case OrderStatus.PickingUp:
      case 'PickingUp':
        return 'status-picked-up';
      case OrderStatus.Transit:
      case 'Transit':
        return 'status-in-transit';
      case OrderStatus.Delivered:
      case 'Delivered':
        return 'status-delivered';
      case OrderStatus.ReadyToPay:
      case 'ReadyToPay':
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: OrderStatus | string): string {
    // Handle both OrderStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case OrderStatus.Scheduled:
      case 'Scheduled':
        return 'Scheduled';
      case OrderStatus.PickingUp:
      case 'PickingUp':
        return 'Picked Up';
      case OrderStatus.Transit:
      case 'Transit':
        return 'In Transit';
      case OrderStatus.Delivered:
      case 'Delivered':
        return 'Delivered';
      case OrderStatus.ReadyToPay:
      case 'ReadyToPay':
        return 'Paid';
      default:
        return String(status);
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get the most recent timestamp based on trip status
   */
  getLastUpdatedTimestamp(): string {
    if (!this.trip) return '';
    
    // Return the most recent timestamp based on status
    switch (this.trip.orderStatus) {
      case 'Delivered':
      case 'ReadyToPay':
        return this.trip.deliveryTimestamp || this.trip.pickupTimestamp || this.trip.scheduledTimestamp;
      case 'PickingUp':
      case 'Transit':
        return this.trip.pickupTimestamp || this.trip.scheduledTimestamp;
      case 'Scheduled':
      default:
        return this.trip.scheduledTimestamp;
    }
  }

  /**
   * Get truck plate from map
   */
  getBrokerName(): string {
    if (!this.trip) return 'N/A';
    const broker = this.brokerMap.get(this.trip.brokerId);
    return broker?.brokerName || this.trip.brokerId;
  }

  getTruckPlate(): string {
    if (!this.trip) return 'N/A';
    const truck = this.truckMap.get(this.trip.truckId);
    return truck?.plate || this.trip.truckId.substring(0, 8);
  }

  /**
   * Get truck brand and year from map
   */
  getTruckBrandYear(): string {
    if (!this.trip) return 'N/A';
    const truck = this.truckMap.get(this.trip.truckId);
    if (truck?.brand && truck?.year) {
      return `${truck.brand} ${truck.year}`;
    }
    return 'N/A';
  }

  /**
   * Get trailer plate from map
   */
  getTrailerPlate(): string {
    if (!this.trip) return 'N/A';
    const trailer = this.trailerMap.get(this.trip.trailerId);
    return trailer?.plate || this.trip.trailerId.substring(0, 8);
  }

  /**
   * Get trailer brand and year from map
   */
  getTrailerBrandYear(): string {
    if (!this.trip) return 'N/A';
    const trailer = this.trailerMap.get(this.trip.trailerId);
    if (trailer?.brand && trailer?.year) {
      return `${trailer.brand} ${trailer.year}`;
    }
    return 'N/A';
  }

  /**
   * Get driver name from map or enriched trip data
   */
  getDriverName(): string {
    if (!this.trip) return 'N/A';
    const driver = this.driverMap.get(this.trip.driverId);
    return driver?.name || this.trip.driverId.substring(0, 8);
  }

  /**
   * Get driver license from map or enriched trip data
   */
  getDriverLicense(): string {
    if (!this.trip) return 'N/A';
    const driver = this.driverMap.get(this.trip.driverId);
    return driver?.nationalId || 'N/A';
  }

  /**
   * Get driver email from map
   */
  getDriverEmail(): string {
    if (!this.trip) return 'N/A';
    const driver = this.driverMap.get(this.trip.driverId);
    return driver?.email || 'N/A';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  calculateProfit(): number {
    if (!this.trip) return 0;
    return calcDispatcherProfit(this.trip);
  }

  /**
   * Calculate total expenses (all costs)
   */
  calculateTotalExpenses(): number {
    if (!this.trip) return 0;
    
    let expenses = 0;
    expenses += this.trip.carrierPayment || 0;
    expenses += this.trip.driverPayment || 0;
    expenses += this.calculateFuelCost();
    expenses += this.trip.lumperValue || 0;
    expenses += this.trip.detentionValue || 0;
    
    return expenses;
  }

  /**
   * Get absolute value of profit for display
   */
  getAbsoluteProfit(): number {
    return Math.abs(this.calculateProfit());
  }

  /**
   * Calculate total miles from loaded and empty miles
   */
  calculateTotalMiles(): number {
    if (!this.trip) return 0;
    
    const loadedMiles = this.trip.mileageOrder || 0;
    const emptyMiles = this.trip.mileageEmpty || 0;
    
    return loadedMiles + emptyMiles;
  }

  /**
   * Check if trip has fuel cost data
   */
  hasFuelData(): boolean {
    if (!this.trip) return false;
    return hasFuelData(this.trip);
  }

  /**
   * Calculate estimated fuel consumption in gallons
   * Formula: Total Miles × Gallons Per Mile
   */
  calculateFuelConsumption(): number {
    if (!this.trip || !this.hasFuelData()) return 0;
    
    const totalMiles = this.calculateTotalMiles();
    const gallonsPerMile = this.trip.fuelGasAvgGallxMil || 0;
    
    return totalMiles * gallonsPerMile;
  }

  /**
   * Calculate total fuel cost
   * Formula: Total Miles × Gallons Per Mile × Cost Per Gallon
   * Validates: Requirements 6.2
   */
  calculateFuelCost(): number {
    if (!this.trip) return 0;
    return calculateFuelCost(this.trip);
  }

  // Expose Math to template
  Math = Math;

  get isDispatcher(): boolean {
    return this.authService.userRole === UserRole.Dispatcher;
  }
}
