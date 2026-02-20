import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AssetsService {
  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {}

  private get ddb() {
    return this.awsService.getDynamoDBClient();
  }

  // ── Trucks ──────────────────────────────────────────────────

  async getTrucksByCarrier(carrierId: string): Promise<any[]> {
    const result = await this.ddb.send(new QueryCommand({
      TableName: this.configService.v2TrucksTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `CARRIER#${carrierId}` },
    }));
    return result.Items || [];
  }

  async getTruckById(truckId: string): Promise<any> {
    const result = await this.ddb.send(new GetCommand({
      TableName: this.configService.v2TrucksTableName,
      Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
    }));
    if (!result.Item) throw new NotFoundException(`Truck ${truckId} not found`);
    return result.Item;
  }

  async createTruck(carrierId: string, dto: any): Promise<any> {
    if (dto.vin) {
      const dup = await this.scanForField(this.configService.v2TrucksTableName, 'vin', dto.vin);
      if (dup) throw new ConflictException(`VIN ${dto.vin} already exists`);
    }
    if (dto.plate) {
      const dup = await this.scanForField(this.configService.v2TrucksTableName, 'plate', dto.plate);
      if (dup) throw new ConflictException(`Plate ${dto.plate} already exists`);
    }

    const truckId = uuidv4();
    const now = new Date().toISOString();
    const item = {
      PK: `TRUCK#${truckId}`, SK: 'METADATA',
      GSI1PK: `CARRIER#${carrierId}`, GSI1SK: `TRUCK#${truckId}`,
      truckId, carrierId, ...dto,
      isActive: true, createdAt: now, updatedAt: now,
      createdBy: carrierId, lastModifiedBy: carrierId,
    };
    await this.ddb.send(new PutCommand({
      TableName: this.configService.v2TrucksTableName, Item: item,
    }));
    return item;
  }

  async updateTruck(truckId: string, carrierId: string, dto: any): Promise<any> {
    const truck = await this.getTruckById(truckId);
    if (truck.carrierId !== carrierId) throw new ForbiddenException('Not your truck');

    const sets: string[] = ['#u = :u'];
    const names: Record<string, string> = { '#u': 'updatedAt' };
    const values: Record<string, any> = { ':u': new Date().toISOString() };

    for (const [k, v] of Object.entries(dto)) {
      if (['truckId', 'carrierId', 'PK', 'SK'].includes(k)) continue;
      const alias = `#f${Object.keys(names).length}`;
      const valAlias = `:v${Object.keys(values).length}`;
      sets.push(`${alias} = ${valAlias}`);
      names[alias] = k;
      values[valAlias] = v;
    }
    values[':lm'] = carrierId;
    sets.push('#lm = :lm');
    names['#lm'] = 'lastModifiedBy';

    const result = await this.ddb.send(new UpdateCommand({
      TableName: this.configService.v2TrucksTableName,
      Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  async setTruckActive(truckId: string, carrierId: string, isActive: boolean): Promise<any> {
    const truck = await this.getTruckById(truckId);
    if (truck.carrierId !== carrierId) throw new ForbiddenException('Not your truck');

    const result = await this.ddb.send(new UpdateCommand({
      TableName: this.configService.v2TrucksTableName,
      Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
      UpdateExpression: 'SET isActive = :a, updatedAt = :u',
      ExpressionAttributeValues: { ':a': isActive, ':u': new Date().toISOString() },
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  // ── Trailers ────────────────────────────────────────────────

  async getTrailersByCarrier(carrierId: string): Promise<any[]> {
    const result = await this.ddb.send(new QueryCommand({
      TableName: this.configService.v2TrailersTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `CARRIER#${carrierId}` },
    }));
    return result.Items || [];
  }

  async getTrailerById(trailerId: string): Promise<any> {
    const result = await this.ddb.send(new GetCommand({
      TableName: this.configService.v2TrailersTableName,
      Key: { PK: `TRAILER#${trailerId}`, SK: 'METADATA' },
    }));
    if (!result.Item) throw new NotFoundException(`Trailer ${trailerId} not found`);
    return result.Item;
  }

  async createTrailer(carrierId: string, dto: any): Promise<any> {
    if (dto.vin) {
      const dup = await this.scanForField(this.configService.v2TrailersTableName, 'vin', dto.vin);
      if (dup) throw new ConflictException(`VIN ${dto.vin} already exists`);
    }
    if (dto.plate) {
      const dup = await this.scanForField(this.configService.v2TrailersTableName, 'plate', dto.plate);
      if (dup) throw new ConflictException(`Plate ${dto.plate} already exists`);
    }

    const trailerId = uuidv4();
    const now = new Date().toISOString();
    const item = {
      PK: `TRAILER#${trailerId}`, SK: 'METADATA',
      GSI1PK: `CARRIER#${carrierId}`, GSI1SK: `TRAILER#${trailerId}`,
      trailerId, carrierId, ...dto,
      isActive: true, createdAt: now, updatedAt: now,
      createdBy: carrierId, lastModifiedBy: carrierId,
    };
    await this.ddb.send(new PutCommand({
      TableName: this.configService.v2TrailersTableName, Item: item,
    }));
    return item;
  }

  async updateTrailer(trailerId: string, carrierId: string, dto: any): Promise<any> {
    const trailer = await this.getTrailerById(trailerId);
    if (trailer.carrierId !== carrierId) throw new ForbiddenException('Not your trailer');

    const sets: string[] = ['#u = :u'];
    const names: Record<string, string> = { '#u': 'updatedAt' };
    const values: Record<string, any> = { ':u': new Date().toISOString() };

    for (const [k, v] of Object.entries(dto)) {
      if (['trailerId', 'carrierId', 'PK', 'SK'].includes(k)) continue;
      const alias = `#f${Object.keys(names).length}`;
      const valAlias = `:v${Object.keys(values).length}`;
      sets.push(`${alias} = ${valAlias}`);
      names[alias] = k;
      values[valAlias] = v;
    }
    values[':lm'] = carrierId;
    sets.push('#lm = :lm');
    names['#lm'] = 'lastModifiedBy';

    const result = await this.ddb.send(new UpdateCommand({
      TableName: this.configService.v2TrailersTableName,
      Key: { PK: `TRAILER#${trailerId}`, SK: 'METADATA' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  async setTrailerActive(trailerId: string, carrierId: string, isActive: boolean): Promise<any> {
    const trailer = await this.getTrailerById(trailerId);
    if (trailer.carrierId !== carrierId) throw new ForbiddenException('Not your trailer');

    const result = await this.ddb.send(new UpdateCommand({
      TableName: this.configService.v2TrailersTableName,
      Key: { PK: `TRAILER#${trailerId}`, SK: 'METADATA' },
      UpdateExpression: 'SET isActive = :a, updatedAt = :u',
      ExpressionAttributeValues: { ':a': isActive, ':u': new Date().toISOString() },
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async scanForField(table: string, field: string, value: string): Promise<any | null> {
    const result = await this.ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: `#f = :v`,
      ExpressionAttributeNames: { '#f': field },
      ExpressionAttributeValues: { ':v': value },
      Limit: 1,
    }));
    return result.Items?.[0] || null;
  }
}
