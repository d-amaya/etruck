import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { IndexSelectorService } from './index-selector.service';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { UserRole, OrderStatus } from '@haulhub/shared';

// Mock DynamoDB client
const mockSend = jest.fn();
const mockDdb = { send: mockSend };

const mockAwsService = {
  getDynamoDBClient: () => mockDdb,
};

const mockConfigService = {
  ordersTableName: 'eTruckyOrders',
  v2UsersTableName: 'eTruckyUsers',
  v2TrucksTableName: 'eTruckyTrucks',
  v2TrailersTableName: 'eTruckyTrailers',
  v2BrokersTableName: 'eTruckyBrokers',
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        IndexSelectorService,
        { provide: AwsService, useValue: mockAwsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    mockSend.mockReset();
  });

  // ── Field-level allowlist ─────────────────────────────────────

  describe('updateOrder - field-level allowlist', () => {
    it('should reject disallowed fields with 400', async () => {
      await expect(
        service.updateOrder('order-1', 'driver-1', UserRole.Driver, {
          orderRate: 5000,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Admin updating non-allowed fields', async () => {
      await expect(
        service.updateOrder('order-1', 'admin-1', UserRole.Admin, {
          orderRate: 5000,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept Admin updating dispatcherRate', async () => {
      // Mock getRawOrder for auto-recalc
      mockSend
        .mockResolvedValueOnce({ Item: { PK: 'ORDER#order-1', SK: 'METADATA', orderRate: 5000, adminId: 'admin-1' } })
        .mockResolvedValueOnce({ Attributes: { orderId: 'order-1', adminId: 'admin-1', dispatcherRate: 6, adminRate: 4, adminPayment: 200, dispatcherPayment: 300 } });

      const result = await service.updateOrder('order-1', 'admin-1', UserRole.Admin, {
        dispatcherRate: 6,
      } as any);

      expect(result.dispatcherRate).toBe(6);
    });

    it('should accept Carrier updating driverRate', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { PK: 'ORDER#order-1', SK: 'METADATA', mileageOrder: 500, carrierId: 'carrier-1' } })
        .mockResolvedValueOnce({ Attributes: { orderId: 'order-1', carrierId: 'carrier-1', driverRate: 0.60, driverPayment: 300 } });

      const result = await service.updateOrder('order-1', 'carrier-1', UserRole.Carrier, {
        driverRate: 0.60,
      } as any);

      expect(result).toBeDefined();
    });

    it('should accept Driver updating notes', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { orderId: 'order-1', driverId: 'driver-1', notes: 'updated' },
      });

      const result = await service.updateOrder('order-1', 'driver-1', UserRole.Driver, {
        notes: 'updated',
      } as any);

      expect(result.notes).toBe('updated');
    });
  });

  // ── Ownership guard rails ─────────────────────────────────────

  describe('updateOrder - ownership', () => {
    it('should throw 403 when ConditionalCheckFailedException has Item', async () => {
      const error: any = new Error('Condition not met');
      error.name = 'ConditionalCheckFailedException';
      error.Item = { orderId: 'order-1', dispatcherId: 'other-dispatcher' };
      mockSend.mockRejectedValueOnce(error);

      await expect(
        service.updateOrder('order-1', 'dispatcher-1', UserRole.Dispatcher, {
          notes: 'test',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 404 when ConditionalCheckFailedException has no Item', async () => {
      const error: any = new Error('Condition not met');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(
        service.updateOrder('order-1', 'dispatcher-1', UserRole.Dispatcher, {
          notes: 'test',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Auto-recalculation ────────────────────────────────────────

  describe('updateOrder - auto-recalculation', () => {
    it('should recalculate adminRate and payments when dispatcherRate changes', async () => {
      // getRawOrder returns current order
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'ORDER#order-1', SK: 'METADATA', orderRate: 5000, adminId: 'admin-1', adminRate: 5, dispatcherRate: 5 },
      });
      // UpdateCommand returns new values
      mockSend.mockResolvedValueOnce({
        Attributes: {
          orderId: 'order-1', adminId: 'admin-1',
          dispatcherRate: 7, adminRate: 5,
          adminPayment: 250, dispatcherPayment: 350, carrierPayment: 4400,
        },
      });

      await service.updateOrder('order-1', 'admin-1', UserRole.Admin, {
        dispatcherRate: 7,
      } as any);

      // Verify the UpdateCommand was called with correct recalculated values
      const updateCall = mockSend.mock.calls[1][0];
      const exprValues = updateCall.input.ExpressionAttributeValues;
      expect(exprValues[':adminRate']).toBe(5); // unchanged from current
      expect(exprValues[':adminPayment']).toBe(250); // 5000 * 5 / 100
      expect(exprValues[':dispatcherPayment']).toBe(350); // 5000 * 7 / 100
      expect(exprValues[':carrierPayment']).toBe(4400); // 5000 - 250 - 350
    });

    it('should recalculate driverPayment when driverRate changes', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'ORDER#order-1', SK: 'METADATA', mileageOrder: 500, carrierId: 'carrier-1' },
      });
      mockSend.mockResolvedValueOnce({
        Attributes: { orderId: 'order-1', carrierId: 'carrier-1', driverRate: 0.60, driverPayment: 300 },
      });

      await service.updateOrder('order-1', 'carrier-1', UserRole.Carrier, {
        driverRate: 0.60,
      } as any);

      const updateCall = mockSend.mock.calls[1][0];
      const exprValues = updateCall.input.ExpressionAttributeValues;
      expect(exprValues[':driverPayment']).toBe(300); // 0.60 * 500
    });

    it('should recalculate fuelCost when fuel inputs change', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'ORDER#order-1', SK: 'METADATA', mileageTotal: 600, fuelGasAvgCost: 3.5, fuelGasAvgGallxMil: 0.15, carrierId: 'carrier-1' },
      });
      mockSend.mockResolvedValueOnce({
        Attributes: { orderId: 'order-1', carrierId: 'carrier-1', fuelGasAvgCost: 4.0, fuelCost: 360 },
      });

      await service.updateOrder('order-1', 'carrier-1', UserRole.Carrier, {
        fuelGasAvgCost: 4.0,
      } as any);

      const updateCall = mockSend.mock.calls[1][0];
      const exprValues = updateCall.input.ExpressionAttributeValues;
      expect(exprValues[':fuelCost']).toBe(360); // 600 * 0.15 * 4.0
    });
  });

  // ── carrierPayment = orderRate × 90% ──────────────────────────

  describe('createOrder - carrierPayment', () => {
    it('should set carrierPayment to orderRate × 90%', async () => {
      // Mock entity lookups (driver, truck, admin)
      mockSend
        .mockResolvedValueOnce({ Item: { rate: 0.55 } }) // driver
        .mockResolvedValueOnce({ Item: { fuelGasAvgGallxMil: 0.15, fuelGasAvgCost: 3.5 } }) // truck
        .mockResolvedValueOnce({ Item: { rate: 5 } }) // admin
        .mockResolvedValueOnce({}); // PutCommand

      const result = await service.createOrder('dispatcher-1', {
        adminId: 'admin-1',
        carrierId: 'carrier-1',
        driverId: 'driver-1',
        truckId: 'truck-1',
        trailerId: 'trailer-1',
        brokerId: 'broker-1',
        invoiceNumber: 'INV-001',
        brokerLoad: 'BL-001',
        scheduledTimestamp: '2026-02-20T10:00:00Z',
        orderRate: 5000,
        adminPayment: 250,
        dispatcherPayment: 250,
        carrierPayment: 4500,
      } as any);

      expect(result.carrierPayment).toBe(4500);
    });
  });

  // ── computePaymentSummary — groupedByDispatcher ────────────

  describe('computePaymentSummary - groupedByDispatcher', () => {
    const orders = [
      { orderId: 'o1', orderStatus: 'Delivered', dispatcherId: 'd1', brokerId: 'b1', carrierId: 'c1', driverId: 'dr1', orderRate: 5000, carrierPayment: 4500, driverPayment: 275, adminPayment: 250, lumperValue: 50, detentionValue: 25 },
      { orderId: 'o2', orderStatus: 'Scheduled', dispatcherId: 'd1', brokerId: 'b1', carrierId: 'c1', driverId: 'dr1', orderRate: 3000, carrierPayment: 2700, driverPayment: 165, adminPayment: 150, lumperValue: 0, detentionValue: 0 },
      { orderId: 'o3', orderStatus: 'Delivered', dispatcherId: 'd2', brokerId: 'b2', carrierId: 'c1', driverId: 'dr1', orderRate: 4000, carrierPayment: 3600, driverPayment: 220, adminPayment: 200, lumperValue: 30, detentionValue: 0 },
      { orderId: 'o4', orderStatus: 'Canceled', dispatcherId: 'd1', brokerId: 'b1', carrierId: 'c1', driverId: 'dr1', orderRate: 1000, carrierPayment: 900, driverPayment: 55, adminPayment: 50, lumperValue: 0, detentionValue: 0 },
    ] as any[];

    it('should return groupedByDispatcher with orderRate totals', () => {
      const result = (service as any).computePaymentSummary(orders, UserRole.Admin);
      expect(result.groupedByDispatcher).toBeDefined();
      expect(result.groupedByDispatcher['d1']).toEqual({ totalPayment: 8000, tripCount: 2 });
      expect(result.groupedByDispatcher['d2']).toEqual({ totalPayment: 4000, tripCount: 1 });
    });

    it('should return groupedByDispatcher for all roles', () => {
      for (const role of [UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver]) {
        const result = (service as any).computePaymentSummary(orders, role);
        expect(result.groupedByDispatcher).toBeDefined();
      }
    });

    it('should exclude canceled orders from groupedByDispatcher', () => {
      const result = (service as any).computePaymentSummary(orders, UserRole.Admin);
      expect(result.groupedByDispatcher['d1'].tripCount).toBe(2);
    });
  });

  // ── computeDetailedAnalytics — brokerAnalytics role-aware ───

  describe('computeDetailedAnalytics - brokerAnalytics revenue', () => {
    const orders = [
      { orderId: 'o1', orderStatus: 'Delivered', brokerId: 'b1', dispatcherId: 'd1', carrierId: 'c1', driverId: 'dr1', truckId: 't1', orderRate: 5000, carrierPayment: 4500, driverPayment: 275, adminPayment: 250, dispatcherPayment: 250, fuelCost: 100, lumperValue: 50, detentionValue: 25, mileageTotal: 500, mileageOrder: 500, fuelGasAvgGallxMil: 0.15, fuelGasAvgCost: 3.5 },
      { orderId: 'o2', orderStatus: 'Scheduled', brokerId: 'b1', dispatcherId: 'd1', carrierId: 'c1', driverId: 'dr1', truckId: 't1', orderRate: 3000, carrierPayment: 2700, driverPayment: 165, adminPayment: 150, dispatcherPayment: 150, fuelCost: 60, lumperValue: 0, detentionValue: 0, mileageTotal: 300, mileageOrder: 300, fuelGasAvgGallxMil: 0.15, fuelGasAvgCost: 3.5 },
    ] as any[];

    it('should use adminPayment for brokerAnalytics revenue when role is Admin', () => {
      const result = (service as any).computeDetailedAnalytics(orders, UserRole.Admin);
      const broker = result.brokerAnalytics.find((b: any) => b.brokerId === 'b1');
      expect(broker.totalRevenue).toBe(400); // 250 + 150
    });

    it('should use carrierPayment for brokerAnalytics revenue when role is Carrier', () => {
      const result = (service as any).computeDetailedAnalytics(orders, UserRole.Carrier);
      const broker = result.brokerAnalytics.find((b: any) => b.brokerId === 'b1');
      expect(broker.totalRevenue).toBe(7200); // 4500 + 2700
    });

    it('should use dispatcherPayment for brokerAnalytics revenue when role is Dispatcher', () => {
      const result = (service as any).computeDetailedAnalytics(orders, UserRole.Dispatcher);
      const broker = result.brokerAnalytics.find((b: any) => b.brokerId === 'b1');
      expect(broker.totalRevenue).toBe(400); // 250 + 150
    });

    it('should use driverPayment for brokerAnalytics revenue when role is Driver', () => {
      const result = (service as any).computeDetailedAnalytics(orders, UserRole.Driver);
      const broker = result.brokerAnalytics.find((b: any) => b.brokerId === 'b1');
      expect(broker.totalRevenue).toBe(440); // 275 + 165
    });
  });

  // ── Status transitions ────────────────────────────────────────

  describe('updateOrderStatus', () => {
    it('should allow valid transition', async () => {
      mockSend
        .mockResolvedValueOnce({
          Item: { PK: 'ORDER#order-1', SK: 'METADATA', orderId: 'order-1', orderStatus: 'Scheduled', dispatcherId: 'disp-1' },
        })
        .mockResolvedValueOnce({
          Attributes: { orderId: 'order-1', orderStatus: 'Picking Up' },
        });

      const result = await service.updateOrderStatus(
        'order-1', 'disp-1', UserRole.Dispatcher,
        { orderStatus: OrderStatus.PickingUp } as any,
      );

      expect(result.orderStatus).toBe('Picking Up');
    });

    it('should reject invalid transition with 400', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'ORDER#order-1', SK: 'METADATA', orderId: 'order-1', orderStatus: 'Delivered', driverId: 'driver-1' },
      });

      await expect(
        service.updateOrderStatus(
          'order-1', 'driver-1', UserRole.Driver,
          { orderStatus: OrderStatus.Scheduled } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject status update by non-owner with 403', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'ORDER#order-1', SK: 'METADATA', orderId: 'order-1', orderStatus: 'Scheduled', dispatcherId: 'other-disp' },
      });

      await expect(
        service.updateOrderStatus(
          'order-1', 'disp-1', UserRole.Dispatcher,
          { orderStatus: OrderStatus.PickingUp } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Dispatcher orderRate recalculation ──────────────────────

  describe('updateOrder - GSI key updates', () => {
    it('should update GSI keys when entity IDs change', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { orderId: 'order-1', dispatcherId: 'disp-1', carrierId: 'carrier-2', driverId: 'driver-2' },
      });

      await service.updateOrder('order-1', 'disp-1', UserRole.Dispatcher, {
        carrierId: 'carrier-2',
        driverId: 'driver-2',
        brokerId: 'broker-2',
      } as any);

      const updateCall = mockSend.mock.calls[0][0];
      const exprValues = updateCall.input.ExpressionAttributeValues;
      expect(exprValues[':GSI1PK']).toBe('CARRIER#carrier-2');
      expect(exprValues[':GSI3PK']).toBe('DRIVER#driver-2');
      expect(exprValues[':GSI5PK']).toBe('BROKER#broker-2');
    });
  });

  describe('updateOrder - Dispatcher orderRate recalc', () => {
    it('should recalculate all payments when orderRate changes', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'ORDER#order-1', SK: 'METADATA', dispatcherId: 'disp-1',
          orderRate: 5000, adminRate: 5, dispatcherRate: 5,
          driverRate: 0.55, mileageOrder: 500, mileageEmpty: 100, mileageTotal: 600,
          fuelGasAvgCost: 3.5, fuelGasAvgGallxMil: 0.15,
        },
      });
      mockSend.mockResolvedValueOnce({
        Attributes: { orderId: 'order-1', dispatcherId: 'disp-1', orderRate: 6000 },
      });

      await service.updateOrder('order-1', 'disp-1', UserRole.Dispatcher, {
        orderRate: 6000,
      } as any);

      const updateCall = mockSend.mock.calls[1][0];
      const exprValues = updateCall.input.ExpressionAttributeValues;
      expect(exprValues[':adminPayment']).toBe(300);       // 6000 * 5 / 100
      expect(exprValues[':dispatcherPayment']).toBe(300);  // 6000 * 5 / 100
      expect(exprValues[':carrierPayment']).toBe(5400);    // 6000 * 0.9
      expect(exprValues[':driverPayment']).toBe(275);      // 0.55 * 500
      expect(exprValues[':fuelCost']).toBe(315);           // 600 * 0.15 * 3.5
    });
  });

  // ── Soft-delete filtering ─────────────────────────────────────

  describe('getOrders - no soft-delete filter needed (hard delete)', () => {
    it('should not include isDeleted filter in query', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await service.getOrders('disp-1', UserRole.Dispatcher, {} as any);

      const queryCall = mockSend.mock.calls[0][0];
      const filterExpr = queryCall.input.FilterExpression || '';
      expect(filterExpr).not.toContain('isDeleted');
    });
  });

  // ── Role-based field filtering ────────────────────────────────

  describe('getOrderById - field filtering', () => {
    const fullOrder = {
      PK: 'ORDER#order-1', SK: 'METADATA',
      orderId: 'order-1', adminId: 'admin-1', dispatcherId: 'disp-1',
      carrierId: 'carrier-1', driverId: 'driver-1',
      orderRate: 5000, adminRate: 5, adminPayment: 250,
      dispatcherRate: 5, dispatcherPayment: 250,
      carrierRate: 90, carrierPayment: 4500,
      driverRate: 0.55, driverPayment: 275,
      fuelCost: 315, fuelGasAvgCost: 3.5, fuelGasAvgGallxMil: 0.15,
      lumperValue: 50, detentionValue: 75,
      mileageOrder: 500, orderStatus: 'Scheduled',
    };

    it('should hide driverRate/driverPayment/fuelCost from Admin', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...fullOrder } });
      const result = await service.getOrderById('order-1', 'admin-1', UserRole.Admin);
      expect(result.orderRate).toBe(5000);
      expect(result.adminPayment).toBe(250);
      expect((result as any).driverRate).toBeUndefined();
      expect((result as any).driverPayment).toBeUndefined();
      expect((result as any).fuelCost).toBeUndefined();
    });

    it('should hide driverRate/driverPayment/fuelCost from Dispatcher', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...fullOrder } });
      const result = await service.getOrderById('order-1', 'disp-1', UserRole.Dispatcher);
      expect(result.orderRate).toBe(5000);
      expect(result.dispatcherPayment).toBe(250);
      expect((result as any).adminRate).toBe(5);
      expect((result as any).adminPayment).toBe(250);
      expect((result as any).driverRate).toBeUndefined();
      expect((result as any).driverPayment).toBeUndefined();
    });

    it('should hide orderRate/adminRate/adminPayment/dispatcherRate/dispatcherPayment from Carrier', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...fullOrder } });
      const result = await service.getOrderById('order-1', 'carrier-1', UserRole.Carrier);
      expect(result.carrierPayment).toBe(4500);
      expect(result.driverPayment).toBe(275);
      expect((result as any).orderRate).toBeUndefined();
      expect((result as any).adminRate).toBeUndefined();
      expect((result as any).dispatcherPayment).toBeUndefined();
    });

    it('should only show driverPayment and mileage to Driver', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...fullOrder } });
      const result = await service.getOrderById('order-1', 'driver-1', UserRole.Driver);
      expect(result.driverPayment).toBe(275);
      expect(result.mileageOrder).toBe(500);
      expect((result as any).orderRate).toBeUndefined();
      expect((result as any).carrierPayment).toBeUndefined();
      expect((result as any).adminPayment).toBeUndefined();
    });
  });
});
