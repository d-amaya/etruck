import { Order } from '../interfaces/order.interface';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Admin profit = adminPayment - lumper - detention */
export function calcAdminProfit(order: Partial<Order>): number {
  return round2(
    (order.adminPayment || 0) -
    (order.lumperValue || 0) -
    (order.detentionValue || 0)
  );
}

/** Dispatcher profit = dispatcherPayment */
export function calcDispatcherProfit(order: Partial<Order>): number {
  return order.dispatcherPayment || 0;
}

/** Carrier profit = carrierPayment - driverPayment - fuelCost */
export function calcCarrierProfit(order: Partial<Order>): number {
  return round2(
    (order.carrierPayment || 0) -
    (order.driverPayment || 0) -
    (order.fuelCost || 0)
  );
}

/** Driver profit = driverPayment */
export function calcDriverProfit(order: Partial<Order>): number {
  return order.driverPayment || 0;
}

/** Calculate fuel cost: mileageTotal × fuelGasAvgGallxMil × fuelGasAvgCost */
export function calculateFuelCost(order: Partial<Order>): number {
  if (order.fuelGasAvgCost && order.fuelGasAvgGallxMil) {
    const miles = order.mileageTotal || order.mileageOrder || 0;
    return round2(miles * order.fuelGasAvgGallxMil * order.fuelGasAvgCost);
  }
  return order.fuelCost || 0;
}

/** Calculate all payment fields from rates */
export function calculateOrderPayments(order: Partial<Order>): {
  adminPayment: number;
  dispatcherPayment: number;
  carrierPayment: number;
  driverPayment: number;
  fuelCost: number;
  mileageTotal: number;
} {
  const orderRate = order.orderRate || 0;
  const adminRate = order.adminRate || 0;
  const dispatcherRate = order.dispatcherRate || 0;
  const mileageEmpty = order.mileageEmpty || 0;
  const mileageOrder = order.mileageOrder || 0;
  const mileageTotal = mileageEmpty + mileageOrder;
  const driverRate = order.driverRate || 0;

  const adminPayment = round2(orderRate * adminRate / 100);
  const dispatcherPayment = round2(orderRate * dispatcherRate / 100);
  const carrierPayment = round2(orderRate * 0.9);
  const driverPayment = round2(driverRate * mileageOrder);

  const fuelGasAvgCost = order.fuelGasAvgCost || 0;
  const fuelGasAvgGallxMil = order.fuelGasAvgGallxMil || 0;
  const fuelCost = round2(mileageTotal * fuelGasAvgGallxMil * fuelGasAvgCost);

  return { adminPayment, dispatcherPayment, carrierPayment, driverPayment, fuelCost, mileageTotal };
}

/** Check if order has fuel data */
export function hasFuelData(order: Partial<Order>): boolean {
  if (order.fuelCost && order.fuelCost > 0) return true;
  return !!(order.fuelGasAvgCost && order.fuelGasAvgGallxMil && (order.mileageTotal || order.mileageOrder));
}
