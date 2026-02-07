import { Trip, TripStatus } from '@haulhub/shared';

export class DashboardExportResponseDto {
  trips: Trip[];
  summaryByStatus: Record<TripStatus, number>;
  paymentSummary: {
    totalBrokerPayments: number;
    totalDriverPayments: number;
    totalTruckOwnerPayments: number;
    totalProfit: number;
  };
  assets: {
    brokers: Array<{ brokerId: string; brokerName: string }>;
    trucks: Array<{ truckId: string; plate: string }>;
    drivers: Array<{ userId: string; name: string }>;
    trailers: Array<{ trailerId: string; plate: string }>;
  };
}
