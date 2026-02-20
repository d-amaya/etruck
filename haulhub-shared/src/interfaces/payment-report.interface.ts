export interface OrderPaymentDetail {
  orderId: string;
  adminId: string;
  dispatcherId: string;
  carrierId: string;
  driverId: string;
  brokerId: string;
  truckId: string;
  trailerId: string;
  scheduledTimestamp: string;
  pickupCity: string;
  deliveryCity: string;
  orderRate: number;
  adminPayment: number;
  dispatcherPayment: number;
  carrierPayment: number;
  driverPayment: number;
  fuelCost: number;
  lumperValue: number;
  detentionValue: number;
  mileageOrder: number;
  orderStatus: string;
}

export interface PaymentReportFilters {
  startDate?: string;
  endDate?: string;
  brokerId?: string;
  truckId?: string;
  driverId?: string;
  dispatcherId?: string;
  carrierId?: string;
  adminId?: string;
}

export interface AdminPaymentReport {
  totalOrderRate: number;
  totalAdminPayment: number;
  totalLumperValue: number;
  totalDetentionValue: number;
  profit: number; // adminPayment - lumper - detention
  orderCount: number;
  orders: OrderPaymentDetail[];
}

export interface DispatcherPaymentReport {
  totalOrderRate: number;
  totalDispatcherPayment: number;
  profit: number; // dispatcherPayment
  orderCount: number;
  orders: OrderPaymentDetail[];
}

export interface CarrierPaymentReport {
  totalCarrierPayment: number;
  totalDriverPayment: number;
  totalFuelCost: number;
  profit: number; // carrierPayment - driverPayment - fuelCost
  orderCount: number;
  orders: OrderPaymentDetail[];
}

export interface DriverPaymentReport {
  totalDriverPayment: number;
  totalDistance: number;
  profit: number; // driverPayment
  orderCount: number;
  orders: OrderPaymentDetail[];
}

export type PaymentReport = AdminPaymentReport | DispatcherPaymentReport | CarrierPaymentReport | DriverPaymentReport;
