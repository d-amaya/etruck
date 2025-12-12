import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { 
  Trailer, 
  RegisterTrailerDto, 
  UpdateTrailerDto, 
  VerifyTrailerDto, 
  UpdateTrailerStatusDto,
  VehicleVerificationStatus,
  validateVIN,
  validateLicensePlate,
  validateVehicleYear,
  validateVehicleName
} from '@haulhub/shared';

@Injectable()
export class TrailerService {
  private readonly tableName = process.env.DYNAMODB_TABLE_NAME || 'HaulHub-MainTable-dev';

  constructor(private readonly dynamoDBClient: DynamoDBClient) {}

  async registerTrailer(ownerId: string, registerTrailerDto: RegisterTrailerDto): Promise<Trailer> {
    // Validate input data
    this.validateTrailerData(registerTrailerDto);

    const trailerId = uuidv4();
    const now = new Date().toISOString();

    const trailer: Trailer = {
      trailerId,
      ownerId,
      name: registerTrailerDto.name,
      vin: registerTrailerDto.vin.toUpperCase(),
      year: registerTrailerDto.year,
      brand: registerTrailerDto.brand,
      color: registerTrailerDto.color,
      licensePlate: registerTrailerDto.licensePlate.toUpperCase(),
      verificationStatus: VehicleVerificationStatus.Pending,
      verificationDocuments: [],
      isActive: registerTrailerDto.isActive ?? true,
      notes: registerTrailerDto.notes,
      createdAt: now,
      updatedAt: now,
    };

    // Store trailer record
    const putCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall({
        PK: `TRAILER#${trailerId}`,
        SK: 'PROFILE',
        GSI1PK: `OWNER#${ownerId}#TRAILER`,
        GSI1SK: `${trailer.isActive ? 'ACTIVE' : 'INACTIVE'}#${now}#${trailerId}`,
        ...trailer,
      }),
    });

    await this.dynamoDBClient.send(putCommand);

    return trailer;
  }

  async getTrailer(trailerId: string): Promise<Trailer> {
    const getCommand = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRAILER#${trailerId}`,
        SK: 'PROFILE',
      }),
    });

    const result = await this.dynamoDBClient.send(getCommand);

    if (!result.Item) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    const trailer = unmarshall(result.Item) as Trailer;
    return trailer;
  }

  async getTrailersByOwner(ownerId: string, activeOnly: boolean = false): Promise<Trailer[]> {
    const queryCommand = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: activeOnly ? 'isActive = :active' : undefined,
      ExpressionAttributeValues: marshall({
        ':pk': `OWNER#${ownerId}#TRAILER`,
        ...(activeOnly && { ':active': true }),
      }),
    });

    const result = await this.dynamoDBClient.send(queryCommand);

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => unmarshall(item) as Trailer);
  }

  async updateTrailer(trailerId: string, updateTrailerDto: UpdateTrailerDto): Promise<Trailer> {
    // Validate input data if provided
    if (updateTrailerDto.vin) {
      if (!validateVIN(updateTrailerDto.vin)) {
        throw new BadRequestException('Invalid VIN format');
      }
    }

    if (updateTrailerDto.licensePlate) {
      if (!validateLicensePlate(updateTrailerDto.licensePlate)) {
        throw new BadRequestException('Invalid license plate format');
      }
    }

    if (updateTrailerDto.year) {
      if (!validateVehicleYear(updateTrailerDto.year)) {
        throw new BadRequestException('Invalid vehicle year');
      }
    }

    if (updateTrailerDto.name) {
      if (!validateVehicleName(updateTrailerDto.name)) {
        throw new BadRequestException('Invalid vehicle name');
      }
    }

    const now = new Date().toISOString();
    
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updateTrailerDto.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = updateTrailerDto.name;
    }

    if (updateTrailerDto.vin !== undefined) {
      updateExpressions.push('vin = :vin');
      expressionAttributeValues[':vin'] = updateTrailerDto.vin.toUpperCase();
    }

    if (updateTrailerDto.year !== undefined) {
      updateExpressions.push('#year = :year');
      expressionAttributeNames['#year'] = 'year';
      expressionAttributeValues[':year'] = updateTrailerDto.year;
    }

    if (updateTrailerDto.brand !== undefined) {
      updateExpressions.push('brand = :brand');
      expressionAttributeValues[':brand'] = updateTrailerDto.brand;
    }

    if (updateTrailerDto.color !== undefined) {
      updateExpressions.push('color = :color');
      expressionAttributeValues[':color'] = updateTrailerDto.color;
    }

    if (updateTrailerDto.licensePlate !== undefined) {
      updateExpressions.push('licensePlate = :licensePlate');
      expressionAttributeValues[':licensePlate'] = updateTrailerDto.licensePlate.toUpperCase();
    }

    if (updateTrailerDto.isActive !== undefined) {
      updateExpressions.push('isActive = :isActive');
      expressionAttributeValues[':isActive'] = updateTrailerDto.isActive;
    }

    if (updateTrailerDto.notes !== undefined) {
      updateExpressions.push('notes = :notes');
      expressionAttributeValues[':notes'] = updateTrailerDto.notes;
    }

    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now;

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRAILER#${trailerId}`,
        SK: 'PROFILE',
      }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.dynamoDBClient.send(updateCommand);

    if (!result.Attributes) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    return unmarshall(result.Attributes) as Trailer;
  }

  async updateTrailerStatus(trailerId: string, updateStatusDto: UpdateTrailerStatusDto): Promise<Trailer> {
    const now = new Date().toISOString();

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRAILER#${trailerId}`,
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
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    return unmarshall(result.Attributes) as Trailer;
  }

  async verifyTrailer(trailerId: string, verifyTrailerDto: VerifyTrailerDto): Promise<Trailer> {
    const now = new Date().toISOString();

    const updateCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        PK: `TRAILER#${trailerId}`,
        SK: 'PROFILE',
      }),
      UpdateExpression: 'SET verificationStatus = :status, rejectionReason = :reason, updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':status': verifyTrailerDto.decision,
        ':reason': verifyTrailerDto.reason || null,
        ':updatedAt': now,
      }),
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.dynamoDBClient.send(updateCommand);

    if (!result.Attributes) {
      throw new NotFoundException(`Trailer with ID ${trailerId} not found`);
    }

    return unmarshall(result.Attributes) as Trailer;
  }

  private validateTrailerData(trailerDto: RegisterTrailerDto): void {
    if (!validateVehicleName(trailerDto.name)) {
      throw new BadRequestException('Invalid trailer name');
    }

    if (!validateVIN(trailerDto.vin)) {
      throw new BadRequestException('Invalid VIN format');
    }

    if (!validateVehicleYear(trailerDto.year)) {
      throw new BadRequestException('Invalid vehicle year');
    }

    if (!validateLicensePlate(trailerDto.licensePlate)) {
      throw new BadRequestException('Invalid license plate format');
    }

    if (!trailerDto.brand || trailerDto.brand.trim().length === 0) {
      throw new BadRequestException('Brand is required');
    }

    if (!trailerDto.color || trailerDto.color.trim().length === 0) {
      throw new BadRequestException('Color is required');
    }
  }
}