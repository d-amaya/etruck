export interface PaymentReportFilters {
  startDate?: string;
  endDate?: string;
  brokerId?: string;
  truckId?: string;
  lorryId?: string; // Legacy - maps to truckId
  driverId?: string;
  dispatcherId?: string;
  groupBy?: 'broker' | 'driver' | 'truck' | 'dispatcher';
}

export interface TripPaymentDetail {
  tripId: string;
  dispatcherId: string;
  scheduledTimestamp: string;
  pickupLocation: string;
  dropoffLocation: string;
  brokerId: string;
  brokerName: string;
  truckId: string;
  driverId: string;
  driverName: string;
  brokerPayment: number;
  truckOwnerPayment: number;
  driverPayment: number;
  mileageOrder?: number;
  // Additional Fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
  lumperFees?: number;
  detentionFees?: number;
  orderStatus: string;
}

export interface DispatcherPaymentReport {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalTruckOwnerPayments: number;
  // Additional Fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
  totalLumperFees?: number;
  totalDetentionFees?: number;
  totalAdditionalFees?: number;
  profit: number;
  tripCount: number;
  trips: TripPaymentDetail[];
  groupedByBroker?: Record<string, {
    brokerName: string;
    totalPayment: number;
    tripCount: number;
  }>;
  groupedByDriver?: Record<string, {
    driverName: string;
    totalPayment: number;
    tripCount: number;
  }>;
  groupedByTruck?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
}

export interface DriverPaymentReport {
  totalDriverPayments: number;
  totalDistance: number;
  tripCount: number;
  trips: TripPaymentDetail[];
  groupedByDispatcher?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
}

export interface TruckOwnerPaymentReport {
  totalTruckOwnerPayments: number;
  tripCount: number;
  trips: TripPaymentDetail[];
  groupedByTruck?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
  groupedByDispatcher?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
}

export type PaymentReport = DispatcherPaymentReport | DriverPaymentReport | TruckOwnerPaymentReport;
