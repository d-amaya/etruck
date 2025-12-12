import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TripService, PaymentSummary } from '../../../../core/services/trip.service';
import { DashboardStateService } from '../dashboard-state.service';
import { Trip } from '@haulhub/shared';

@Component({
  selector: 'app-payment-summary',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './payment-summary.component.html',
  styleUrls: ['./payment-summary.component.scss']
})
export class PaymentSummaryComponent implements OnInit, OnDestroy {
  paymentSummary: PaymentSummary = {
    totalBrokerPayments: 0,
    totalDriverPayments: 0,
    totalLorryOwnerPayments: 0,
    totalProfit: 0
  };
  hasError = false;

  private destroy$ = new Subject<void>();

  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Subscribe to filtered trips from dashboard state
    this.dashboardState.filteredTrips$
      .pipe(takeUntil(this.destroy$))
      .subscribe(trips => {
        this.calculatePaymentSummary(trips);
      });
  }

  private calculatePaymentSummary(trips: Trip[]): void {
    if (!trips || trips.length === 0) {
      this.paymentSummary = {
        totalBrokerPayments: 0,
        totalDriverPayments: 0,
        totalLorryOwnerPayments: 0,
        totalProfit: 0
      };
      return;
    }

    // Calculate totals from the filtered trips array
    const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
    
    // Calculate total fuel costs
    const totalFuelCosts = trips.reduce((sum, trip) => {
      if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
        const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
        return sum + (totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost);
      }
      return sum;
    }, 0);
    
    // Calculate total additional fees
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionFees = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    
    // Profit includes all expenses: driver, lorry owner, fuel, and additional fees
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments - totalFuelCosts - totalAdditionalFees;

    this.paymentSummary = {
      totalBrokerPayments,
      totalDriverPayments,
      totalLorryOwnerPayments,
      totalProfit
    };

    this.hasError = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }



  get isProfitPositive(): boolean {
    return this.paymentSummary.totalProfit >= 0;
  }

  get profitClass(): string {
    return this.isProfitPositive ? 'profit-positive' : 'profit-negative';
  }

  private handleError(error: any): void {
    this.hasError = true;
    let errorMessage = 'Failed to load payment summary';
    
    if (error?.status === 0) {
      errorMessage = 'Network connection error. Please check your internet connection.';
    } else if (error?.status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    } else if (error?.status === 401) {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error?.error?.message) {
      errorMessage = error.error.message;
    }

    this.snackBar.open(errorMessage, 'Dismiss', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  retryLoad(): void {
    this.hasError = false;
    // The payment summary will automatically recalculate when filtered trips are updated
  }
}
