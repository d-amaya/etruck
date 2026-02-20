import { Order } from '../interfaces/order.interface';
import { OrderStatus } from '../enums/order-status.enum';
import {
  calcAdminProfit,
  calcDispatcherProfit,
  calcCarrierProfit,
  calcDriverProfit,
  calculateFuelCost,
  calculateOrderPayments,
  hasFuelData
} from './order-calculations.util';

function makeOrder(overrides: Partial<Order> = {}): Partial<Order> {
  return {
    orderId: 'order-1',
    orderStatus: OrderStatus.Scheduled,
    orderRate: 5000,
    adminRate: 5,
    dispatcherRate: 5,
    carrierRate: 90,
    driverRate: 0.55,
    mileageOrder: 500,
    mileageEmpty: 100,
    mileageTotal: 600,
    adminPayment: 250,
    dispatcherPayment: 250,
    carrierPayment: 4500,
    driverPayment: 275,
    fuelGasAvgCost: 3.5,
    fuelGasAvgGallxMil: 0.15,
    fuelCost: 315,
    lumperValue: 50,
    detentionValue: 75,
    ...overrides
  };
}

describe('Order Calculations Utility', () => {
  describe('calcAdminProfit', () => {
    it('should calculate adminPayment - lumper - detention', () => {
      const order = makeOrder();
      expect(calcAdminProfit(order)).toBe(125); // 250 - 50 - 75
    });

    it('should handle missing fees', () => {
      const order = makeOrder({ lumperValue: undefined, detentionValue: undefined });
      expect(calcAdminProfit(order)).toBe(250);
    });
  });

  describe('calcDispatcherProfit', () => {
    it('should return dispatcherPayment', () => {
      expect(calcDispatcherProfit(makeOrder())).toBe(250);
    });
  });

  describe('calcCarrierProfit', () => {
    it('should calculate carrierPayment - driverPayment - fuelCost', () => {
      const order = makeOrder();
      expect(calcCarrierProfit(order)).toBe(3910); // 4500 - 275 - 315
    });

    it('should handle missing fuelCost', () => {
      const order = makeOrder({ fuelCost: undefined });
      expect(calcCarrierProfit(order)).toBe(4225); // 4500 - 275
    });
  });

  describe('calcDriverProfit', () => {
    it('should return driverPayment', () => {
      expect(calcDriverProfit(makeOrder())).toBe(275);
    });
  });

  describe('calculateFuelCost', () => {
    it('should calculate mileageTotal × gallxMil × avgCost', () => {
      const order = makeOrder();
      expect(calculateFuelCost(order)).toBe(315); // 600 * 0.15 * 3.5
    });

    it('should fall back to mileageOrder when mileageTotal is missing', () => {
      const order = makeOrder({ mileageTotal: undefined });
      expect(calculateFuelCost(order)).toBe(262.5); // 500 * 0.15 * 3.5
    });

    it('should return stored fuelCost when fuel inputs are missing', () => {
      const order = makeOrder({ fuelGasAvgCost: undefined });
      expect(calculateFuelCost(order)).toBe(315);
    });

    it('should return 0 when no fuel data at all', () => {
      const order = makeOrder({ fuelGasAvgCost: undefined, fuelGasAvgGallxMil: undefined, fuelCost: undefined });
      expect(calculateFuelCost(order)).toBe(0);
    });
  });

  describe('calculateOrderPayments', () => {
    it('should calculate all payments from rates', () => {
      const result = calculateOrderPayments({
        orderRate: 5000,
        adminRate: 5,
        dispatcherRate: 5,
        driverRate: 0.55,
        mileageOrder: 500,
        mileageEmpty: 100,
        fuelGasAvgCost: 3.5,
        fuelGasAvgGallxMil: 0.15
      });

      expect(result.adminPayment).toBe(250);
      expect(result.dispatcherPayment).toBe(250);
      expect(result.carrierPayment).toBe(4500);
      expect(result.driverPayment).toBe(275);
      expect(result.mileageTotal).toBe(600);
      expect(result.fuelCost).toBe(315);
    });

    it('should handle zero rates', () => {
      const result = calculateOrderPayments({ orderRate: 1000 });
      expect(result.adminPayment).toBe(0);
      expect(result.dispatcherPayment).toBe(0);
      expect(result.carrierPayment).toBe(900);
      expect(result.driverPayment).toBe(0);
      expect(result.fuelCost).toBe(0);
    });

    it('carrierPayment should always be orderRate × 90%', () => {
      const result = calculateOrderPayments({ orderRate: 3333 });
      expect(result.carrierPayment).toBe(2999.7);
    });
  });

  describe('hasFuelData', () => {
    it('should return true when fuelCost is set', () => {
      expect(hasFuelData({ fuelCost: 100 })).toBe(true);
    });

    it('should return true when fuel inputs and mileage are set', () => {
      expect(hasFuelData({ fuelGasAvgCost: 3.5, fuelGasAvgGallxMil: 0.15, mileageOrder: 500 })).toBe(true);
    });

    it('should return false when no fuel data', () => {
      expect(hasFuelData({})).toBe(false);
    });
  });
});
