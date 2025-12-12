import { TripStatus } from '../enums/trip-status.enum';
import { EnhancedDocumentMetadata } from './enhanced-document.interface';
import { InvoicePayment } from './trip.interface';

export interface EnhancedTrip {
  tripId: string;
  dispatcherId: string;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledPickupDatetime: string;
  brokerId: string;
  brokerName: string;
  
  // Enhanced vehicle assignment (separate truck and trailer)
  truckId: string;
  trailerId?: string;
  
  driverId: string;
  driverName: string;
  
  // Enhanced financial tracking
  brokerPayment: number;
  lorryOwnerPayment: number;
  driverPayment: number;
  
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
  
  // Enhanced mileage tracking
  loadedMiles: number;
  emptyMiles: number;
  totalMiles: number;
  
  // Fuel cost management
  fuelAvgCost: number;
  fuelAvgGallonsPerMile: number;
  fuelTotalCost: number;
  
  // Enhanced status tracking
  status: TripStatus;
  orderStatus?: string;
  orderDate?: string;
  orderConfirmation?: string;
  
  // Enhanced pickup/delivery details
  pickupCompany?: string;
  pickupPhone?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupDate?: string;
  pickupTime?: string;
  pickupNotes?: string;
  
  deliveryCompany?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryNotes?: string;
  
  // Enhanced document management
  documentFolder: string;
  documents: EnhancedDocumentMetadata[];
  
  // Additional fields
  distance?: number;
  deliveredAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}