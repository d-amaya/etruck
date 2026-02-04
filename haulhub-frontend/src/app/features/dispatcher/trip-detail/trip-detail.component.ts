import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { TripService } from '../../../core/services';
import { AuthService } from '../../../core/services/auth.service';
import { Trip, TripStatus, calculateTripProfit, calculateFuelCost, hasFuelData, UserRole } from '@haulhub/shared';

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
  trip?: Trip;
  loading = true;
  error?: string;
  TripStatus = TripStatus;
  
  // Asset lookup maps from localStorage
  private truckMap = new Map<string, any>();
  private trailerMap = new Map<string, any>();
  private driverMap = new Map<string, any>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    console.log('[TripDetail] Current user role:', this.authService.userRole);
    console.log('[TripDetail] Can edit trip:', this.canEditTrip());
    
    // Load asset maps from localStorage
    this.loadAssetMapsFromStorage();
    
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.loadTrip(tripId);
    } else {
      this.error = 'No trip ID provided';
      this.loading = false;
    }
  }

  /**
   * Load asset maps from localStorage
   */
  private loadAssetMapsFromStorage(): void {
    try {
      const truckData = localStorage.getItem('carrier_truck_map');
      const trailerData = localStorage.getItem('carrier_trailer_map');
      const driverData = localStorage.getItem('carrier_driver_map');
      
      if (truckData) {
        const truckEntries = JSON.parse(truckData);
        // This is plate -> truckId map, we need to reverse it or load full truck data
        // For now, we'll load trucks via API
      }
    } catch (error) {
      console.error('Error loading asset maps from localStorage:', error);
    }
    
    // Load full asset details from API
    this.loadAssetDetails();
  }

  /**
   * Load full asset details for display
   */
  private loadAssetDetails(): void {
    this.tripService.getTrucksByCarrier().subscribe({
      next: (trucks) => {
        trucks.forEach(truck => this.truckMap.set(truck.truckId, truck));
      },
      error: (error) => console.error('Error loading trucks:', error)
    });
    
    this.tripService.getTrailersByCarrier().subscribe({
      next: (trailers) => {
        trailers.forEach(trailer => this.trailerMap.set(trailer.trailerId, trailer));
      },
      error: (error) => console.error('Error loading trailers:', error)
    });
    
    this.tripService.getDriversByCarrier().subscribe({
      next: (drivers) => {
        drivers.forEach(driver => this.driverMap.set(driver.userId, driver));
      },
      error: (error) => console.error('Error loading drivers:', error)
    });
  }

  private loadTrip(tripId: string): void {
    this.loading = true;
    this.tripService.getTripById(tripId).subscribe({
      next: (trip) => {
        this.trip = trip;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trip:', error);
        this.error = error.error?.message || 'Failed to load trip details';
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
      this.router.navigate(['/dispatcher/trips', this.trip.tripId, 'edit']);
    }
  }

  canEditTrip(): boolean {
    // Only dispatchers can edit trips
    return this.authService.userRole === UserRole.Dispatcher;
  }

  getStatusClass(status: TripStatus | string): string {
    // Handle both TripStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'status-scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
        return 'status-picked-up';
      case TripStatus.InTransit:
      case 'In Transit':
        return 'status-in-transit';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'status-delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: TripStatus | string): string {
    // Handle both TripStatus enum and string literals from new schema
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'Scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
        return 'Picked Up';
      case TripStatus.InTransit:
      case 'In Transit':
        return 'In Transit';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'Delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'Paid';
      default:
        return String(status);
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
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
      case 'Paid':
        return this.trip.deliveryTimestamp || this.trip.pickupTimestamp || this.trip.scheduledTimestamp;
      case 'Picked Up':
      case 'In Transit':
        return this.trip.pickupTimestamp || this.trip.scheduledTimestamp;
      case 'Scheduled':
      default:
        return this.trip.scheduledTimestamp;
    }
  }

  /**
   * Get truck plate from map
   */
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
    if (this.trip.driverName) return this.trip.driverName;
    const driver = this.driverMap.get(this.trip.driverId);
    return driver?.name || 'N/A';
  }

  /**
   * Get driver license from map or enriched trip data
   */
  getDriverLicense(): string {
    if (!this.trip) return 'N/A';
    if (this.trip.driverLicense) return this.trip.driverLicense;
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
    return calculateTripProfit(this.trip);
  }

  /**
   * Calculate total expenses (all costs)
   */
  calculateTotalExpenses(): number {
    if (!this.trip) return 0;
    
    let expenses = 0;
    expenses += this.trip.truckOwnerPayment || 0;
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
}
