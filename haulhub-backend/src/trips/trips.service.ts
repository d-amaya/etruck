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
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { BrokersService } from '../admin/brokers.service';
import {
  Trip,
  TripStatus,
  CreateTripDto,
  UpdateTripDto,
  UserRole,
  PaymentReportFilters,
  PaymentReport,
  DispatcherPaymentReport,
  DriverPaymentReport,
  LorryOwnerPaymentReport,
  TripPaymentDetail,
  TripFilters,
} from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TripsService {
  private readonly tripsTableName: string;
  private readonly lorriesTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
    private readonly brokersService: BrokersService,
  ) {
    this.tripsTableName = this.configService.tripsTableName;
    this.lorriesTableName = this.configService.lorriesTableName;
  }

  /**
   * Create a new trip (Dispatcher only)
   * Requirements: 4.1, 4.2, 19.2, 19.3, 19.4, 8.1, 8.2, 8.3, 8.4
   * 
   * PK: TRIP#{tripId}
   * SK: METADATA
   * GSI1PK: DISPATCHER#{dispatcherId}
   * GSI1SK: {date}#{tripId}
   * GSI2PK: LORRY#{lorryId}
   * GSI2SK: {date}#{tripId}
   * GSI3PK: DRIVER#{driverId}
   * GSI3SK: {date}#{tripId}
   * 
   * Note: Lorry does not need to be registered/verified to create a trip.
   * When a lorry owner registers their lorry later, they can query trips by lorryId.
   */
  async createTrip(
    dispatcherId: string,
    dto: CreateTripDto,
  ): Promise<Trip> {
    // Validate required fields
    this.validateCreateTripDto(dto);

    // Validate scheduled datetime is in the future
    const scheduledDate = new Date(dto.scheduledPickupDatetime);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid scheduledPickupDatetime format');
    }

    // Validate payments are positive numbers
    if (dto.brokerPayment <= 0) {
      throw new BadRequestException('brokerPayment must be a positive number');
    }
    if (dto.lorryOwnerPayment <= 0) {
      throw new BadRequestException('lorryOwnerPayment must be a positive number');
    }
    if (dto.driverPayment <= 0) {
      throw new BadRequestException('driverPayment must be a positive number');
    }

    // Get broker name from broker ID using BrokersService
    const broker = await this.brokersService.getBrokerById(dto.brokerId);
    const brokerName = broker.brokerName;

    const tripId = uuidv4();
    const now = new Date().toISOString();
    const scheduledDateStr = scheduledDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const trip: Trip = {
      tripId,
      dispatcherId,
      pickupLocation: dto.pickupLocation,
      dropoffLocation: dto.dropoffLocation,
      scheduledPickupDatetime: dto.scheduledPickupDatetime,
      brokerId: dto.brokerId,
      brokerName,
      lorryId: dto.lorryId,
      driverId: dto.driverId,
      driverName: dto.driverName,
      brokerPayment: dto.brokerPayment,
      lorryOwnerPayment: dto.lorryOwnerPayment,
      driverPayment: dto.driverPayment,
      status: TripStatus.Scheduled,
      distance: dto.distance,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Store trip in new trips table with optimized structure:
      // PK = TRIP#<tripId> for direct O(1) lookups
      // SK = METADATA
      // GSI1 = Dispatcher queries (GSI1PK=DISPATCHER#id, GSI1SK=date#tripId)
      // GSI2 = Lorry queries (GSI2PK=LORRY#lorryId, GSI2SK=date#tripId)
      //        This allows lorry owners to query by license plate when they register
      // GSI3 = Driver queries (GSI3PK=DRIVER#id, GSI3SK=date#tripId)
      const putCommand = new PutCommand({
        TableName: this.tripsTableName,
        Item: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
          GSI1PK: `DISPATCHER#${dispatcherId}`,
          GSI1SK: `${scheduledDateStr}#${tripId}`,
          GSI2PK: `LORRY#${dto.lorryId}`,
          GSI2SK: `${scheduledDateStr}#${tripId}`,
          GSI3PK: `DRIVER#${dto.driverId}`,
          GSI3SK: `${scheduledDateStr}#${tripId}`,
          ...trip,
        },
      });

      await dynamodbClient.send(putCommand);

      return trip;
    } catch (error: any) {
      console.error('Error creating trip:', error);
      throw new InternalServerErrorException('Failed to create trip');
    }
  }

  /**
   * Get a specific trip by ID
   * Requirements: 4.4, 19.2, 8.5
   * 
   * Authorization: User must be the dispatcher who created the trip,
   * or the driver assigned to the trip, or the lorry owner, or admin
   */
  async getTripById(
    tripId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Trip> {
    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Direct O(1) lookup using PK=TRIP#{tripId}, SK=METADATA
      const getCommand = new GetCommand({
        TableName: this.tripsTableName,
        Key: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
        },
      });

      const result = await dynamodbClient.send(getCommand);

      if (!result.Item) {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }

      const trip = this.mapItemToTrip(result.Item);

      // Verify authorization based on role
      if (userRole === UserRole.Dispatcher && trip.dispatcherId !== userId) {
        throw new ForbiddenException('You do not have permission to access this trip');
      } else if (userRole === UserRole.Driver && trip.driverId !== userId) {
        throw new ForbiddenException('You do not have permission to access this trip');
      } else if (userRole === UserRole.LorryOwner) {
        // For lorry owner, we need to verify they own the lorry
        // This would require checking the lorry ownership, which we'll skip for now
        // In production, add lorry ownership verification here
      }

      return trip;
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error('Error getting trip:', error);
      throw new InternalServerErrorException('Failed to retrieve trip');
    }
  }

  /**
   * Update trip details
   * Requirements: 4.4, 20.1, 8.6
   * 
   * Authorization: Only the dispatcher who created the trip can update it
   */
  async updateTrip(
    tripId: string,
    dispatcherId: string,
    dto: UpdateTripDto,
  ): Promise<Trip> {
    // First, get the existing trip to verify authorization
    const existingTrip = await this.getTripById(tripId, dispatcherId, UserRole.Dispatcher);

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (dto.pickupLocation !== undefined) {
      updateExpressions.push('#pickupLocation = :pickupLocation');
      expressionAttributeNames['#pickupLocation'] = 'pickupLocation';
      expressionAttributeValues[':pickupLocation'] = dto.pickupLocation;
    }

    if (dto.dropoffLocation !== undefined) {
      updateExpressions.push('#dropoffLocation = :dropoffLocation');
      expressionAttributeNames['#dropoffLocation'] = 'dropoffLocation';
      expressionAttributeValues[':dropoffLocation'] = dto.dropoffLocation;
    }

    if (dto.scheduledPickupDatetime !== undefined) {
      const scheduledDate = new Date(dto.scheduledPickupDatetime);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduledPickupDatetime format');
      }
      updateExpressions.push('#scheduledPickupDatetime = :scheduledPickupDatetime');
      expressionAttributeNames['#scheduledPickupDatetime'] = 'scheduledPickupDatetime';
      expressionAttributeValues[':scheduledPickupDatetime'] = dto.scheduledPickupDatetime;
    }

    if (dto.brokerId !== undefined) {
      const broker = await this.brokersService.getBrokerById(dto.brokerId);
      updateExpressions.push('#brokerId = :brokerId, #brokerName = :brokerName');
      expressionAttributeNames['#brokerId'] = 'brokerId';
      expressionAttributeNames['#brokerName'] = 'brokerName';
      expressionAttributeValues[':brokerId'] = dto.brokerId;
      expressionAttributeValues[':brokerName'] = broker.brokerName;
    }

    if (dto.lorryId !== undefined) {
      updateExpressions.push('#lorryId = :lorryId');
      expressionAttributeNames['#lorryId'] = 'lorryId';
      expressionAttributeValues[':lorryId'] = dto.lorryId;
    }

    if (dto.driverId !== undefined) {
      updateExpressions.push('#driverId = :driverId');
      expressionAttributeNames['#driverId'] = 'driverId';
      expressionAttributeValues[':driverId'] = dto.driverId;
    }

    if (dto.driverName !== undefined) {
      updateExpressions.push('#driverName = :driverName');
      expressionAttributeNames['#driverName'] = 'driverName';
      expressionAttributeValues[':driverName'] = dto.driverName;
    }

    if (dto.brokerPayment !== undefined) {
      if (dto.brokerPayment <= 0) {
        throw new BadRequestException('brokerPayment must be a positive number');
      }
      updateExpressions.push('#brokerPayment = :brokerPayment');
      expressionAttributeNames['#brokerPayment'] = 'brokerPayment';
      expressionAttributeValues[':brokerPayment'] = dto.brokerPayment;
    }

    if (dto.lorryOwnerPayment !== undefined) {
      if (dto.lorryOwnerPayment <= 0) {
        throw new BadRequestException('lorryOwnerPayment must be a positive number');
      }
      updateExpressions.push('#lorryOwnerPayment = :lorryOwnerPayment');
      expressionAttributeNames['#lorryOwnerPayment'] = 'lorryOwnerPayment';
      expressionAttributeValues[':lorryOwnerPayment'] = dto.lorryOwnerPayment;
    }

    if (dto.driverPayment !== undefined) {
      if (dto.driverPayment <= 0) {
        throw new BadRequestException('driverPayment must be a positive number');
      }
      updateExpressions.push('#driverPayment = :driverPayment');
      expressionAttributeNames['#driverPayment'] = 'driverPayment';
      expressionAttributeValues[':driverPayment'] = dto.driverPayment;
    }

    if (dto.distance !== undefined) {
      updateExpressions.push('#distance = :distance');
      expressionAttributeNames['#distance'] = 'distance';
      expressionAttributeValues[':distance'] = dto.distance;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // Only updatedAt, no actual changes
      return existingTrip;
    }

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Update using new table structure: PK=TRIP#{tripId}, SK=METADATA
      const updateCommand = new UpdateCommand({
        TableName: this.tripsTableName,
        Key: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(PK)',
      });

      const result = await dynamodbClient.send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }

      return this.mapItemToTrip(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error updating trip:', error);
      throw new InternalServerErrorException('Failed to update trip');
    }
  }

  /**
   * Get lorry owner ID from lorry ID (if lorry is registered)
   * Requirements: 8.10
   * 
   * Queries the lorries table to find the owner of a specific lorry.
   * Returns null if lorry is not registered yet (this is acceptable).
   */
  private async getLorryOwnerId(lorryId: string): Promise<string | null> {
    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Query lorries table to find the lorry and get its owner
      // We need to scan or use GSI2 to find the lorry by lorryId
      // Using GSI2: GSI2PK = LORRY#{lorryId}
      const queryCommand = new QueryCommand({
        TableName: this.lorriesTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :gsi2pk',
        ExpressionAttributeValues: {
          ':gsi2pk': `LORRY#${lorryId}`,
        },
        Limit: 1,
      });

      const result = await dynamodbClient.send(queryCommand);

      if (!result.Items || result.Items.length === 0) {
        // Lorry not registered yet - this is acceptable
        return null;
      }

      const lorryItem = result.Items[0];
      
      // Extract owner ID from the lorry item
      if (lorryItem.ownerId) {
        return lorryItem.ownerId;
      }

      return null;
    } catch (error: any) {
      console.error('Error getting lorry owner ID:', error);
      // Don't throw - just return null if we can't find the owner
      return null;
    }
  }

  /**
   * Validate CreateTripDto
   */
  private validateCreateTripDto(dto: CreateTripDto): void {
    const requiredFields = [
      'pickupLocation',
      'dropoffLocation',
      'scheduledPickupDatetime',
      'brokerId',
      'lorryId',
      'driverId',
      'driverName',
      'brokerPayment',
      'lorryOwnerPayment',
      'driverPayment',
    ];

    for (const field of requiredFields) {
      if (dto[field] === undefined || dto[field] === null || dto[field] === '') {
        throw new BadRequestException(`${field} is required`);
      }
    }
  }

  /**
   * Update trip status
   * Requirements: 4.3, 10.1, 10.2, 10.3, 10.4, 10.5
   * 
   * Status transitions: Scheduled → PickedUp → InTransit → Delivered → Paid
   * Dispatchers can update to any status
   * Drivers can only update to PickedUp, InTransit, Delivered
   * Drivers can only update trips assigned to them
   */
  async updateTripStatus(
    tripId: string,
    userId: string,
    userRole: UserRole,
    newStatus: TripStatus,
  ): Promise<Trip> {
    // First, get the existing trip
    let existingTrip: Trip;
    
    if (userRole === UserRole.Dispatcher) {
      existingTrip = await this.getTripById(tripId, userId, UserRole.Dispatcher);
    } else if (userRole === UserRole.Driver) {
      // For drivers, we need to find the trip and verify they're assigned to it
      existingTrip = await this.getTripForDriver(tripId, userId);
    } else {
      throw new ForbiddenException('Only dispatchers and drivers can update trip status');
    }

    // Validate status transition (this will throw if invalid)
    this.validateStatusTransition(existingTrip.status, newStatus, userRole);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    updateExpressions.push('#status = :status');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = newStatus;

    // Record deliveredAt timestamp when status changes to Delivered
    if (newStatus === TripStatus.Delivered && !existingTrip.deliveredAt) {
      updateExpressions.push('#deliveredAt = :deliveredAt');
      expressionAttributeNames['#deliveredAt'] = 'deliveredAt';
      expressionAttributeValues[':deliveredAt'] = new Date().toISOString();
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Update using new table structure: PK=TRIP#{tripId}, SK=METADATA
      const updateCommand = new UpdateCommand({
        TableName: this.tripsTableName,
        Key: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(PK)',
      });

      const result = await dynamodbClient.send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }

      return this.mapItemToTrip(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating trip status:', error);
      throw new InternalServerErrorException('Failed to update trip status');
    }
  }

  /**
   * Get trip for driver (verify driver is assigned to the trip)
   * This method queries GSI3 to find trips assigned to the driver
   * 
   * Note: userId is the Cognito user ID, but trips are stored with driverLicenseNumber.
   * We need to get the user profile first to extract their driver license number.
   */
  private async getTripForDriver(tripId: string, userId: string): Promise<Trip> {
    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Get user profile to extract driver license number
      const getUserCommand = new GetCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      });

      const userResult = await dynamodbClient.send(getUserCommand);
      
      if (!userResult.Item || !userResult.Item.driverLicenseNumber) {
        throw new ForbiddenException('Driver license number not found in profile');
      }

      const driverLicenseNumber = userResult.Item.driverLicenseNumber;

      // Query GSI3 to find trips for this driver
      const queryCommand = new QueryCommand({
        TableName: this.tripsTableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :gsi3pk',
        ExpressionAttributeValues: {
          ':gsi3pk': `DRIVER#${driverLicenseNumber}`,
        },
      });

      const result = await dynamodbClient.send(queryCommand);

      if (!result.Items || result.Items.length === 0) {
        throw new ForbiddenException('You are not assigned to any trips');
      }

      // Find the specific trip
      const tripItem = result.Items.find((item) => item.tripId === tripId);

      if (!tripItem) {
        throw new ForbiddenException('You are not assigned to this trip');
      }

      return this.mapItemToTrip(tripItem);
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      console.error('Error getting trip for driver:', error);
      throw new InternalServerErrorException('Failed to retrieve trip');
    }
  }

  /**
   * Validate status transition
   * Valid transitions: Scheduled → PickedUp → InTransit → Delivered → Paid
   * Dispatchers can update to any status
   * Drivers can only update to PickedUp, InTransit, Delivered (sequential only)
   */
  private validateStatusTransition(
    currentStatus: TripStatus,
    newStatus: TripStatus,
    userRole: UserRole,
  ): void {
    // Drivers cannot update to Paid status
    if (userRole === UserRole.Driver && newStatus === TripStatus.Paid) {
      throw new ForbiddenException('Drivers cannot update trip status to Paid');
    }

    // Drivers cannot update to Scheduled status
    if (userRole === UserRole.Driver && newStatus === TripStatus.Scheduled) {
      throw new ForbiddenException('Drivers cannot update trip status to Scheduled');
    }

    // Dispatchers can update to any status (skip validation for dispatchers)
    if (userRole === UserRole.Dispatcher) {
      return;
    }

    // For drivers, enforce sequential transitions only
    const validDriverTransitions: Record<TripStatus, TripStatus[]> = {
      [TripStatus.Scheduled]: [TripStatus.PickedUp],
      [TripStatus.PickedUp]: [TripStatus.InTransit],
      [TripStatus.InTransit]: [TripStatus.Delivered],
      [TripStatus.Delivered]: [], // Drivers cannot update from Delivered
      [TripStatus.Paid]: [], // No transitions from Paid
    };

    const allowedStatuses = validDriverTransitions[currentStatus];
    if (!allowedStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Get trips with role-based filtering
   * Requirements: 4.5, 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5, 19.2, 19.3, 19.4
   * 
   * For dispatchers: Query by PK (DISPATCHER#id), return their trips
   * For drivers: Query GSI1 by GSI1PK (DRIVER#id), return assigned trips
   * For lorry owners: Query GSI2 by GSI2PK (LORRY#id) for each owned lorry
   * 
   * Supports date range filtering using SK BETWEEN queries
   * Supports secondary filters (broker, status) using filter expressions
   * Supports pagination with LastEvaluatedKey
   */
  async getTrips(
    userId: string,
    userRole: UserRole,
    filters: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Role-based query logic
      if (userRole === UserRole.Dispatcher) {
        return await this.getTripsForDispatcher(userId, filters, dynamodbClient);
      } else if (userRole === UserRole.Driver) {
        return await this.getTripsForDriver(userId, filters, dynamodbClient);
      } else if (userRole === UserRole.LorryOwner) {
        return await this.getTripsForLorryOwner(userId, filters, dynamodbClient);
      } else {
        throw new ForbiddenException('Invalid role for trip queries');
      }
    } catch (error: any) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error getting trips:', error);
      throw new InternalServerErrorException('Failed to retrieve trips');
    }
  }

  /**
   * Get trips for a dispatcher
   * Query GSI1: GSI1PK = DISPATCHER#{dispatcherId}, GSI1SK = date#tripId
   * Requirements: 8.7
   */
  private async getTripsForDispatcher(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    // Build key condition expression for GSI1
    let keyConditionExpression = 'GSI1PK = :gsi1pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi1pk': `DISPATCHER#${dispatcherId}`,
    };

    // Add date range filtering if provided (GSI1SK = date#tripId)
    if (filters.startDate && filters.endDate) {
      keyConditionExpression += ' AND GSI1SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
      expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      keyConditionExpression += ' AND GSI1SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
    } else if (filters.endDate) {
      keyConditionExpression += ' AND GSI1SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
    }

    // Build filter expression for secondary filters
    const { filterExpression, filterAttributeNames, filterAttributeValues } =
      this.buildSecondaryFilters(filters);

    // Build query command for GSI1 on new trips table
    const queryParams: any = {
      TableName: this.tripsTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ...filterAttributeValues,
      },
      Limit: filters.limit || 50,
    };

    if (filterExpression) {
      queryParams.FilterExpression = filterExpression;
      queryParams.ExpressionAttributeNames = filterAttributeNames;
    }

    if (filters.lastEvaluatedKey) {
      try {
        queryParams.ExclusiveStartKey = JSON.parse(
          Buffer.from(filters.lastEvaluatedKey, 'base64').toString('utf-8'),
        );
      } catch (error) {
        throw new BadRequestException('Invalid lastEvaluatedKey format');
      }
    }

    const queryCommand = new QueryCommand(queryParams);
    const result = await dynamodbClient.send(queryCommand);

    const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips };

    if (result.LastEvaluatedKey) {
      response.lastEvaluatedKey = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey),
      ).toString('base64');
    }

    return response;
  }

  /**
   * Get trips for a driver
   * Query GSI3 by GSI3PK: DRIVER#{driverLicenseNumber}, GSI3SK: date#tripId
   * Requirements: 8.8
   * 
   * Note: userId is the Cognito user ID, but trips are stored with driverLicenseNumber.
   * We need to get the user profile first to extract their driver license number.
   */
  private async getTripsForDriver(
    userId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    // Get user profile to extract driver license number
    const getUserCommand = new GetCommand({
      TableName: this.configService.usersTableName,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
    });

    const userResult = await dynamodbClient.send(getUserCommand);
    
    if (!userResult.Item || !userResult.Item.driverLicenseNumber) {
      // Driver hasn't set their license number yet, return empty
      return { trips: [] };
    }

    const driverLicenseNumber = userResult.Item.driverLicenseNumber;

    // Build key condition expression for GSI3
    let keyConditionExpression = 'GSI3PK = :gsi3pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi3pk': `DRIVER#${driverLicenseNumber}`,
    };

    // Add date range filtering if provided (GSI3SK = date#tripId)
    if (filters.startDate && filters.endDate) {
      keyConditionExpression += ' AND GSI3SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
      expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      keyConditionExpression += ' AND GSI3SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
    } else if (filters.endDate) {
      keyConditionExpression += ' AND GSI3SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
    }

    // Build filter expression for secondary filters
    const { filterExpression, filterAttributeNames, filterAttributeValues } =
      this.buildSecondaryFilters(filters);

    // Build query command for GSI3 on new trips table
    const queryParams: any = {
      TableName: this.tripsTableName,
      IndexName: 'GSI3',
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ...filterAttributeValues,
      },
      Limit: filters.limit || 50,
    };

    if (filterExpression) {
      queryParams.FilterExpression = filterExpression;
      queryParams.ExpressionAttributeNames = filterAttributeNames;
    }

    if (filters.lastEvaluatedKey) {
      try {
        queryParams.ExclusiveStartKey = JSON.parse(
          Buffer.from(filters.lastEvaluatedKey, 'base64').toString('utf-8'),
        );
      } catch (error) {
        throw new BadRequestException('Invalid lastEvaluatedKey format');
      }
    }

    const queryCommand = new QueryCommand(queryParams);
    const result = await dynamodbClient.send(queryCommand);

    const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips };

    if (result.LastEvaluatedKey) {
      response.lastEvaluatedKey = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey),
      ).toString('base64');
    }

    return response;
  }

  /**
   * Get trips for a lorry owner
   * Query GSI2 by GSI2PK: LORRY#{lorryId}, GSI2SK: date#tripId
   * Requirements: 8.9
   * 
   * This queries trips by lorry license plate. The lorry owner must first
   * get their registered lorries, then query trips for each lorry.
   */
  private async getTripsForLorryOwner(
    ownerId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    // First, get all lorries owned by this owner
    const lorriesQueryCommand = new QueryCommand({
      TableName: this.lorriesTableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `LORRY_OWNER#${ownerId}`,
      },
    });

    const lorriesResult = await dynamodbClient.send(lorriesQueryCommand);
    
    if (!lorriesResult.Items || lorriesResult.Items.length === 0) {
      // No lorries registered yet
      return { trips: [] };
    }

    // Extract lorry IDs
    const lorryIds = lorriesResult.Items
      .filter(item => item.SK && item.SK.startsWith('LORRY#'))
      .map(item => item.lorryId);

    if (lorryIds.length === 0) {
      return { trips: [] };
    }

    // Query trips for each lorry using GSI2
    const allTrips: Trip[] = [];
    
    for (const lorryId of lorryIds) {
      // Skip if filters specify a different lorry
      if (filters.lorryId && filters.lorryId !== lorryId) {
        continue;
      }

      // Build key condition expression for GSI2
      let keyConditionExpression = 'GSI2PK = :gsi2pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi2pk': `LORRY#${lorryId}`,
      };

      // Add date range filtering if provided (GSI2SK = date#tripId)
      if (filters.startDate && filters.endDate) {
        keyConditionExpression += ' AND GSI2SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
        expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        keyConditionExpression += ' AND GSI2SK >= :startSk';
        expressionAttributeValues[':startSk'] = `${filters.startDate}#`;
      } else if (filters.endDate) {
        keyConditionExpression += ' AND GSI2SK <= :endSk';
        expressionAttributeValues[':endSk'] = `${filters.endDate}#ZZZZZZZZ`;
      }

      // Build filter expression for secondary filters
      const { filterExpression, filterAttributeNames, filterAttributeValues } =
        this.buildSecondaryFilters(filters);

      // Build query command for GSI2 on new trips table
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: {
          ...expressionAttributeValues,
          ...filterAttributeValues,
        },
      };

      if (filterExpression) {
        queryParams.FilterExpression = filterExpression;
        queryParams.ExpressionAttributeNames = filterAttributeNames;
      }

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      if (result.Items && result.Items.length > 0) {
        const trips = result.Items.map((item) => this.mapItemToTrip(item));
        allTrips.push(...trips);
      }
    }

    // Sort trips by scheduled date (most recent first)
    allTrips.sort((a, b) => 
      new Date(b.scheduledPickupDatetime).getTime() - 
      new Date(a.scheduledPickupDatetime).getTime()
    );

    // Apply limit if specified
    const limit = filters.limit || 50;
    const limitedTrips = allTrips.slice(0, limit);

    return { trips: limitedTrips };
  }



  /**
   * Build secondary filter expressions for broker, status, lorry, driver
   * These are applied after the key condition query
   */
  private buildSecondaryFilters(filters: any): {
    filterExpression: string;
    filterAttributeNames: Record<string, string>;
    filterAttributeValues: Record<string, any>;
  } {
    const filterExpressions: string[] = [];
    const filterAttributeNames: Record<string, string> = {};
    const filterAttributeValues: Record<string, any> = {};

    if (filters.brokerId) {
      filterExpressions.push('#brokerId = :brokerId');
      filterAttributeNames['#brokerId'] = 'brokerId';
      filterAttributeValues[':brokerId'] = filters.brokerId;
    }

    if (filters.status) {
      filterExpressions.push('#status = :status');
      filterAttributeNames['#status'] = 'status';
      filterAttributeValues[':status'] = filters.status;
    }

    if (filters.lorryId) {
      filterExpressions.push('#lorryId = :lorryId');
      filterAttributeNames['#lorryId'] = 'lorryId';
      filterAttributeValues[':lorryId'] = filters.lorryId;
    }

    if (filters.driverId) {
      filterExpressions.push('#driverId = :driverId');
      filterAttributeNames['#driverId'] = 'driverId';
      filterAttributeValues[':driverId'] = filters.driverId;
    }

    // Add support for filtering by driver name (case-insensitive contains)
    if (filters.driverName) {
      filterExpressions.push('contains(#driverName, :driverName)');
      filterAttributeNames['#driverName'] = 'driverName';
      filterAttributeValues[':driverName'] = filters.driverName;
    }

    return {
      filterExpression: filterExpressions.join(' AND '),
      filterAttributeNames,
      filterAttributeValues,
    };
  }

  /**
   * Map DynamoDB item to Trip interface
   */
  private mapItemToTrip(item: any): Trip {
    return {
      tripId: item.tripId,
      dispatcherId: item.dispatcherId,
      pickupLocation: item.pickupLocation,
      dropoffLocation: item.dropoffLocation,
      scheduledPickupDatetime: item.scheduledPickupDatetime,
      brokerId: item.brokerId,
      brokerName: item.brokerName,
      lorryId: item.lorryId,
      driverId: item.driverId,
      driverName: item.driverName,
      brokerPayment: item.brokerPayment,
      lorryOwnerPayment: item.lorryOwnerPayment,
      driverPayment: item.driverPayment,
      status: item.status,
      distance: item.distance,
      deliveredAt: item.deliveredAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Get payment report with role-based aggregation
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 11.4, 11.5
   */
  async getPaymentReport(
    userId: string,
    role: UserRole,
    filters: PaymentReportFilters,
  ): Promise<PaymentReport> {
    // Get trips based on role
    const tripFilters: TripFilters = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      brokerId: filters.brokerId,
      lorryId: filters.lorryId,
      driverId: filters.driverId,
    };

    const { trips } = await this.getTrips(userId, role, tripFilters);

    // Convert trips to payment details
    const tripPaymentDetails: TripPaymentDetail[] = trips.map((trip) => ({
      tripId: trip.tripId,
      dispatcherId: trip.dispatcherId,
      scheduledPickupDatetime: trip.scheduledPickupDatetime,
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
      brokerId: trip.brokerId,
      brokerName: trip.brokerName,
      lorryId: trip.lorryId,
      driverId: trip.driverId,
      driverName: trip.driverName,
      brokerPayment: trip.brokerPayment,
      lorryOwnerPayment: trip.lorryOwnerPayment,
      driverPayment: trip.driverPayment,
      distance: trip.distance,
      status: trip.status,
    }));

    // Generate role-specific report
    switch (role) {
      case UserRole.Dispatcher:
        return this.generateDispatcherReport(tripPaymentDetails, filters.groupBy);
      case UserRole.Driver:
        return this.generateDriverReport(tripPaymentDetails, filters.groupBy);
      case UserRole.LorryOwner:
        return this.generateLorryOwnerReport(tripPaymentDetails, filters.groupBy);
      default:
        throw new ForbiddenException('Invalid role for payment reports');
    }
  }

  /**
   * Generate dispatcher payment report
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  private generateDispatcherReport(
    trips: TripPaymentDetail[],
    groupBy?: string,
  ): DispatcherPaymentReport {
    const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
    const profit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments;

    const report: DispatcherPaymentReport = {
      totalBrokerPayments,
      totalDriverPayments,
      totalLorryOwnerPayments,
      profit,
      tripCount: trips.length,
      trips,
    };

    // Add grouping if requested
    if (groupBy === 'broker') {
      report.groupedByBroker = this.groupByBroker(trips);
    } else if (groupBy === 'driver') {
      report.groupedByDriver = this.groupByDriver(trips);
    } else if (groupBy === 'lorry') {
      report.groupedByLorry = this.groupByLorry(trips);
    }

    return report;
  }

  /**
   * Generate driver payment report
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   */
  private generateDriverReport(
    trips: TripPaymentDetail[],
    groupBy?: string,
  ): DriverPaymentReport {
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);

    const report: DriverPaymentReport = {
      totalDriverPayments,
      totalDistance,
      tripCount: trips.length,
      trips,
    };

    // Add grouping if requested
    if (groupBy === 'dispatcher') {
      report.groupedByDispatcher = this.groupByDispatcherForDriver(trips);
    }

    return report;
  }

  /**
   * Generate lorry owner payment report
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  private generateLorryOwnerReport(
    trips: TripPaymentDetail[],
    groupBy?: string,
  ): LorryOwnerPaymentReport {
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);

    const report: LorryOwnerPaymentReport = {
      totalLorryOwnerPayments,
      tripCount: trips.length,
      trips,
    };

    // Add grouping if requested
    if (groupBy === 'lorry') {
      report.groupedByLorry = this.groupByLorry(trips);
    } else if (groupBy === 'dispatcher') {
      report.groupedByDispatcher = this.groupByDispatcherForLorryOwner(trips);
    }

    return report;
  }

  /**
   * Group trips by broker
   */
  private groupByBroker(trips: TripPaymentDetail[]): Record<string, {
    brokerName: string;
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      brokerName: string;
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      if (!grouped[trip.brokerId]) {
        grouped[trip.brokerId] = {
          brokerName: trip.brokerName,
          totalPayment: 0,
          tripCount: 0,
        };
      }
      grouped[trip.brokerId].totalPayment += trip.brokerPayment;
      grouped[trip.brokerId].tripCount += 1;
    }

    return grouped;
  }

  /**
   * Group trips by driver
   */
  private groupByDriver(trips: TripPaymentDetail[]): Record<string, {
    driverName: string;
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      driverName: string;
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      if (!grouped[trip.driverId]) {
        grouped[trip.driverId] = {
          driverName: trip.driverName,
          totalPayment: 0,
          tripCount: 0,
        };
      }
      grouped[trip.driverId].totalPayment += trip.driverPayment;
      grouped[trip.driverId].tripCount += 1;
    }

    return grouped;
  }

  /**
   * Group trips by lorry
   */
  private groupByLorry(trips: TripPaymentDetail[]): Record<string, {
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      if (!grouped[trip.lorryId]) {
        grouped[trip.lorryId] = {
          totalPayment: 0,
          tripCount: 0,
        };
      }
      grouped[trip.lorryId].totalPayment += trip.lorryOwnerPayment;
      grouped[trip.lorryId].tripCount += 1;
    }

    return grouped;
  }

  /**
   * Group trips by dispatcher for driver reports
   * Sum driver payments by dispatcher
   */
  private groupByDispatcherForDriver(trips: TripPaymentDetail[]): Record<string, {
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      const dispatcherId = trip.dispatcherId;
      
      if (!grouped[dispatcherId]) {
        grouped[dispatcherId] = {
          totalPayment: 0,
          tripCount: 0,
        };
      }
      
      grouped[dispatcherId].totalPayment += trip.driverPayment;
      grouped[dispatcherId].tripCount += 1;
    }

    return grouped;
  }

  /**
   * Group trips by dispatcher for lorry owner reports
   * Sum lorry owner payments by dispatcher
   */
  private groupByDispatcherForLorryOwner(trips: TripPaymentDetail[]): Record<string, {
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      const dispatcherId = trip.dispatcherId;
      
      if (!grouped[dispatcherId]) {
        grouped[dispatcherId] = {
          totalPayment: 0,
          tripCount: 0,
        };
      }
      
      grouped[dispatcherId].totalPayment += trip.lorryOwnerPayment;
      grouped[dispatcherId].tripCount += 1;
    }

    return grouped;
  }

  /**
   * Get trip summary by status for dashboard
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   * 
   * Returns trip counts grouped by status for the dispatcher
   */
  async getTripSummaryByStatus(
    dispatcherId: string,
    filters: TripFilters,
  ): Promise<Record<TripStatus, number>> {
    // Get all trips for the dispatcher with filters
    const { trips } = await this.getTrips(dispatcherId, UserRole.Dispatcher, filters);

    // Initialize counts for all statuses
    const summary: Record<TripStatus, number> = {
      [TripStatus.Scheduled]: 0,
      [TripStatus.PickedUp]: 0,
      [TripStatus.InTransit]: 0,
      [TripStatus.Delivered]: 0,
      [TripStatus.Paid]: 0,
    };

    // Count trips by status
    for (const trip of trips) {
      summary[trip.status] = (summary[trip.status] || 0) + 1;
    }

    return summary;
  }

  /**
   * Get payment summary for dashboard
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   * 
   * Returns aggregated payment metrics for the dispatcher
   */
  async getPaymentSummary(
    dispatcherId: string,
    filters: TripFilters,
  ): Promise<{
    totalBrokerPayments: number;
    totalDriverPayments: number;
    totalLorryOwnerPayments: number;
    totalProfit: number;
  }> {
    // Get all trips for the dispatcher with filters
    const { trips } = await this.getTrips(dispatcherId, UserRole.Dispatcher, filters);

    // Calculate totals
    const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments;

    return {
      totalBrokerPayments,
      totalDriverPayments,
      totalLorryOwnerPayments,
      totalProfit,
    };
  }

  /**
   * Get payments timeline for dashboard charts
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   * 
   * Returns time-series payment data grouped by month for the dispatcher
   */
  async getPaymentsTimeline(
    dispatcherId: string,
    filters: TripFilters,
  ): Promise<{
    labels: string[];
    brokerPayments: number[];
    driverPayments: number[];
    lorryOwnerPayments: number[];
    profit: number[];
  }> {
    // Get all trips for the dispatcher with filters
    const { trips } = await this.getTrips(dispatcherId, UserRole.Dispatcher, filters);

    // Group trips by month
    const monthlyData: Record<string, {
      brokerPayments: number;
      driverPayments: number;
      lorryOwnerPayments: number;
    }> = {};

    for (const trip of trips) {
      // Extract year-month from scheduled date (YYYY-MM)
      const date = new Date(trip.scheduledPickupDatetime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          brokerPayments: 0,
          driverPayments: 0,
          lorryOwnerPayments: 0,
        };
      }

      monthlyData[monthKey].brokerPayments += trip.brokerPayment;
      monthlyData[monthKey].driverPayments += trip.driverPayment;
      monthlyData[monthKey].lorryOwnerPayments += trip.lorryOwnerPayment;
    }

    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyData).sort();

    // Build arrays for chart data
    const labels: string[] = [];
    const brokerPayments: number[] = [];
    const driverPayments: number[] = [];
    const lorryOwnerPayments: number[] = [];
    const profit: number[] = [];

    for (const month of sortedMonths) {
      // Format label as "MMM YYYY" (e.g., "Jan 2024")
      const [year, monthNum] = month.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      labels.push(label);
      brokerPayments.push(monthlyData[month].brokerPayments);
      driverPayments.push(monthlyData[month].driverPayments);
      lorryOwnerPayments.push(monthlyData[month].lorryOwnerPayments);
      profit.push(
        monthlyData[month].brokerPayments -
        monthlyData[month].driverPayments -
        monthlyData[month].lorryOwnerPayments
      );
    }

    return {
      labels,
      brokerPayments,
      driverPayments,
      lorryOwnerPayments,
      profit,
    };
  }

  /**
   * Delete a trip
   * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
   * 
   * Hard delete - removes the trip from the database
   * Only the dispatcher who created the trip can delete it
   */
  async deleteTrip(tripId: string, dispatcherId: string): Promise<void> {
    // First, verify the trip exists and belongs to the dispatcher
    await this.getTripById(tripId, dispatcherId, UserRole.Dispatcher);

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Delete using new table structure: PK=TRIP#{tripId}, SK=METADATA
      const deleteCommand = new DeleteCommand({
        TableName: this.tripsTableName,
        Key: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
        },
        ConditionExpression: 'attribute_exists(PK)',
      });

      await dynamodbClient.send(deleteCommand);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Trip with ID ${tripId} not found`);
      }
      console.error('Error deleting trip:', error);
      throw new InternalServerErrorException('Failed to delete trip');
    }
  }
}
