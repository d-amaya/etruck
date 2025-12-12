import { TripStatus } from '../enums/trip-status.enum';

export interface Trip {
  tripId: string;
  dispatcherId: string;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledPickupDatetime: string;
  brokerId: string;
  brokerName: string;
  lorryId: string;
  driverId: string;
  driverName: string;
  brokerPayment: number;
  lorryOwnerPayment: number;
  driverPayment: number;
  status: TripStatus;
  distance?: number;
  deliveredAt?: string;
  
  // Enhanced Mileage Tracking (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
  loadedMiles?: number;
  emptyMiles?: number;
  totalMiles?: number;
  
  // Fuel Management (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
  fuelAvgCost?: number;
  fuelAvgGallonsPerMile?: number;
  fuelTotalCost?: number;
  
  // Additional Fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
  lumperFees?: number;
  detentionFees?: number;
  
  // Invoice management (Requirements 5.1, 5.2, 5.3, 5.4, 5.5)
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  invoiceTerms?: number; // Payment terms in days
  invoiceSubtotal?: number;
  invoiceTax?: number;
  invoiceTotal?: number;
  invoicePayments?: InvoicePayment[];
  invoiceStatus?: 'unpaid' | 'partial' | 'paid' | 'overdue';
  
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePayment {
  paymentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
}
