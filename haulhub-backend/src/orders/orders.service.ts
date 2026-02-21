import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { IndexSelectorService } from './index-selector.service';
import {
  Order,
  OrderStatus,
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  OrderFilters,
  UserRole,
  isTransitionAllowed,
  calculateOrderPayments,
} from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

// Fields each role is allowed to update
const ALLOWED_UPDATE_FIELDS: Record<UserRole, string[]> = {
  [UserRole.Admin]: ['dispatcherRate', 'notes'],
  [UserRole.Dispatcher]: [
    'orderStatus', 'pickupTimestamp', 'deliveryTimestamp',
    'adminId', 'carrierId', 'driverId', 'truckId', 'trailerId', 'brokerId',
    'invoiceNumber', 'brokerLoad', 'scheduledTimestamp',
    'orderRate', 'adminRate', 'dispatcherRate', 'adminPayment', 'dispatcherPayment', 'carrierPayment', 'mileageOrder', 'mileageEmpty',
    'pickupCompany', 'pickupPhone', 'pickupAddress', 'pickupCity', 'pickupState', 'pickupZip', 'pickupNotes',
    'deliveryCompany', 'deliveryPhone', 'deliveryAddress', 'deliveryCity', 'deliveryState', 'deliveryZip', 'deliveryNotes',
    'lumperValue', 'detentionValue', 'notes',
  ],
  [UserRole.Carrier]: [
    'orderStatus', 'driverId', 'truckId', 'trailerId',
    'driverRate', 'driverPayment', 'fuelGasAvgCost', 'fuelGasAvgGallxMil', 'fuelCost',
    'pickupNotes', 'deliveryNotes', 'notes',
  ],
  [UserRole.Driver]: ['notes'],
};

// Fields to strip from GET responses per role
const HIDDEN_FIELDS: Record<UserRole, string[]> = {
  [UserRole.Admin]: ['driverRate', 'driverPayment', 'fuelCost', 'fuelGasAvgCost', 'fuelGasAvgGallxMil'],
  [UserRole.Dispatcher]: ['driverRate', 'driverPayment', 'fuelCost', 'fuelGasAvgCost', 'fuelGasAvgGallxMil'],
  [UserRole.Carrier]: ['orderRate', 'adminRate', 'adminPayment', 'dispatcherRate', 'dispatcherPayment'],
  [UserRole.Driver]: [
    'orderRate', 'adminRate', 'adminPayment', 'dispatcherRate', 'dispatcherPayment',
    'carrierRate', 'carrierPayment', 'driverRate', 'fuelCost', 'fuelGasAvgCost', 'fuelGasAvgGallxMil',
    'lumperValue', 'detentionValue',
  ],
};

