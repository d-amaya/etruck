import { Order, OrderStatus } from '@haulhub/shared';

export class DashboardExportResponseDto {
  orders: Order[];
  summaryByStatus: Record<OrderStatus, number>;
  paymentSummary: {
    totalOrderRate: number;
    totalCarrierPayment: number;
    totalDriverPayment: number;
    totalFuelCost: number;
  };
  assets: {
    brokers: Array<{ brokerId: string; brokerName: string }>;
    trucks: Array<{ truckId: string; plate: string }>;
    drivers: Array<{ userId: string; name: string }>;
    trailers: Array<{ trailerId: string; plate: string }>;
  };
}
