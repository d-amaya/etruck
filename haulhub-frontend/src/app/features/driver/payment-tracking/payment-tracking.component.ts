import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

interface PaymentSummary {
  totalEarnings: number;
  totalAdvances: number;
  netPayment: number;
  tripCount: number;
  totalMiles: number;
  averagePerMile: number;
}

interface TripPayment {
  tripId: string;
  orderConfirmation: string;
  orderDate: string;
  pickupCity: string;
  pickupState: string;
  deliveryCity: string;
  deliveryState: string;
  loadedMiles: number;
  driverRate: number;
  driverAdvance: number;
  driverPayment: number;
  orderStatus: string;
  truckName: string;
}

@Component({
  selector: 'app-payment-tracking',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  templateUrl: './payment-tracking.component.html',
  styleUrls: ['./payment-tracking.component.scss']
})
export class PaymentTrackingComponent implements OnInit {
  filterForm!: FormGroup;
  loading = false;
  
  summary: PaymentSummary = {
    totalEarnings: 0,
    totalAdvances: 0,
    netPayment: 0,
    tripCount: 0,
    totalMiles: 0,
    averagePerMile: 0
  };
  
  payments: TripPayment[] = [];
  
  displayedColumns: string[] = [
    'orderDate',
    'orderConfirmation',
    'route',
    'truck',
    'miles',
    'rate',
    'advance',
    'payment',
    'status'
  ];
  
  statusOptions = [
    'All',
    'Scheduled',
    'PickedUp',
    'InTransit',
    'Delivered',
    'Paid'
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadPaymentData();
  }

  private initializeForm(): void {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    this.filterForm = this.fb.group({
      startDate: [firstDayOfMonth],
      endDate: [now],
      status: ['All']
    });
  }

  private loadPaymentData(): void {
    this.loading = true;
    
    // TODO: Call API to load payment data
    // For now, use mock data
    setTimeout(() => {
      this.summary = {
        totalEarnings: 12450.50,
        totalAdvances: 2500.00,
        netPayment: 9950.50,
        tripCount: 18,
        totalMiles: 8250,
        averagePerMile: 1.51
      };
      
      this.payments = this.generateMockPayments();
      this.loading = false;
    }, 1000);
  }

  private generateMockPayments(): TripPayment[] {
    return [
      {
        tripId: '1',
        orderConfirmation: 'L-15039542',
        orderDate: '2024-10-25',
        pickupCity: 'Omega',
        pickupState: 'GA',
        deliveryCity: 'Jessup',
        deliveryState: 'MD',
        loadedMiles: 890,
        driverRate: 0.55,
        driverAdvance: 0,
        driverPayment: 489.50,
        orderStatus: 'Delivered',
        truckName: 'Freigh101'
      },
      {
        tripId: '2',
        orderConfirmation: 'L-15039543',
        orderDate: '2024-10-28',
        pickupCity: 'Miami',
        pickupState: 'FL',
        deliveryCity: 'Atlanta',
        deliveryState: 'GA',
        loadedMiles: 650,
        driverRate: 0.60,
        driverAdvance: 200,
        driverPayment: 190.00,
        orderStatus: 'Paid',
        truckName: 'Freigh102'
      }
    ];
  }

  applyFilters(): void {
    this.loadPaymentData();
  }

  resetFilters(): void {
    this.initializeForm();
    this.loadPaymentData();
  }

  getStatusColor(status: string): string {
    const statusColors: Record<string, string> = {
      'Scheduled': 'primary',
      'PickedUp': 'accent',
      'InTransit': 'accent',
      'Delivered': 'primary',
      'Paid': 'primary'
    };
    return statusColors[status] || 'default';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatRoute(payment: TripPayment): string {
    return `${payment.pickupCity}, ${payment.pickupState} → ${payment.deliveryCity}, ${payment.deliveryState}`;
  }
}