// Maps role to the order field that stores the caller's userId
const OWNERSHIP_FIELD: Record<UserRole, string> = {
  [UserRole.Admin]: 'adminId',
  [UserRole.Dispatcher]: 'dispatcherId',
  [UserRole.Carrier]: 'carrierId',
  [UserRole.Driver]: 'driverId',
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
    private readonly indexSelectorService: IndexSelectorService,
  ) {}

  private get tableName(): string {
    return this.configService.ordersTableName;
  }

  private get ddb() {
    return this.awsService.getDynamoDBClient();
  }

  // ── Create ──────────────────────────────────────────────────────

  async createOrder(dispatcherId: string, dto: CreateOrderDto): Promise<Order> {
    // Lookup driver rate and truck fuel defaults
    const [driverRecord, truckRecord] = await Promise.all([
      this.lookupEntity(this.configService.v2UsersTableName, 'USER', dto.driverId),
      this.lookupEntity(this.configService.v2TrucksTableName, 'TRUCK', dto.truckId),
    ]);

    const driverRate = dto.driverRate ?? driverRecord?.rate ?? 0;
    const fuelGasAvgCost = dto.fuelGasAvgCost ?? truckRecord?.fuelGasAvgCost ?? 0;
    const fuelGasAvgGallxMil = dto.fuelGasAvgGallxMil ?? truckRecord?.fuelGasAvgGallxMil ?? 0;

    // Look up admin rate from admin record
    const adminRecord = await this.lookupEntity(this.configService.v2UsersTableName, 'USER', dto.adminId);
    const adminRate = adminRecord?.rate ?? 5;
    const dispatcherRate = 10 - adminRate;

    const payments = calculateOrderPayments({
      orderRate: dto.orderRate,
      adminRate,
      dispatcherRate,
      driverRate,
      mileageOrder: dto.mileageOrder || 0,
      mileageEmpty: dto.mileageEmpty || 0,
      fuelGasAvgCost,
      fuelGasAvgGallxMil,
    });

    const orderId = uuidv4();
    const now = new Date().toISOString();
    const scheduledTimestamp = dto.scheduledTimestamp;

    const order: Order = {
      orderId,
      adminId: dto.adminId,
      dispatcherId,
      carrierId: dto.carrierId,
      driverId: dto.driverId,
      truckId: dto.truckId,
      trailerId: dto.trailerId,
      brokerId: dto.brokerId,
      invoiceNumber: dto.invoiceNumber,
      brokerLoad: dto.brokerLoad,
      orderStatus: OrderStatus.Scheduled,
      scheduledTimestamp,
      pickupTimestamp: null,
      deliveryTimestamp: null,
      pickupCompany: dto.pickupCompany || '',
      pickupAddress: dto.pickupAddress || '',
      pickupCity: dto.pickupCity || '',
      pickupState: dto.pickupState || '',
      pickupZip: dto.pickupZip || '',
      pickupPhone: dto.pickupPhone || '',
      pickupNotes: dto.pickupNotes || '',
      deliveryCompany: dto.deliveryCompany || '',
      deliveryAddress: dto.deliveryAddress || '',
      deliveryCity: dto.deliveryCity || '',
      deliveryState: dto.deliveryState || '',
      deliveryZip: dto.deliveryZip || '',
      deliveryPhone: dto.deliveryPhone || '',
      deliveryNotes: dto.deliveryNotes || '',
      mileageEmpty: dto.mileageEmpty || 0,
      mileageOrder: dto.mileageOrder || 0,
      mileageTotal: payments.mileageTotal,
      orderRate: dto.orderRate,
      adminRate,
      dispatcherRate,
      carrierRate: 90,
      driverRate,
      adminPayment: payments.adminPayment,
      dispatcherPayment: payments.dispatcherPayment,
      carrierPayment: payments.carrierPayment,
      driverPayment: payments.driverPayment,
      fuelGasAvgCost,
      fuelGasAvgGallxMil,
      fuelCost: payments.fuelCost,
      lumperValue: dto.lumperValue || 0,
      detentionValue: dto.detentionValue || 0,
      notes: dto.notes || '',
      createdAt: now,
      updatedAt: now,
      lastModifiedBy: dispatcherId,
    };

    const skSuffix = `${scheduledTimestamp}#${orderId}`;

    await this.ddb.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        PK: `ORDER#${orderId}`,
        SK: 'METADATA',
        GSI1PK: `CARRIER#${dto.carrierId}`,
        GSI1SK: skSuffix,
        GSI2PK: `DISPATCHER#${dispatcherId}`,
        GSI2SK: skSuffix,
        GSI3PK: `DRIVER#${dto.driverId}`,
        GSI3SK: skSuffix,
        GSI4PK: `ADMIN#${dto.adminId}`,
        GSI4SK: skSuffix,
        GSI5PK: `BROKER#${dto.brokerId}`,
        GSI5SK: skSuffix,
        ...order,
      },
    }));

    return order;
  }

  // ── Read ────────────────────────────────────────────────────────

  async getOrderById(
    orderId: string,
    userId: string,
    role: UserRole,
  ): Promise<Order> {
    const result = await this.ddb.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: `ORDER#${orderId}`, SK: 'METADATA' },
    }));

    if (!result.Item) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const order = this.mapItem(result.Item);

    // Verify ownership
    const ownerField = OWNERSHIP_FIELD[role];
    if (order[ownerField] !== userId) {
      throw new ForbiddenException('You do not have permission to access this order');
    }

    return this.filterFields(order, role);
  }

  async getOrders(
    userId: string,
    role: UserRole,
    filters: OrderFilters & { includeAggregates?: boolean; includeDetailedAnalytics?: boolean; returnAllOrders?: boolean },
  ): Promise<{ orders: Order[]; lastEvaluatedKey?: string; aggregates?: any; entityIds?: string[]; detailedAnalytics?: any; paymentReport?: any }> {
    const { indexName, pkField, pkPrefix } = this.indexSelectorService.selectIndex(role);
    const skField = pkField.replace('PK', 'SK');

    // Base query — key condition only (date range on SK)
    const exprValues: Record<string, any> = { ':pk': `${pkPrefix}${userId}` };
    const exprNames: Record<string, string> = { [`#${pkField}`]: pkField };
    let skCondition = '';
    if (filters.startDate && filters.endDate) {
      skCondition = ` AND #sk BETWEEN :start AND :end`;
      exprNames['#sk'] = skField;
      exprValues[':start'] = filters.startDate;
      exprValues[':end'] = filters.endDate + '\uffff';
    } else if (filters.startDate) {
      skCondition = ` AND #sk >= :start`;
      exprNames['#sk'] = skField;
      exprValues[':start'] = filters.startDate;
    } else if (filters.endDate) {
      skCondition = ` AND #sk <= :end`;
      exprNames['#sk'] = skField;
      exprValues[':end'] = filters.endDate + '\uffff';
    }

    const baseQuery: any = {
      TableName: this.tableName,
      IndexName: indexName,
      KeyConditionExpression: `#${pkField} = :pk${skCondition}`,
      ExpressionAttributeNames: { ...exprNames },
      ExpressionAttributeValues: { ...exprValues },
      ScanIndexForward: false,
    };

    // ── Pass 1: Aggregates (fetch ALL orders in window) ──
    let aggregates: any;
    let detailedAnalytics: any;
    let paymentReport: any;
    let entityIds: string[] | undefined;
    if (filters.includeAggregates || filters.includeDetailedAnalytics) {
      const allOrdersUnfiltered: Order[] = [];
      const allOrdersFiltered: Order[] = [];
      let lastKey: any;
      do {
        const q = { ...baseQuery, ExclusiveStartKey: lastKey };
        const result = await this.ddb.send(new QueryCommand(q));
        for (const item of result.Items || []) {
          const order = this.filterFields(this.mapItem(item), role);
          allOrdersUnfiltered.push(order);
          if (this.matchesFilters(order, filters, role)) {
            allOrdersFiltered.push(order);
          }
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      // Chart aggregates from FILTERED orders (respond to table filters)
      aggregates = this.computeAggregates(allOrdersFiltered, role);
      // Entity IDs from full date range
      entityIds = this.collectEntityIds(allOrdersUnfiltered);
      // Analytics + payments from UNFILTERED orders (full date range, ignore table filters)
      if (filters.includeDetailedAnalytics) {
        detailedAnalytics = this.computeDetailedAnalytics(allOrdersUnfiltered, role);
        paymentReport = this.computePaymentSummary(allOrdersUnfiltered, role);
      }

      // Export mode: return all filtered orders, skip Pass 2
      if (filters.returnAllOrders) {
        const result: any = { orders: allOrdersFiltered };
        if (aggregates) result.aggregates = aggregates;
        if (entityIds) result.entityIds = entityIds;
        if (detailedAnalytics) result.detailedAnalytics = detailedAnalytics;
        if (paymentReport) result.paymentReport = paymentReport;
        return result;
      }
    }

    // ── Pass 2: Paginated orders with app-layer filtering ──
    const pageSize = Number(filters.limit) || 10;
    const matching: Order[] = [];
    let cursor: any = filters.lastEvaluatedKey
      ? JSON.parse(Buffer.from(filters.lastEvaluatedKey, 'base64').toString())
      : undefined;

    while (matching.length < pageSize) {
      const q = { ...baseQuery, ExclusiveStartKey: cursor };
      const result = await this.ddb.send(new QueryCommand(q));
      const items = result.Items || [];
      let exhaustedBatch = true;

      for (const item of items) {
        const order = this.filterFields(this.mapItem(item), role);
        if (this.matchesFilters(order, filters, role)) {
          matching.push(order);
          if (matching.length >= pageSize) {
            // Build cursor from this item's keys so next page resumes after it
            cursor = this.buildCursorFromItem(item, indexName, pkField);
            exhaustedBatch = false;
            break;
          }
        }
      }

      if (exhaustedBatch) {
        cursor = result.LastEvaluatedKey;
        if (!cursor) break; // no more data in DynamoDB
      }
    }

    // Check if there's actually more data after our cursor
    let hasMore = !!cursor;
    if (hasMore && matching.length < pageSize) {
      hasMore = false; // we stopped because we ran out of data, not because page is full
    }

    let lastEvaluatedKey: string | undefined;
    if (hasMore) {
      lastEvaluatedKey = Buffer.from(JSON.stringify(cursor)).toString('base64');
    }

    const result: any = { orders: matching.slice(0, pageSize), lastEvaluatedKey };
    if (aggregates) result.aggregates = aggregates;
    if (entityIds) result.entityIds = entityIds;
    if (detailedAnalytics) result.detailedAnalytics = detailedAnalytics;
    if (paymentReport) result.paymentReport = paymentReport;
    return result;
  }

  private matchesFilters(order: Order, filters: any, role: UserRole): boolean {
    if (filters.orderStatus && (order as any).orderStatus !== filters.orderStatus) return false;
    if (filters.brokerId && (order as any).brokerId !== filters.brokerId) return false;
    if (filters.carrierId && role !== UserRole.Carrier && (order as any).carrierId !== filters.carrierId) return false;
    if (filters.dispatcherId && role !== UserRole.Dispatcher && (order as any).dispatcherId !== filters.dispatcherId) return false;
    if (filters.driverId && role !== UserRole.Driver && (order as any).driverId !== filters.driverId) return false;
    if (filters.truckId && (order as any).truckId !== filters.truckId) return false;
    return true;
  }

  private computeAggregates(orders: Order[], role: UserRole): any {
    const statusSummary: Record<string, number> = {};
    const payments: Record<string, number> = {};
    const brokerMap = new Map<string, { revenue: number; count: number }>();
    const driverMap = new Map<string, number>();
    const truckMap = new Map<string, number>();
    const dispatcherMap = new Map<string, { profit: number; count: number }>();
    const carrierMap = new Map<string, number>();
    const monthlyEarnings: Record<string, { realized: number; potential: number }> = {};
    const paidStatuses = ['WaitingRC', 'ReadyToPay'];

    for (const o of orders as any[]) {
      statusSummary[o.orderStatus] = (statusSummary[o.orderStatus] || 0) + 1;

      for (const key of Object.keys(o).filter(k => k.endsWith('Payment') || k === 'fuelCost' || k === 'lumper' || k === 'detentionValue')) {
        payments[key] = (payments[key] || 0) + (o[key] || 0);
      }

      if (o.brokerId) {
        const b = brokerMap.get(o.brokerId) || { revenue: 0, count: 0 };
        b.revenue += o.carrierPayment || o.orderRate || 0;
        b.count++;
        brokerMap.set(o.brokerId, b);
      }
      if (o.driverId) driverMap.set(o.driverId, (driverMap.get(o.driverId) || 0) + 1);
      if (o.truckId) truckMap.set(o.truckId, (truckMap.get(o.truckId) || 0) + 1);
      if (o.carrierId) carrierMap.set(o.carrierId, (carrierMap.get(o.carrierId) || 0) + 1);
      if (o.dispatcherId) {
        const d = dispatcherMap.get(o.dispatcherId) || { profit: 0, count: 0 };
        d.profit += o.carrierPayment || o.dispatcherPayment || 0;
        d.count++;
        dispatcherMap.set(o.dispatcherId, d);
      }

      // Monthly earnings (dispatcher-relevant)
      const month = (o.scheduledTimestamp || '').substring(0, 7);
      if (month && o.orderStatus !== 'Canceled') {
        if (!monthlyEarnings[month]) monthlyEarnings[month] = { realized: 0, potential: 0 };
        const amt = o.dispatcherPayment || 0;
        if (paidStatuses.includes(o.orderStatus)) monthlyEarnings[month].realized += amt;
        else monthlyEarnings[month].potential += amt;
      }
    }

    return {
      totalOrders: orders.length,
      statusSummary,
      paymentSummary: payments,
      monthlyEarnings,
      topPerformers: {
        topBrokers: [...brokerMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)
          .map(([id, v]) => ({ id, revenue: this.round2(v.revenue), count: v.count })),
        topDrivers: [...driverMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, trips]) => ({ id, trips })),
        topTrucks: [...truckMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, trips]) => ({ id, trips })),
        topCarriers: [...carrierMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, trips]) => ({ id, trips })),
        topDispatchers: [...dispatcherMap.entries()].sort((a, b) => b[1].profit - a[1].profit).slice(0, 5)
          .map(([id, v]) => ({ id, profit: this.round2(v.profit), count: v.count })),
      },
    };
  }

  private computeDetailedAnalytics(orders: Order[], role: UserRole): any {
    const active = orders.filter(o => o.orderStatus !== OrderStatus.Canceled) as any[];

    const driverMap = new Map<string, any[]>();
    const vehicleMap = new Map<string, any[]>();
    const brokerMap = new Map<string, any[]>();
    const dispatcherMap = new Map<string, any[]>();
    const carrierMap = new Map<string, any[]>();

    for (const o of active) {
      if (o.driverId) { if (!driverMap.has(o.driverId)) driverMap.set(o.driverId, []); driverMap.get(o.driverId)!.push(o); }
      if (o.truckId) { if (!vehicleMap.has(o.truckId)) vehicleMap.set(o.truckId, []); vehicleMap.get(o.truckId)!.push(o); }
      if (o.brokerId) { if (!brokerMap.has(o.brokerId)) brokerMap.set(o.brokerId, []); brokerMap.get(o.brokerId)!.push(o); }
      if (o.dispatcherId) { if (!dispatcherMap.has(o.dispatcherId)) dispatcherMap.set(o.dispatcherId, []); dispatcherMap.get(o.dispatcherId)!.push(o); }
      if (o.carrierId) { if (!carrierMap.has(o.carrierId)) carrierMap.set(o.carrierId, []); carrierMap.get(o.carrierId)!.push(o); }
    }

    const sum = (arr: any[], f: string) => arr.reduce((s, o) => s + (o[f] || 0), 0);
    const completed = (arr: any[]) => arr.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'ReadyToPay').length;

    const revenue = (arr: any[]) => {
      switch (role) {
        case UserRole.Admin: return sum(arr, 'adminPayment');
        case UserRole.Dispatcher: return sum(arr, 'dispatcherPayment');
        case UserRole.Driver: return sum(arr, 'driverPayment');
        default: return sum(arr, 'carrierPayment');
      }
    };
    const expenses = (arr: any[]) => {
      switch (role) {
        case UserRole.Admin: return sum(arr, 'lumperValue') + sum(arr, 'detentionValue');
        case UserRole.Dispatcher: return 0;
        case UserRole.Driver: return 0;
        default: return sum(arr, 'driverPayment') + sum(arr, 'fuelCost');
      }
    };
    const profit = (arr: any[]) => this.round2(revenue(arr) - expenses(arr));

    // Fuel analytics
    const fuelOrders = active.filter(o => o.fuelCost > 0);
    const totalFuel = sum(fuelOrders, 'fuelCost');
    const totalFuelMiles = sum(fuelOrders, 'mileageTotal');
    const totalGallons = fuelOrders.reduce((s, o) => s + ((o.fuelGasAvgGallxMil || 0) * (o.mileageTotal || 0)), 0);

    return {
      tripAnalytics: {
        totalTrips: active.length,
        completedTrips: completed(active),
        statusBreakdown: active.reduce((acc, o) => { acc[o.orderStatus] = (acc[o.orderStatus] || 0) + 1; return acc; }, {} as Record<string, number>),
        totalRevenue: this.round2(revenue(active)),
        totalExpenses: this.round2(expenses(active)),
        totalProfit: profit(active),
        totalMiles: this.round2(sum(active, 'mileageTotal')),
      },
      driverPerformance: [...driverMap.entries()].map(([driverId, trips]) => ({
        driverId, totalTrips: trips.length, completedTrips: completed(trips),
        totalDistance: this.round2(sum(trips, 'mileageTotal')), totalEarnings: this.round2(sum(trips, 'driverPayment')),
        totalRevenue: this.round2(revenue(trips)), totalProfit: profit(trips),
        averageEarningsPerTrip: this.round2(trips.length ? sum(trips, 'driverPayment') / trips.length : 0),
        completionRate: this.round2(trips.length ? (completed(trips) / trips.length) * 100 : 0),
      })),
      vehicleUtilization: [...vehicleMap.entries()].map(([vehicleId, trips]) => ({
        vehicleId, totalTrips: trips.length, totalDistance: this.round2(sum(trips, 'mileageTotal')),
        totalRevenue: this.round2(revenue(trips)), totalProfit: profit(trips),
        averageRevenue: this.round2(trips.length ? revenue(trips) / trips.length : 0),
      })),
      brokerAnalytics: [...brokerMap.entries()].map(([brokerId, trips]) => ({
        brokerId, totalTrips: trips.length, completedTrips: completed(trips),
        totalRevenue: this.round2(sum(trips, 'carrierPayment')),
        averageRevenue: this.round2(trips.length ? sum(trips, 'carrierPayment') / trips.length : 0),
        totalDistance: this.round2(sum(trips, 'mileageTotal')),
        completionRate: this.round2(trips.length ? (completed(trips) / trips.length) * 100 : 0),
      })),
      dispatcherPerformance: [...dispatcherMap.entries()].map(([dispatcherId, trips]) => ({
        dispatcherId, totalTrips: trips.length, completedTrips: completed(trips),
        totalRevenue: this.round2(sum(trips, 'dispatcherPayment')),
        totalProfit: this.round2(sum(trips, 'dispatcherPayment')),
        averageProfit: this.round2(trips.length ? sum(trips, 'dispatcherPayment') / trips.length : 0),
        completionRate: this.round2(trips.length ? (completed(trips) / trips.length) * 100 : 0),
      })),
      carrierPerformance: [...carrierMap.entries()].map(([carrierId, trips]) => {
        const rev = this.round2(sum(trips, 'carrierPayment'));
        const exp = this.round2(sum(trips, 'driverPayment') + sum(trips, 'fuelCost'));
        return {
          carrierId, totalTrips: trips.length, completedTrips: completed(trips),
          totalRevenue: rev, totalExpenses: exp, totalProfit: this.round2(rev - exp),
          averageProfit: this.round2(trips.length ? (rev - exp) / trips.length : 0),
          completionRate: this.round2(trips.length ? (completed(trips) / trips.length) * 100 : 0),
        };
      }),
      fuelAnalytics: {
        tripsWithFuelData: fuelOrders.length,
        totalFuelCost: this.round2(totalFuel),
        averageFuelCost: this.round2(fuelOrders.length ? totalFuel / fuelOrders.length : 0),
        totalGallonsUsed: this.round2(totalGallons),
        averageFuelPrice: this.round2(totalGallons > 0 ? totalFuel / totalGallons : 0),
        averageGallonsPerMile: this.round2(totalFuelMiles > 0 ? totalGallons / totalFuelMiles : 0),
        vehicleFuelEfficiency: [...vehicleMap.entries()].map(([vehicleId, trips]) => {
          const vFuel = trips.filter(o => o.fuelCost > 0);
          const vGallons = vFuel.reduce((s, o) => s + ((o.fuelGasAvgGallxMil || 0) * (o.mileageTotal || 0)), 0);
          const vMiles = sum(vFuel, 'mileageTotal');
          return {
            vehicleId, totalTrips: vFuel.length, totalDistance: this.round2(vMiles),
            totalFuelCost: this.round2(sum(vFuel, 'fuelCost')),
            averageGallonsPerMile: this.round2(vMiles > 0 ? vGallons / vMiles : 0),
            averageMPG: this.round2(vGallons > 0 ? vMiles / vGallons : 0),
          };
        }).sort((a, b) => b.averageMPG - a.averageMPG),
      },
    };
  }

  private computePaymentSummary(orders: Order[], role: UserRole): any {
    const active = orders.filter(o => o.orderStatus !== OrderStatus.Canceled) as any[];

    // Group by broker, carrier, and driver
    const brokerGroups = new Map<string, { total: number; count: number }>();
    const carrierGroups = new Map<string, { total: number; count: number }>();
    const driverGroups = new Map<string, { total: number; count: number }>();
    for (const o of active) {
      if (o.brokerId) {
        const g = brokerGroups.get(o.brokerId) || { total: 0, count: 0 };
        g.total += o.orderRate || 0;
        g.count++;
        brokerGroups.set(o.brokerId, g);
      }
      if (o.carrierId) {
        const g = carrierGroups.get(o.carrierId) || { total: 0, count: 0 };
        g.total += o.carrierPayment || 0;
        g.count++;
        carrierGroups.set(o.carrierId, g);
      }
      if (o.driverId) {
        const g = driverGroups.get(o.driverId) || { total: 0, count: 0 };
        g.total += o.driverPayment || 0;
        g.count++;
        driverGroups.set(o.driverId, g);
      }
    }

    const groupedByBroker: Record<string, { totalPayment: number; tripCount: number }> = {};
    for (const [id, g] of brokerGroups) groupedByBroker[id] = { totalPayment: this.round2(g.total), tripCount: g.count };

    const groupedByCarrier: Record<string, { totalPayment: number; tripCount: number }> = {};
    for (const [id, g] of carrierGroups) groupedByCarrier[id] = { totalPayment: this.round2(g.total), tripCount: g.count };

    const groupedByDriver: Record<string, { totalPayment: number; tripCount: number }> = {};
    for (const [id, g] of driverGroups) groupedByDriver[id] = { totalPayment: this.round2(g.total), tripCount: g.count };

    const base = { orderCount: active.length, groupedByBroker, groupedByCarrier, groupedByDriver };

    switch (role) {
      case UserRole.Admin:
        return { ...base,
          totalOrderRate: this.sum(active, 'orderRate'),
          totalAdminPayment: this.sum(active, 'adminPayment'),
          totalLumperValue: this.sum(active, 'lumperValue'),
          totalDetentionValue: this.sum(active, 'detentionValue'),
          profit: this.round2(this.sum(active, 'adminPayment') - this.sum(active, 'lumperValue') - this.sum(active, 'detentionValue')),
        };
      case UserRole.Dispatcher:
        return { ...base,
          totalOrderRate: this.sum(active, 'orderRate'),
          totalDispatcherPayment: this.sum(active, 'dispatcherPayment'),
          profit: this.sum(active, 'dispatcherPayment'),
        };
      case UserRole.Carrier:
        return { ...base,
          totalCarrierPayment: this.sum(active, 'carrierPayment'),
          totalDriverPayment: this.sum(active, 'driverPayment'),
          totalFuelCost: this.sum(active, 'fuelCost'),
          profit: this.round2(this.sum(active, 'carrierPayment') - this.sum(active, 'driverPayment') - this.sum(active, 'fuelCost')),
        };
      case UserRole.Driver:
        return { ...base,
          totalDriverPayment: this.sum(active, 'driverPayment'),
          totalDistance: this.sum(active, 'mileageOrder'),
          profit: this.sum(active, 'driverPayment'),
        };
    }
  }

  private collectEntityIds(orders: Order[]): string[] {
    const ids = new Set<string>();
    for (const o of orders as any[]) {
      for (const field of ['adminId', 'dispatcherId', 'carrierId', 'driverId', 'truckId', 'trailerId', 'brokerId']) {
        if (o[field]) ids.add(o[field]);
      }
    }
    return [...ids];
  }

  // ── Update ──────────────────────────────────────────────────────

  async updateOrder(
    orderId: string,
    userId: string,
    role: UserRole,
    dto: UpdateOrderDto,
  ): Promise<Order> {
    // Validate field-level allowlist
    const allowed = ALLOWED_UPDATE_FIELDS[role];
    const dtoFields = Object.keys(dto).filter(k => (dto as any)[k] !== undefined);
    const disallowed = dtoFields.filter(f => !allowed.includes(f));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Fields not permitted for your role: ${disallowed.join(', ')}`,
      );
    }

    if (dtoFields.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    // Build update expression
    const exprParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, any> = {};

    for (const field of dtoFields) {
      exprParts.push(`#${field} = :${field}`);
      exprNames[`#${field}`] = field;
      exprValues[`:${field}`] = (dto as any)[field];
    }

    // Update GSI keys when entity IDs change
    const GSI_KEY_MAP: Record<string, string> = {
      carrierId: 'GSI1PK',
      driverId: 'GSI3PK',
      brokerId: 'GSI5PK',
    };
    for (const [field, gsiPk] of Object.entries(GSI_KEY_MAP)) {
      if ((dto as any)[field] !== undefined) {
        const prefix = gsiPk === 'GSI1PK' ? 'CARRIER#' : gsiPk === 'GSI3PK' ? 'DRIVER#' : 'BROKER#';
        exprParts.push(`#${gsiPk} = :${gsiPk}`);
        exprNames[`#${gsiPk}`] = gsiPk;
        exprValues[`:${gsiPk}`] = `${prefix}${(dto as any)[field]}`;
      }
    }

    // Auto-recalculation — fetch current order once if any recalc needed
    const needsRecalc =
      (role === UserRole.Admin && dto.dispatcherRate !== undefined) ||
      (role === UserRole.Dispatcher && ((dto as any).orderRate !== undefined || (dto as any).adminRate !== undefined || (dto as any).dispatcherRate !== undefined)) ||
      (role === UserRole.Carrier && (dto.driverRate !== undefined || dto.fuelGasAvgCost !== undefined || dto.fuelGasAvgGallxMil !== undefined));

    let current: Record<string, any> | undefined;
    if (needsRecalc) {
      current = await this.getRawOrder(orderId);
    }

    if (role === UserRole.Admin && dto.dispatcherRate !== undefined && current) {
      const newDispatcherRate = dto.dispatcherRate;
      const newAdminRate = 10 - newDispatcherRate;
      const orderRate = current.orderRate || 0;

      exprParts.push('#adminRate = :adminRate');
      exprNames['#adminRate'] = 'adminRate';
      exprValues[':adminRate'] = newAdminRate;

      exprParts.push('#adminPayment = :adminPayment');
      exprNames['#adminPayment'] = 'adminPayment';
      exprValues[':adminPayment'] = this.round2(orderRate * newAdminRate / 100);

      exprParts.push('#dispatcherPayment = :dispatcherPayment');
      exprNames['#dispatcherPayment'] = 'dispatcherPayment';
      exprValues[':dispatcherPayment'] = this.round2(orderRate * newDispatcherRate / 100);
    }

    if (role === UserRole.Dispatcher && needsRecalc && current) {
      const newOrderRate = (dto as any).orderRate ?? current.orderRate ?? 0;
      const adminRate = (dto as any).adminRate ?? current.adminRate ?? 5;
      const dispatcherRate = (dto as any).dispatcherRate ?? current.dispatcherRate ?? 5;
      const driverRate = current.driverRate || 0;
      const mileageOrder = (dto as any).mileageOrder ?? current.mileageOrder ?? 0;
      const mileageEmpty = (dto as any).mileageEmpty ?? current.mileageEmpty ?? 0;
      const mileageTotal = mileageOrder + mileageEmpty;
      const fuelGasAvgCost = current.fuelGasAvgCost || 0;
      const fuelGasAvgGallxMil = current.fuelGasAvgGallxMil || 0;

      const adminPayment = this.round2(newOrderRate * adminRate / 100);
      const dispatcherPayment = this.round2(newOrderRate * dispatcherRate / 100);
      const carrierPayment = this.round2(newOrderRate - adminPayment - dispatcherPayment);

      if (!exprNames['#adminRate']) {
        exprParts.push('#adminRate = :adminRate');
        exprNames['#adminRate'] = 'adminRate';
      }
      exprValues[':adminRate'] = adminRate;

      if (!exprNames['#dispatcherRate']) {
        exprParts.push('#dispatcherRate = :dispatcherRate');
        exprNames['#dispatcherRate'] = 'dispatcherRate';
      }
      exprValues[':dispatcherRate'] = dispatcherRate;

      if (!exprNames['#adminPayment']) {
        exprParts.push('#adminPayment = :adminPayment');
        exprNames['#adminPayment'] = 'adminPayment';
      }
      exprValues[':adminPayment'] = adminPayment;

      if (!exprNames['#dispatcherPayment']) {
        exprParts.push('#dispatcherPayment = :dispatcherPayment');
        exprNames['#dispatcherPayment'] = 'dispatcherPayment';
      }
      exprValues[':dispatcherPayment'] = dispatcherPayment;

      if (!exprNames['#carrierPayment']) {
        exprParts.push('#carrierPayment = :carrierPayment');
        exprNames['#carrierPayment'] = 'carrierPayment';
      }
      exprValues[':carrierPayment'] = carrierPayment;

      exprParts.push('#driverPayment = :driverPayment');
      exprNames['#driverPayment'] = 'driverPayment';
      exprValues[':driverPayment'] = this.round2(driverRate * mileageOrder);

      exprParts.push('#mileageTotal = :mileageTotal');
      exprNames['#mileageTotal'] = 'mileageTotal';
      exprValues[':mileageTotal'] = mileageTotal;

      exprParts.push('#fuelCost = :fuelCost');
      exprNames['#fuelCost'] = 'fuelCost';
      exprValues[':fuelCost'] = this.round2(mileageTotal * fuelGasAvgGallxMil * fuelGasAvgCost);
    }

    if (role === UserRole.Carrier && dto.driverRate !== undefined && current) {
      if (!exprNames['#driverPayment']) {
        exprParts.push('#driverPayment = :driverPayment');
        exprNames['#driverPayment'] = 'driverPayment';
        exprValues[':driverPayment'] = this.round2(dto.driverRate * (current.mileageOrder || 0));
      }
    }

    if (role === UserRole.Carrier && (dto.fuelGasAvgCost !== undefined || dto.fuelGasAvgGallxMil !== undefined) && current) {
      if (!exprNames['#fuelCost']) {
        const cost = dto.fuelGasAvgCost ?? current.fuelGasAvgCost ?? 0;
        const gallxMil = dto.fuelGasAvgGallxMil ?? current.fuelGasAvgGallxMil ?? 0;
        const mileageTotal = current.mileageTotal || 0;
        exprParts.push('#fuelCost = :fuelCost');
        exprNames['#fuelCost'] = 'fuelCost';
        exprValues[':fuelCost'] = this.round2(mileageTotal * gallxMil * cost);
      }
    }

    // Always update audit fields
    exprParts.push('#updatedAt = :updatedAt');
    exprNames['#updatedAt'] = 'updatedAt';
    exprValues[':updatedAt'] = new Date().toISOString();

    exprParts.push('#lastModifiedBy = :lastModifiedBy');
    exprNames['#lastModifiedBy'] = 'lastModifiedBy';
    exprValues[':lastModifiedBy'] = userId;

    // Ownership guard rail
    const ownerField = OWNERSHIP_FIELD[role];
    exprValues[':callerId'] = userId;

    try {
      const result = await this.ddb.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: `ORDER#${orderId}`, SK: 'METADATA' },
        UpdateExpression: `SET ${exprParts.join(', ')}`,
        ConditionExpression: `attribute_exists(PK) AND #ownerField = :callerId`,
        ExpressionAttributeNames: { ...exprNames, '#ownerField': ownerField },
        ExpressionAttributeValues: exprValues,
        ReturnValues: 'ALL_NEW',
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      }));

      return this.filterFields(this.mapItem(result.Attributes!), role);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        if (error.Item) {
          throw new ForbiddenException('You do not have permission to update this order');
        }
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string,
    userId: string,
    role: UserRole,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    // Get current order to validate transition
    const current = await this.getRawOrder(orderId);

    // Verify ownership
    const ownerField = OWNERSHIP_FIELD[role];
    if (current[ownerField] !== userId) {
      throw new ForbiddenException('You do not have permission to update this order');
    }

    const currentStatus = current.orderStatus as OrderStatus;
    if (!isTransitionAllowed(currentStatus, dto.orderStatus, role)) {
      throw new BadRequestException(
        `Status transition from ${currentStatus} to ${dto.orderStatus} is not allowed for role ${role}`,
      );
    }

    const exprParts = ['#orderStatus = :newStatus', '#updatedAt = :updatedAt', '#lastModifiedBy = :lastModifiedBy'];
    const exprNames: Record<string, string> = {
      '#orderStatus': 'orderStatus',
      '#updatedAt': 'updatedAt',
      '#lastModifiedBy': 'lastModifiedBy',
    };
    const exprValues: Record<string, any> = {
      ':newStatus': dto.orderStatus,
      ':updatedAt': new Date().toISOString(),
      ':lastModifiedBy': userId,
    };

    // Auto-set timestamps
    if (dto.orderStatus === OrderStatus.PickingUp) {
      exprParts.push('#pickupTimestamp = :pickupTimestamp');
      exprNames['#pickupTimestamp'] = 'pickupTimestamp';
      exprValues[':pickupTimestamp'] = new Date().toISOString();
    }
    if (dto.orderStatus === OrderStatus.Delivered) {
      exprParts.push('#deliveryTimestamp = :deliveryTimestamp');
      exprNames['#deliveryTimestamp'] = 'deliveryTimestamp';
      exprValues[':deliveryTimestamp'] = dto.deliveryTimestamp || new Date().toISOString();
    }
    if (dto.notes) {
      exprParts.push('#notes = :notes');
      exprNames['#notes'] = 'notes';
      exprValues[':notes'] = dto.notes;
    }

    const result = await this.ddb.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { PK: `ORDER#${orderId}`, SK: 'METADATA' },
      UpdateExpression: `SET ${exprParts.join(', ')}`,
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    return this.filterFields(this.mapItem(result.Attributes!), role);
  }

  // ── Delete (hard) ────────────────────────────────────────────

  async deleteOrder(orderId: string, dispatcherId: string): Promise<void> {
    try {
      await this.ddb.send(new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: `ORDER#${orderId}`, SK: 'METADATA' },
        ConditionExpression: 'attribute_exists(PK) AND #dispatcherId = :callerId',
        ExpressionAttributeNames: { '#dispatcherId': 'dispatcherId' },
        ExpressionAttributeValues: { ':callerId': dispatcherId },
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      }));
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        if (error.Item) {
          throw new ForbiddenException('You do not have permission to delete this order');
        }
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      throw error;
    }
  }

  // ── Payment Reports ─────────────────────────────────────────────

  async getPaymentReport(
    userId: string,
    role: UserRole,
    filters: OrderFilters,
  ): Promise<any> {
    // Fetch all matching orders (no pagination limit for reports)
    const allOrders: Order[] = [];
    let lastKey: string | undefined;

    do {
      const result = await this.getOrders(userId, role, {
        ...filters,
        limit: 100,
        lastEvaluatedKey: lastKey,
      });
      allOrders.push(...result.orders);
      lastKey = result.lastEvaluatedKey;
    } while (lastKey);

    // Exclude Canceled orders from financial reports
    const activeOrders = allOrders.filter(o => o.orderStatus !== OrderStatus.Canceled);
    switch (role) {
      case UserRole.Admin:
        return {
          totalOrderRate: this.sum(activeOrders, 'orderRate'),
          totalAdminPayment: this.sum(activeOrders, 'adminPayment'),
          totalLumperValue: this.sum(activeOrders, 'lumperValue'),
          totalDetentionValue: this.sum(activeOrders, 'detentionValue'),
          profit: this.round2(
            this.sum(activeOrders, 'adminPayment') -
            this.sum(activeOrders, 'lumperValue') -
            this.sum(activeOrders, 'detentionValue'),
          ),
          orderCount: activeOrders.length,
          orders: activeOrders,
        };
      case UserRole.Dispatcher:
        return {
          totalOrderRate: this.sum(activeOrders, 'orderRate'),
          totalDispatcherPayment: this.sum(activeOrders, 'dispatcherPayment'),
          profit: this.sum(activeOrders, 'dispatcherPayment'),
          orderCount: activeOrders.length,
          orders: activeOrders,
        };
      case UserRole.Carrier:
        return {
          totalCarrierPayment: this.sum(activeOrders, 'carrierPayment'),
          totalDriverPayment: this.sum(activeOrders, 'driverPayment'),
          totalFuelCost: this.sum(activeOrders, 'fuelCost'),
          profit: this.round2(
            this.sum(activeOrders, 'carrierPayment') -
            this.sum(activeOrders, 'driverPayment') -
            this.sum(activeOrders, 'fuelCost'),
          ),
          orderCount: activeOrders.length,
          orders: activeOrders,
        };
      case UserRole.Driver:
        return {
          totalDriverPayment: this.sum(activeOrders, 'driverPayment'),
          totalDistance: this.sum(activeOrders, 'mileageOrder'),
          profit: this.sum(activeOrders, 'driverPayment'),
          orderCount: activeOrders.length,
          orders: activeOrders,
        };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private async getRawOrder(orderId: string): Promise<Record<string, any>> {
    const result = await this.ddb.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: `ORDER#${orderId}`, SK: 'METADATA' },
    }));
    if (!result.Item) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return result.Item;
  }

  private async lookupEntity(
    tableName: string,
    prefix: string,
    entityId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const result = await this.ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `${prefix}#${entityId}`, SK: 'METADATA' },
      }));
      return result.Item || null;
    } catch {
      return null;
    }
  }

  private mapItem(item: Record<string, any>): Order {
    // Strip DynamoDB key attributes
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, GSI4PK, GSI4SK, GSI5PK, GSI5SK, ...order } = item;
    return order as Order;
  }

  private filterFields(order: Order, role: UserRole): Order {
    const hidden = HIDDEN_FIELDS[role];
    if (!hidden || hidden.length === 0) return order;
    const filtered = { ...order };
    for (const field of hidden) {
      delete (filtered as any)[field];
    }
    return filtered;
  }

  private buildCursorFromItem(item: Record<string, any>, indexName: string, pkField: string): Record<string, any> {
    const skField = pkField.replace('PK', 'SK');
    return {
      PK: item.PK,
      SK: item.SK,
      [pkField]: item[pkField],
      [skField]: item[skField],
    };
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private sum(orders: any[], field: string): number {
    return this.round2(orders.reduce((acc, o) => acc + (o[field] || 0), 0));
  }
}
