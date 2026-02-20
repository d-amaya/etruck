import { OrderStatus } from '@haulhub/shared';

/**
 * Helper function to create complete mock Order objects for testing
 */
export function createMockTrip(overrides: any = {}): any {
  return {
    orderId: 'order-1',
    dispatcherId: 'dispatcher-1',
    carrierId: 'carrier-1',
    driverId: 'driver-1',
    truckId: 'truck-1',
    trailerId: 'trailer-1',
    invoiceNumber: 'ORDER-123',
    scheduledTimestamp: '2024-01-15T10:00:00Z',
    pickupTimestamp: null,
    deliveryTimestamp: null,
    pickupCompany: 'Acme Corp',
    pickupAddress: '123 Main St',
    pickupCity: 'New York',
    pickupState: 'NY',
    pickupZip: '10001',
    pickupPhone: '555-0100',
    pickupNotes: '',
    deliveryCompany: 'Beta Inc',
    deliveryAddress: '456 Oak Ave',
    deliveryCity: 'Boston',
    deliveryState: 'MA',
    deliveryZip: '02101',
    deliveryPhone: '555-0200',
    deliveryNotes: '',
    brokerId: 'broker-1',
    orderRate: 1500,
    carrierPayment: 500,
    driverPayment: 800,
    mileageOrder: 200,
    mileageEmpty: 20,
    mileageTotal: 220,
    driverRate: 4.0,
    dispatcherRate: 1.0,
    dispatcherPayment: 200,
    fuelCost: 100,
    fuelGasAvgCost: 3.5,
    fuelGasAvgGallxMil: 0.15,
    lumperValue: 0,
    detentionValue: 0,
    notes: '',
    orderStatus: OrderStatus.Scheduled,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-10T08:00:00Z',
    ...overrides
  };
}
