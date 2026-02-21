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
    'carrierId', 'driverId', 'truckId', 'trailerId', 'brokerId',
    'invoiceNumber', 'brokerLoad', 'scheduledTimestamp',
    'orderRate', 'mileageOrder', 'mileageEmpty',
    'pickupCompany', 'pickupPhone', 'pickupAddress', 'pickupCity', 'pickupState', 'pickupZip', 'pickupNotes',
    'deliveryCompany', 'deliveryPhone', 'deliveryAddress', 'deliveryCity', 'deliveryState', 'deliveryZip', 'deliveryNotes',
    'lumperValue', 'detentionValue', 'notes',
  ],
  [UserRole.Carrier]: [
    'driverId', 'truckId', 'trailerId',
    'driverRate', 'fuelGasAvgCost', 'fuelGasAvgGallxMil', 'notes',
  ],
  [UserRole.Driver]: ['notes'],
};

// Fields to strip from GET responses per role
const HIDDEN_FIELDS: Record<UserRole, string[]> = {
  [UserRole.Admin]: ['driverRate', 'driverPayment', 'fuelCost', 'fuelGasAvgCost', 'fuelGasAvgGallxMil'],
  [UserRole.Dispatcher]: ['adminRate', 'adminPayment', 'driverRate', 'driverPayment', 'fuelCost', 'fuelGasAvgCost', 'fuelGasAvgGallxMil'],
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
    filters: OrderFilters & { includeAggregates?: boolean },
  ): Promise<{ orders: Order[]; lastEvaluatedKey?: string; aggregates?: any; entityIds?: string[] }> {
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

    // ── Pass 1: Aggregates (fetch ALL orders in window, no filters) ──
    let aggregates: any;
    let entityIds: string[] | undefined;
    if (filters.includeAggregates) {
      const allOrders: Order[] = [];
      let lastKey: any;
      do {
        const q = { ...baseQuery, ExclusiveStartKey: lastKey };
        const result = await this.ddb.send(new QueryCommand(q));
        for (const item of result.Items || []) {
          allOrders.push(this.filterFields(this.mapItem(item), role));
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      aggregates = this.computeAggregates(allOrders, role);
      entityIds = this.collectEntityIds(allOrders);
    }

    // ── Pass 2: Paginated orders with app-layer filtering ──
    const pageSize = Number(filters.limit) || 25;
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

    for (const o of orders as any[]) {
      statusSummary[o.orderStatus] = (statusSummary[o.orderStatus] || 0) + 1;

      // Accumulate all visible payment fields
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
      if (o.truckId) {
        const t = truckMap.get(o.truckId) || 0;
        truckMap.set(o.truckId, t + 1);
      }
      if (o.dispatcherId) {
        const d = dispatcherMap.get(o.dispatcherId) || { profit: 0, count: 0 };
        d.profit += o.carrierPayment || o.dispatcherPayment || 0;
        d.count++;
        dispatcherMap.set(o.dispatcherId, d);
      }
    }

    return {
      totalOrders: orders.length,
      statusSummary,
      paymentSummary: payments,
      topPerformers: {
        topBrokers: [...brokerMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)
          .map(([id, v]) => ({ id, revenue: this.round2(v.revenue), count: v.count })),
        topDrivers: [...driverMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, trips]) => ({ id, trips })),
        topTrucks: [...truckMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, trips]) => ({ id, trips })),
        topDispatchers: [...dispatcherMap.entries()].sort((a, b) => b[1].profit - a[1].profit).slice(0, 5)
          .map(([id, v]) => ({ id, profit: this.round2(v.profit), count: v.count })),
      },
    };
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
      (role === UserRole.Dispatcher && (dto as any).orderRate !== undefined) ||
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

    if (role === UserRole.Dispatcher && (dto as any).orderRate !== undefined && current) {
      const newOrderRate = (dto as any).orderRate;
      const adminRate = current.adminRate || 5;
      const dispatcherRate = current.dispatcherRate || 5;
      const driverRate = current.driverRate || 0;
      const mileageOrder = (dto as any).mileageOrder ?? current.mileageOrder ?? 0;
      const mileageEmpty = (dto as any).mileageEmpty ?? current.mileageEmpty ?? 0;
      const mileageTotal = mileageOrder + mileageEmpty;
      const fuelGasAvgCost = current.fuelGasAvgCost || 0;
      const fuelGasAvgGallxMil = current.fuelGasAvgGallxMil || 0;

      exprParts.push('#adminPayment = :adminPayment');
      exprNames['#adminPayment'] = 'adminPayment';
      exprValues[':adminPayment'] = this.round2(newOrderRate * adminRate / 100);

      exprParts.push('#dispatcherPayment = :dispatcherPayment');
      exprNames['#dispatcherPayment'] = 'dispatcherPayment';
      exprValues[':dispatcherPayment'] = this.round2(newOrderRate * dispatcherRate / 100);

      exprParts.push('#carrierPayment = :carrierPayment');
      exprNames['#carrierPayment'] = 'carrierPayment';
      exprValues[':carrierPayment'] = this.round2(newOrderRate * 0.9);

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
      exprParts.push('#driverPayment = :driverPayment');
      exprNames['#driverPayment'] = 'driverPayment';
      exprValues[':driverPayment'] = this.round2(dto.driverRate * (current.mileageOrder || 0));
    }

    if (role === UserRole.Carrier && (dto.fuelGasAvgCost !== undefined || dto.fuelGasAvgGallxMil !== undefined) && current) {
      const cost = dto.fuelGasAvgCost ?? current.fuelGasAvgCost ?? 0;
      const gallxMil = dto.fuelGasAvgGallxMil ?? current.fuelGasAvgGallxMil ?? 0;
      const mileageTotal = current.mileageTotal || 0;

      exprParts.push('#fuelCost = :fuelCost');
      exprNames['#fuelCost'] = 'fuelCost';
      exprValues[':fuelCost'] = this.round2(mileageTotal * gallxMil * cost);
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
