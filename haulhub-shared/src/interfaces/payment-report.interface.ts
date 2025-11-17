export interface PaymentReportFilters {
  startDate?: string;
  endDate?: string;
  brokerId?: string;
  lorryId?: string;
  driverId?: string;
  dispatcherId?: string;
  groupBy?: 'broker' | 'driver' | 'lorry' | 'dispatcher';
}

export interface TripPaymentDetail {
  tripId: string;
  dispatcherId: string;
  scheduledPickupDatetime: string;
  pickupLocation: string;
  dropoffLocation: string;
  brokerId: string;
  brokerName: string;
  lorryId: string;
  driverId: string;
  driverName: string;
  brokerPayment: number;
  lorryOwnerPayment: number;
  driverPayment: number;
  distance?: number;
  status: string;
}

export interface DispatcherPaymentReport {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalLorryOwnerPayments: number;
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
  groupedByLorry?: Record<string, {
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

export interface LorryOwnerPaymentReport {
  totalLorryOwnerPayments: number;
  tripCount: number;
  trips: TripPaymentDetail[];
  groupedByLorry?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
  groupedByDispatcher?: Record<string, {
    totalPayment: number;
    tripCount: number;
  }>;
}

export type PaymentReport = DispatcherPaymentReport | DriverPaymentReport | LorryOwnerPaymentReport;
