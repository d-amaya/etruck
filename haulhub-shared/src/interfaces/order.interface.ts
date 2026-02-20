import { OrderStatus } from '../enums/order-status.enum';

export interface Order {
  // Primary identifier
  orderId: string;

  // Entity relationships
  adminId: string;
  dispatcherId: string;
  carrierId: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  brokerId: string;

  // Order information
  invoiceNumber: string;
  brokerLoad: string;
  orderStatus: OrderStatus;

  // Timestamps (ISO 8601)
  scheduledTimestamp: string;
  pickupTimestamp: string | null;
  deliveryTimestamp: string | null;

  // Pickup location
  pickupCompany: string;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  pickupPhone: string;
  pickupNotes: string;

  // Delivery location
  deliveryCompany: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryPhone: string;
  deliveryNotes: string;

  // Mileage
  mileageEmpty: number;
  mileageOrder: number;
  mileageTotal: number;

  // Financial — rates
  orderRate: number;
  adminRate: number;       // % of orderRate (adminRate + dispatcherRate = 10)
  dispatcherRate: number;  // % of orderRate
  carrierRate: number;     // always 90%
  driverRate: number;      // $/mile

  // Financial — calculated payments
  adminPayment: number;      // orderRate × adminRate / 100
  dispatcherPayment: number; // orderRate × dispatcherRate / 100
  carrierPayment: number;    // orderRate × 90%
  driverPayment: number;     // driverRate × mileageOrder

  // Fuel
  fuelGasAvgCost: number;
  fuelGasAvgGallxMil: number;
  fuelCost: number;          // mileageTotal × fuelGasAvgGallxMil × fuelGasAvgCost

  // Additional fees
  lumperValue: number;
  detentionValue: number;

  // Notes
  notes: string;

  // Soft delete
  isDeleted?: boolean;

  // Audit
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  lastModifiedBy?: string;
}
