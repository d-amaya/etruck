import { TripStatus } from '../enums/trip-status.enum';
import { EnhancedDocumentMetadata } from './enhanced-document.interface';
import { InvoicePayment } from './trip.interface';

export interface EnhancedTrip {
  tripId: string;
  dispatcherId: string;
  scheduledTimestamp: string;
  brokerId: string;
  brokerName: string;
  
  // Enhanced vehicle assignment (separate truck and trailer)
  truckId: string;
  trailerId?: string;
  
  driverId: string;
  driverName: string;
  
  // Enhanced financial tracking
  brokerPayment: number;
  truckOwnerPayment: number;
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
  mileageOrder: number;
  mileageEmpty: number;
  mileageTotal: number;
  
  // Fuel cost management
  fuelGasAvgCost: number;
  fuelGasAvgGallxMil: number;
  fuelCost: number;
  
  // Enhanced status tracking
  orderStatus: 'Scheduled' | 'Picked Up' | 'In Transit' | 'Delivered' | 'Paid';
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
  notes?: string;
  createdAt: string;
  updatedAt: string;
}