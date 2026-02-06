import { TripStatus } from '../enums/trip-status.enum';

export interface Trip {
  // Primary identifiers
  tripId: string;
  
  // Entity relationships (userId-based)
  carrierId: string;
  dispatcherId: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  truckOwnerId: string;
  brokerId: string;
  
  // Order information
  orderConfirmation: string;
  orderStatus: 'Scheduled' | 'Picked Up' | 'In Transit' | 'Delivered' | 'Paid';
  
  // Timestamps (ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ)
  scheduledTimestamp: string;
  pickupTimestamp: string | null;
  deliveryTimestamp: string | null;
  
  // Pickup location details
  pickupCompany: string;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  pickupPhone: string;
  pickupNotes: string;
  
  // Delivery location details
  deliveryCompany: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryPhone: string;
  deliveryNotes: string;
  
  // Mileage tracking
  mileageEmpty: number;
  mileageOrder: number;
  mileageTotal: number;
  
  // Rates (per mile or per trip)
  brokerRate: number;
  driverRate: number;
  truckOwnerRate: number;
  dispatcherRate: number;
  factoryRate: number;
  orderRate: number;
  orderAverage: number;
  
  // Payments
  brokerPayment: number;
  driverPayment: number;
  truckOwnerPayment: number;
  dispatcherPayment: number;
  
  // Advances
  brokerAdvance: number;
  driverAdvance: number;
  factoryAdvance: number;
  
  // Costs and expenses
  fuelCost: number;
  fuelGasAvgCost: number;
  fuelGasAvgGallxMil: number;
  brokerCost: number;
  factoryCost: number;
  lumperValue: number;
  detentionValue: number;
  orderExpenses: number;
  orderRevenue: number;
  
  // Additional notes
  notes: string;
  
  // Audit timestamps
  createdAt?: string;
  updatedAt?: string;
  
  // Legacy fields (backward compatibility - optional)
  driverName?: string;
  driverLicense?: string;
  brokerName?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  status?: TripStatus;
  loadedMiles?: number;
  emptyMiles?: number;
  totalMiles?: number;
  lumperFees?: number;
  detentionFees?: number;
}

export interface InvoicePayment {
  paymentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
}
