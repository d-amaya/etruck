import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { 
  Truck, 
  RegisterTruckDto, 
  UpdateTruckDto, 
  VerifyTruckDto, 
  UpdateTruckStatusDto,
  VehicleVerificationStatus,
  validateVIN,
  validateLicensePlate,
  validateVehicleYear,
  validateVehicleName
} from '@haulhub/shared';

@Injectable()
export class TruckService {
  private readonly tableName = process.env.DYNAMODB_TABLE_NAME || 'HaulHub-MainTable-dev';

  constructor(private readonly dynamoDBClient: DynamoDBClient) {}

  async registerTruck(ownerId: string, registerTruckDto: RegisterTruckDto): Promise<Truck> {
    // Validate input data
    this.validateTruckData(registerTruckDto);

    const truckId = uuidv4();
    const now = new Date().toISOString();

    const truck: Truck = {
      truckId,
      ownerId,
      name: registerTruckDto.name,
      vin: registerTruckDto.vin.toUpperCase(),
      year: registerTruckDto.year,
      brand: registerTruckDto.brand,
      color: registerTruckDto.color,
      licensePlate: registerTruckDto.licensePlate.toUpperCase(),
      verificationStatus: VehicleVerificationStatus.Pending,
      verificationDocuments: [],
      isActive: registerTruckDto.isActive ?? true,
      notes: registerTruckDto.notes,
      createdAt: now,
      updatedAt: now,
    };

    // Store truck record
    const putCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall({
        PK: `TRUCK#${truckId}`,
        SK: 'PROFILE',
        GSI1PK: `OWNER#${ownerId}#TRUCK`,
        GSI1SK: `${truck.isActive ? 'ACTIVE' : 'INACTIVE'}#${now}#${truckId}`,
        ...truck,
      }),
    });

    await this.dynamoDBClient.send(putCommand);

    return truck;
  }

  async getTruck(truckId: string): Promise<Truck> {
    const getCommand = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRUCK#${truckId}`,
        SK: 'PROFILE',
      }),
    });

    const result = await this.dynamoDBClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    const truck = unmarshall(result.Item) as Truck;
    return truck;
  }

  async getTrucksByOwner(ownerId: string, activeOnly: boolean = false): Promise<Truck[]> {
    const queryCommand = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: activeOnly ? 'isActive = :active' : undefined,
      ExpressionAttributeValues: marshall({
        ':pk': `OWNER#${ownerId}#TRUCK`,
        ...(activeOnly && { ':active': true }),
      }),
    });

    const result = await this.dynamoDBClient.send(queryCommand);

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => unmarshall(item) as Truck);
  }

  async updateTruck(truckId: string, updateTruckDto: UpdateTruckDto): Promise<Truck> {
    // Validate input data if provided
    if (updateTruckDto.vin) {
      if (!validateVIN(updateTruckDto.vin)) {
        throw new BadRequestException('Invalid VIN format');
      }
    }

    if (updateTruckDto.licensePlate) {
      if (!validateLicensePlate(updateTruckDto.licensePlate)) {
        throw new BadRequestException('Invalid license plate format');
      }
    }

    if (updateTruckDto.year) {
      if (!validateVehicleYear(updateTruckDto.year)) {
        throw new BadRequestException('Invalid vehicle year');
      }
    }

    if (updateTruckDto.name) {
      if (!validateVehicleName(updateTruckDto.name)) {
        throw new BadRequestException('Invalid vehicle name');
      }
    }

    const now = new Date().toISOString();
    
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updateTruckDto.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = updateTruckDto.name;
    }

    if (updateTruckDto.vin !== undefined) {
      updateExpressions.push('vin = :vin');
      expressionAttributeValues[':vin'] = updateTruckDto.vin.toUpperCase();
    }

    if (updateTruckDto.year !== undefined) {
      updateExpressions.push('#year = :year');
      expressionAttributeNames['#year'] = 'year';
      expressionAttributeValues[':year'] = updateTruckDto.year;
    }

    if (updateTruckDto.brand !== undefined) {
      updateExpressions.push('brand = :brand');
      expressionAttributeValues[':brand'] = updateTruckDto.brand;
    }

    if (updateTruckDto.color !== undefined) {
      updateExpressions.push('color = :color');
      expressionAttributeValues[':color'] = updateTruckDto.color;
    }

    if (updateTruckDto.licensePlate !== undefined) {
      updateExpressions.push('licensePlate = :licensePlate');
      expressionAttributeValues[':licensePlate'] = updateTruckDto.licensePlate.toUpperCase();
    }

    if (updateTruckDto.isActive !== undefined) {
      updateExpressions.push('isActive = :isActive');
      expressionAttributeValues[':isActive'] = updateTruckDto.isActive;
    }

    if (updateTruckDto.notes !== undefined) {
      updateExpressions.push('notes = :notes');
      expressionAttributeValues[':notes'] = updateTruckDto.notes;
    }

    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now;

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRUCK#${truckId}`,
        SK: 'PROFILE',
      }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.dynamoDBClient.send(updateCommand);

    if (!result.Attributes) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    return unmarshall(result.Attributes) as Truck;
  }

  async updateTruckStatus(truckId: string, updateStatusDto: UpdateTruckStatusDto): Promise<Truck> {
    const now = new Date().toISOString();

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRUCK#${truckId}`,
        SK: 'PROFILE',
      }),
      UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':isActive': updateStatusDto.isActive,
        ':updatedAt': now,
      }),
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.dynamoDBClient.send(updateCommand);

    if (!result.Attributes) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    return unmarshall(result.Attributes) as Truck;
  }

  async verifyTruck(truckId: string, verifyTruckDto: VerifyTruckDto): Promise<Truck> {
    const now = new Date().toISOString();

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRUCK#${truckId}`,
        SK: 'PROFILE',
      }),
      UpdateExpression: 'SET verificationStatus = :status, rejectionReason = :reason, updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':status': verifyTruckDto.decision,
        ':reason': verifyTruckDto.reason || null,
        ':updatedAt': now,
      }),
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.dynamoDBClient.send(updateCommand);

    if (!result.Attributes) {
      throw new NotFoundException(`Truck with ID ${truckId} not found`);
    }

    return unmarshall(result.Attributes) as Truck;
  }

  private validateTruckData(truckDto: RegisterTruckDto): void {
    if (!validateVehicleName(truckDto.name)) {
      throw new BadRequestException('Invalid truck name');
    }

    if (!validateVIN(truckDto.vin)) {
      throw new BadRequestException('Invalid VIN format');
    }

    if (!validateVehicleYear(truckDto.year)) {
      throw new BadRequestException('Invalid vehicle year');
    }

    if (!validateLicensePlate(truckDto.licensePlate)) {
      throw new BadRequestException('Invalid license plate format');
    }

    if (!truckDto.brand || truckDto.brand.trim().length === 0) {
      throw new BadRequestException('Brand is required');
    }

    if (!truckDto.color || truckDto.color.trim().length === 0) {
      throw new BadRequestException('Color is required');
    }
  }
}