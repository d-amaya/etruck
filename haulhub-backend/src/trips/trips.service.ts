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
import { PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { BrokersService } from '../admin/brokers.service';
import { StatusWorkflowService } from './status-workflow.service';
import { StatusAuditService } from './status-audit.service';
import { IndexSelectorService } from './index-selector.service';
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
  StatusChangeRequest,
  StatusAuditTrail,
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
    private readonly statusWorkflowService: StatusWorkflowService,
    private readonly statusAuditService: StatusAuditService,
    private readonly indexSelectorService: IndexSelectorService,
  ) {
    this.tripsTableName = this.configService.tripsTableName;
    this.lorriesTableName = this.configService.lorriesTableName;
  }

  /**
   * Emit CloudWatch metrics for query performance monitoring
   * Requirements: 6.1
   * 
   * Emits metrics for:
   * - Query response time (milliseconds)
   * - Selected index name
   * - RCU consumption (from DynamoDB response)
   * - Query errors by index type
   * 
   * @param indexName - Name of the GSI used for the query
   * @param responseTimeMs - Query response time in milliseconds
   * @param rcuConsumed - Read capacity units consumed (from DynamoDB response)
   * @param isError - Whether the query resulted in an error
   */
  private async emitQueryMetrics(
    indexName: string,
    responseTimeMs: number,
    rcuConsumed?: number,
    isError: boolean = false,
  ): Promise<void> {
    try {
      const cloudWatchClient = this.awsService.getCloudWatchClient();
      const timestamp = new Date();

      const metricData: MetricDatum[] = [
        // Query response time metric
        {
          MetricName: 'QueryResponseTime',
          Value: responseTimeMs,
          Unit: 'Milliseconds',
          Timestamp: timestamp,
          Dimensions: [
            {
              Name: 'IndexName',
              Value: indexName,
            },
            {
              Name: 'Service',
              Value: 'TripsService',
            },
          ],
        },
      ];

      // Add RCU consumption metric if available
      if (rcuConsumed !== undefined) {
        metricData.push({
          MetricName: 'RCUConsumption',
          Value: rcuConsumed,
          Unit: 'Count',
          Timestamp: timestamp,
          Dimensions: [
            {
              Name: 'IndexName',
              Value: indexName,
            },
            {
              Name: 'Service',
              Value: 'TripsService',
            },
          ],
        });
      }

      // Add error metric if query failed
      if (isError) {
        metricData.push({
          MetricName: 'QueryErrors',
          Value: 1,
          Unit: 'Count',
          Timestamp: timestamp,
          Dimensions: [
            {
              Name: 'IndexName',
              Value: indexName,
            },
            {
              Name: 'Service',
              Value: 'TripsService',
            },
          ],
        });
      }

      // Emit metrics to CloudWatch
      const putMetricCommand = new PutMetricDataCommand({
        Namespace: 'HaulHub/Trips',
        MetricData: metricData,
      });

      await cloudWatchClient.send(putMetricCommand);
    } catch (error: any) {
      // Log error but don't throw - metrics emission should not break the query
      console.error('Failed to emit CloudWatch metrics:', {
        error: error.message,
        indexName,
        responseTimeMs,
        rcuConsumed,
        isError,
      });
    }
  }

  /**
   * Create a new trip (Dispatcher only)
   * Requirements: 4.1, 4.2, 19.2, 19.3, 19.4, 8.1, 8.2, 8.3, 8.4, 3.1
   * 
   * PK: TRIP#{tripId}
   * SK: METADATA
   * GSI1PK: DISPATCHER#{dispatcherId}
   * GSI1SK: {date}#{tripId}
   * GSI2PK: DISPATCHER#{dispatcherId}
   * GSI2SK: LORRY#{lorryId}#{date}#{tripId}
   * GSI3PK: DISPATCHER#{dispatcherId}
   * GSI3SK: DRIVER#{driverId}#{date}#{tripId}
   * GSI4PK: DISPATCHER#{dispatcherId}
   * GSI4SK: BROKER#{brokerId}#{date}#{tripId}
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
      loadedMiles: dto.loadedMiles,
      emptyMiles: dto.emptyMiles,
      totalMiles: dto.totalMiles,
      fuelAvgCost: dto.fuelAvgCost,
      fuelAvgGallonsPerMile: dto.fuelAvgGallonsPerMile,
      lumperFees: dto.lumperFees || 0,
      detentionFees: dto.detentionFees || 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Populate GSI attributes for optimized querying
      const gsiAttributes = this.populateGSIAttributes({
        tripId,
        dispatcherId,
        lorryId: dto.lorryId,
        driverId: dto.driverId,
        brokerId: dto.brokerId,
        scheduledPickupDatetime: dto.scheduledPickupDatetime,
      });

      // Validate GSI attribute formats
      this.validateGSIAttributes(gsiAttributes);

      // Store trip in new trips table with optimized structure:
      // PK = TRIP#<tripId> for direct O(1) lookups
      // SK = METADATA
      // GSI1 = Dispatcher queries (GSI1PK=DISPATCHER#id, GSI1SK=datetime#tripId)
      // GSI2 = Lorry-optimized queries (GSI2PK=DISPATCHER#id, GSI2SK=LORRY#lorryId#datetime#tripId)
      // GSI3 = Driver-optimized queries (GSI3PK=DISPATCHER#id, GSI3SK=DRIVER#driverId#datetime#tripId)
      // GSI4 = Broker-optimized queries (GSI4PK=DISPATCHER#id, GSI4SK=BROKER#brokerId#datetime#tripId)
      const putCommand = new PutCommand({
        TableName: this.tripsTableName,
        Item: {
          PK: `TRIP#${tripId}`,
          SK: 'METADATA',
          ...gsiAttributes,
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

    // Prevent updating fields that affect GSI sort keys
    // These fields determine the trip's position in queries and cannot be updated
    // Users must delete and recreate the trip if these need to change
    if (dto.scheduledPickupDatetime !== undefined) {
      throw new BadRequestException(
        'Cannot update scheduledPickupDatetime. Please delete and recreate the trip with the new schedule.'
      );
    }
    
    if (dto.lorryId !== undefined) {
      throw new BadRequestException(
        'Cannot update lorryId. Please delete and recreate the trip with the new lorry.'
      );
    }
    
    if (dto.driverId !== undefined) {
      throw new BadRequestException(
        'Cannot update driverId. Please delete and recreate the trip with the new driver.'
      );
    }

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

    if (dto.brokerId !== undefined) {
      const broker = await this.brokersService.getBrokerById(dto.brokerId);
      updateExpressions.push('#brokerId = :brokerId, #brokerName = :brokerName');
      expressionAttributeNames['#brokerId'] = 'brokerId';
      expressionAttributeNames['#brokerName'] = 'brokerName';
      expressionAttributeValues[':brokerId'] = dto.brokerId;
      expressionAttributeValues[':brokerName'] = broker.brokerName;
      
      // Update GSI4SK to maintain consistency with broker index
      // GSI4SK format: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
      const scheduledDate = new Date(existingTrip.scheduledPickupDatetime);
      const dateOnlyStr = scheduledDate.toISOString().split('T')[0];
      const newGSI4SK = `BROKER#${dto.brokerId}#${dateOnlyStr}#${tripId}`;
      
      updateExpressions.push('#GSI4SK = :GSI4SK');
      expressionAttributeNames['#GSI4SK'] = 'GSI4SK';
      expressionAttributeValues[':GSI4SK'] = newGSI4SK;
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

    // Enhanced Mileage Tracking (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
    if (dto.loadedMiles !== undefined) {
      updateExpressions.push('#loadedMiles = :loadedMiles');
      expressionAttributeNames['#loadedMiles'] = 'loadedMiles';
      expressionAttributeValues[':loadedMiles'] = dto.loadedMiles;
    }

    if (dto.emptyMiles !== undefined) {
      updateExpressions.push('#emptyMiles = :emptyMiles');
      expressionAttributeNames['#emptyMiles'] = 'emptyMiles';
      expressionAttributeValues[':emptyMiles'] = dto.emptyMiles;
    }

    if (dto.totalMiles !== undefined) {
      updateExpressions.push('#totalMiles = :totalMiles');
      expressionAttributeNames['#totalMiles'] = 'totalMiles';
      expressionAttributeValues[':totalMiles'] = dto.totalMiles;
    }

    // Fuel Management (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
    if (dto.fuelAvgCost !== undefined) {
      updateExpressions.push('#fuelAvgCost = :fuelAvgCost');
      expressionAttributeNames['#fuelAvgCost'] = 'fuelAvgCost';
      expressionAttributeValues[':fuelAvgCost'] = dto.fuelAvgCost;
    }

    if (dto.fuelAvgGallonsPerMile !== undefined) {
      updateExpressions.push('#fuelAvgGallonsPerMile = :fuelAvgGallonsPerMile');
      expressionAttributeNames['#fuelAvgGallonsPerMile'] = 'fuelAvgGallonsPerMile';
      expressionAttributeValues[':fuelAvgGallonsPerMile'] = dto.fuelAvgGallonsPerMile;
    }

    // Additional Fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
    if (dto.lumperFees !== undefined) {
      updateExpressions.push('#lumperFees = :lumperFees');
      expressionAttributeNames['#lumperFees'] = 'lumperFees';
      expressionAttributeValues[':lumperFees'] = dto.lumperFees;
    }

    if (dto.detentionFees !== undefined) {
      updateExpressions.push('#detentionFees = :detentionFees');
      expressionAttributeNames['#detentionFees'] = 'detentionFees';
      expressionAttributeValues[':detentionFees'] = dto.detentionFees;
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
   * Populate GSI attributes for optimized querying
   * Requirements: 3.1
   * 
   * Generates all GSI partition and sort keys for multi-index query optimization:
   * - GSI1: Default dispatcher index (date-based sorting)
   * - GSI2: Lorry-optimized index (lorry + date sorting)
   * - GSI3: Driver-optimized index (driver + date sorting)
   * - GSI4: Broker-optimized index (broker + date sorting)
   * 
   * Format:
   * - GSI1SK: {YYYY-MM-DDTHH:mm:ss.sssZ}#{tripId}
   * - GSI2SK: LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
   * - GSI3SK: DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
   * - GSI4SK: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
   */
  private populateGSIAttributes(params: {
    tripId: string;
    dispatcherId: string;
    lorryId: string;
    driverId: string;
    brokerId: string;
    scheduledPickupDatetime: string;
  }): {
    GSI1PK: string;
    GSI1SK: string;
    GSI2PK: string;
    GSI2SK: string;
    GSI3PK: string;
    GSI3SK: string;
    GSI4PK: string;
    GSI4SK: string;
  } {
    const { tripId, dispatcherId, lorryId, driverId, brokerId, scheduledPickupDatetime } = params;
    
    // Parse the scheduled date
    const scheduledDate = new Date(scheduledPickupDatetime);
    
    // Use full ISO timestamp for GSI1SK to enable precise time-based queries
    const scheduledDateTimeStr = scheduledDate.toISOString();
    
    // Use date-only format (YYYY-MM-DD) for GSI2/3/4 sort keys
    // This groups trips by entity and date, enabling efficient date range queries
    const dateOnlyStr = scheduledDateTimeStr.split('T')[0]; // Extract YYYY-MM-DD
    
    return {
      // GSI1: Default dispatcher index (existing structure)
      GSI1PK: `DISPATCHER#${dispatcherId}`,
      GSI1SK: `${scheduledDateTimeStr}#${tripId}`,
      
      // GSI2: Lorry-optimized index
      GSI2PK: `DISPATCHER#${dispatcherId}`,
      GSI2SK: `LORRY#${lorryId}#${dateOnlyStr}#${tripId}`,
      
      // GSI3: Driver-optimized index
      GSI3PK: `DISPATCHER#${dispatcherId}`,
      GSI3SK: `DRIVER#${driverId}#${dateOnlyStr}#${tripId}`,
      
      // GSI4: Broker-optimized index
      GSI4PK: `DISPATCHER#${dispatcherId}`,
      GSI4SK: `BROKER#${brokerId}#${dateOnlyStr}#${tripId}`,
    };
  }

  /**
   * Validate GSI attribute formats using regex patterns
   * Requirements: 3.1
   * 
   * Ensures all GSI attributes follow the correct format to prevent query issues:
   * - GSI2SK: LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
   * - GSI3SK: DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
   * - GSI4SK: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
   */
  private validateGSIAttributes(gsiAttributes: {
    GSI1PK: string;
    GSI1SK: string;
    GSI2PK: string;
    GSI2SK: string;
    GSI3PK: string;
    GSI3SK: string;
    GSI4PK: string;
    GSI4SK: string;
  }): void {
    const errors: string[] = [];

    // Validate GSI1SK format: {ISO-8601-datetime}#{tripId}
    const gsi1Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z#[a-f0-9-]+$/;
    if (!gsi1Pattern.test(gsiAttributes.GSI1SK)) {
      errors.push(`Invalid GSI1SK format: ${gsiAttributes.GSI1SK}`);
    }

    // Validate GSI2SK format: LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
    const gsi2Pattern = /^LORRY#[^#]+#\d{4}-\d{2}-\d{2}#[a-f0-9-]+$/;
    if (!gsi2Pattern.test(gsiAttributes.GSI2SK)) {
      errors.push(`Invalid GSI2SK format: ${gsiAttributes.GSI2SK}`);
    }

    // Validate GSI3SK format: DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
    const gsi3Pattern = /^DRIVER#[^#]+#\d{4}-\d{2}-\d{2}#[a-f0-9-]+$/;
    if (!gsi3Pattern.test(gsiAttributes.GSI3SK)) {
      errors.push(`Invalid GSI3SK format: ${gsiAttributes.GSI3SK}`);
    }

    // Validate GSI4SK format: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
    const gsi4Pattern = /^BROKER#[^#]+#\d{4}-\d{2}-\d{2}#[a-f0-9-]+$/;
    if (!gsi4Pattern.test(gsiAttributes.GSI4SK)) {
      errors.push(`Invalid GSI4SK format: ${gsiAttributes.GSI4SK}`);
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        `GSI attribute validation failed: ${errors.join(', ')}`
      );
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
      [TripStatus.Canceled]: [], // No transitions from Canceled
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
   * Get trips for a dispatcher with smart index selection
   * Requirements: 1.4, 5.1, 5.2, 8.7, 3.6, 6.4
   * 
   * This method analyzes the provided filters and automatically selects the most
   * efficient GSI to minimize read operations and improve query performance.
   * 
   * Selection priority (highest to lowest selectivity):
   * - GSI2: When lorryId filter is provided (~20 items)
   * - GSI3: When driverId filter is provided (~50 items)
   * - GSI4: When brokerId filter is provided (~200 items)
   * - GSI1: Default when only date/status filters (~10,000 items)
   * 
   * Includes automatic fallback to GSI1 if optimized query fails, ensuring
   * backward compatibility and high availability.
   * 
   * Comprehensive logging includes:
   * - Index selection decision with filter details and estimated reads
   * - Actual reads after query execution (from DynamoDB response)
   * - Query errors with full context (filters, attempted index, error message)
   */
  private async getTripsForDispatcher(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    try {
      // Select optimal index based on filter selectivity
      // Requirements: 1.4, 3.6
      const strategy = this.indexSelectorService.selectOptimalIndex({
        dispatcherId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        status: filters.status,
        brokerId: filters.brokerId,
        lorryId: filters.lorryId,
        driverId: filters.driverId,
        driverName: filters.driverName,
      });

      // Route to appropriate query method based on selected index
      // Requirements: 1.4, 5.1
      switch (strategy.indexName) {
        case 'GSI2':
          return await this.queryByLorryIndex(dispatcherId, filters, dynamodbClient);
        
        case 'GSI3':
          return await this.queryByDriverIndex(dispatcherId, filters, dynamodbClient);
        
        case 'GSI4':
          return await this.queryByBrokerIndex(dispatcherId, filters, dynamodbClient);
        
        case 'GSI1':
        default:
          return await this.queryByDefaultIndex(dispatcherId, filters, dynamodbClient);
      }
    } catch (error: any) {
      // Log error with full context
      // Requirements: 5.2, 3.6, 6.4
      this.logQueryError(error, filters, 'unknown');

      // Fallback to default index (GSI1) to ensure availability
      // Requirements: 5.2
      console.log('Falling back to GSI1 (default index) due to error in optimized query');
      return await this.queryByDefaultIndex(dispatcherId, filters, dynamodbClient);
    }
  }

  /**
   * Log query errors with full context
   * Requirements: 3.6, 6.4
   * 
   * Logs structured error information including:
   * - Error message and stack trace
   * - Filters that were provided
   * - Index that was attempted
   * - Timestamp for correlation
   * 
   * This enables troubleshooting and performance analysis
   */
  private logQueryError(
    error: Error,
    filters: any,
    attemptedIndex: string,
  ): void {
    const errorLog = {
      level: 'ERROR',
      message: 'Query execution failed',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      attemptedIndex,
      filters: {
        dispatcherId: filters.dispatcherId,
        dateRange: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
        lorryId: filters.lorryId || null,
        driverId: filters.driverId || null,
        brokerId: filters.brokerId || null,
        status: filters.status || null,
        driverName: filters.driverName || null,
        limit: filters.limit || null,
        lastEvaluatedKey: filters.lastEvaluatedKey ? '[REDACTED]' : null,
      },
      timestamp: new Date().toISOString(),
    };

    console.error(
      `[TripsService] Query error on ${attemptedIndex}:`,
      JSON.stringify(errorLog, null, 2),
    );
  }

  /**
   * Query trips using GSI1 (Default Dispatcher Index)
   * Requirements: 3.5, 3.6, 6.4
   * 
   * GSI1 Structure:
   * - GSI1PK: DISPATCHER#{dispatcherId}
   * - GSI1SK: {ISO-8601-datetime}#{tripId}
   * 
   * This method is the fallback when no selective filters (lorryId, driverId, brokerId) are provided.
   * It queries all trips for a dispatcher within a date range and applies all filters using FilterExpression.
   * 
   * KeyConditionExpression handles: dispatcherId, date range
   * FilterExpression handles: brokerId, lorryId, driverId, status
   * Application layer handles: driverName (case-insensitive)
   * 
   * Comprehensive logging includes:
   * - Query start with filter details
   * - Actual reads after query execution (from DynamoDB response)
   * - Query errors with full context
   * 
   * @param dispatcherId - Dispatcher ID to query trips for
   * @param filters - Trip filters (date range, status, broker, lorry, driver)
   * @param dynamodbClient - DynamoDB client instance
   * @returns Query result with trips and optional pagination token
   */
  private async queryByDefaultIndex(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    const startTime = Date.now();
    let totalRCU = 0;
    let isError = false;

    try {
      // Log query start with filter details
      // Requirements: 3.6, 6.4
      this.logQueryStart('GSI1', filters);
    
    // Build key condition expression for GSI1
    let keyConditionExpression = 'GSI1PK = :gsi1pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi1pk': `DISPATCHER#${dispatcherId}`,
    };

    // Add date range filtering if provided (GSI1SK = date#tripId)
    // GSI1SK is stored as full ISO timestamp (e.g., 2025-12-12T09:00:00Z#trip-123)
    // Normalize dates to UTC to avoid timezone issues
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();
      
      keyConditionExpression += ' AND GSI1SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const startDateStr = startDate.toISOString();
      keyConditionExpression += ' AND GSI1SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
    } else if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      const endDateStr = endDate.toISOString();
      keyConditionExpression += ' AND GSI1SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    }

    // Build filter expression for secondary filters
    const { filterExpression, filterAttributeNames, filterAttributeValues } =
      this.buildSecondaryFilters(filters);

    const requestedLimit = filters.limit ? Number(filters.limit) : 50;
    const trips: Trip[] = [];
    let lastEvaluatedKey = filters.lastEvaluatedKey;
    
    // When using FilterExpression AND application-layer filtering (driver name),
    // we need to keep fetching until we have enough items that pass ALL filters
    const fetchLimit = requestedLimit + 1;
    const maxIterations = 20; // Increased to handle more filtering
    let iterations = 0;
    
    // Check if we have filters that require more aggressive fetching
    const hasDriverNameFilter = !!filters.driverName;
    const hasMultipleFilters = [filters.brokerId, filters.status, filters.lorryId, filters.driverName].filter(f => f).length > 1;
    
    while (iterations < maxIterations) {
      iterations++;
      
      // Build query command for GSI1 on new trips table
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: {
          ...expressionAttributeValues,
          ...filterAttributeValues,
        },
        // Fetch more items when we have multiple filters to account for DynamoDB filtering
        Limit: hasMultipleFilters ? 100 : (filterExpression ? 50 : fetchLimit),
        ScanIndexForward: false, // Return results in descending order (newest first)
        ReturnConsumedCapacity: 'TOTAL', // Request RCU consumption data
      };

      if (filterExpression) {
        queryParams.FilterExpression = filterExpression;
        queryParams.ExpressionAttributeNames = filterAttributeNames;
      }

      if (lastEvaluatedKey) {
        try {
          queryParams.ExclusiveStartKey = JSON.parse(
            Buffer.from(lastEvaluatedKey, 'base64').toString('utf-8'),
          );
        } catch (error) {
          throw new BadRequestException('Invalid lastEvaluatedKey format');
        }
      }

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      // Track RCU consumption from DynamoDB response
      if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
        totalRCU += result.ConsumedCapacity.CapacityUnits;
      }

      const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
      trips.push(...batchTrips);

      // Update lastEvaluatedKey for next iteration or response
      if (result.LastEvaluatedKey) {
        lastEvaluatedKey = Buffer.from(
          JSON.stringify(result.LastEvaluatedKey),
        ).toString('base64');
      } else {
        // No more items available
        lastEvaluatedKey = undefined;
        break;
      }
      
      // Don't stop just because we got 0 results - with FilterExpression, 
      // matching items might be in the next batch
      // Only stop if we have enough matching results OR there's no more data
      
      // If we have a driver name filter, check if we have enough matches after filtering
      if (hasDriverNameFilter) {
        const currentMatches = this.applyDriverNameFilter(trips, filters.driverName);
        if (currentMatches.length >= fetchLimit) {
          break;
        }
      } else {
        // No driver name filter, stop when we have enough trips
        // But if we have multiple filters, keep fetching to ensure we find matches
        if (trips.length >= fetchLimit && !hasMultipleFilters) {
          break;
        }
        // With multiple filters, be more aggressive and fetch more data
        if (trips.length >= fetchLimit * 2) {
          break;
        }
      }
    }

    // Apply case-insensitive driver name filtering in application layer
    const filteredTrips = this.applyDriverNameFilter(trips, filters.driverName);

    // Check if there are more items beyond the requested limit
    const hasMoreItems = filteredTrips.length > requestedLimit;
    
    // Trim to requested limit
    const trimmedTrips = filteredTrips.slice(0, requestedLimit);
    
    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
      trips: trimmedTrips 
    };

    // Include lastEvaluatedKey if there are more items
    // We need to get the key from the last item we're returning
    if (hasMoreItems && trimmedTrips.length > 0) {
      const lastTrip = trimmedTrips[trimmedTrips.length - 1];
      // Create a lastEvaluatedKey from the last returned trip
      const lastKey = {
        PK: `TRIP#${lastTrip.tripId}`,
        SK: 'METADATA',
        GSI1PK: `DISPATCHER#${dispatcherId}`,
        GSI1SK: `${lastTrip.scheduledPickupDatetime}#${lastTrip.tripId}`,
      };
      response.lastEvaluatedKey = Buffer.from(
        JSON.stringify(lastKey),
      ).toString('base64');
    }

    // Emit CloudWatch metrics for query performance
    // Requirements: 6.1
    const responseTimeMs = Date.now() - startTime;
    await this.emitQueryMetrics('GSI1', responseTimeMs, totalRCU, isError);

    // Log actual reads after query execution
    // Requirements: 3.6, 6.4
    this.logQueryCompletion('GSI1', filters, totalRCU, trimmedTrips.length, responseTimeMs);

    return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      
      // Emit error metrics
      await this.emitQueryMetrics('GSI1', responseTimeMs, totalRCU, isError);
      
      // Log error with full context
      // Requirements: 3.6, 6.4
      this.logQueryError(error, filters, 'GSI1');
      
      throw error;
    }
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
    // GSI3SK is stored as full ISO timestamp (e.g., 2025-12-12T09:00:00Z#trip-123)
    if (filters.startDate && filters.endDate) {
      const startDateStr = new Date(filters.startDate).toISOString();
      const endDateStr = new Date(filters.endDate).toISOString();
      keyConditionExpression += ' AND GSI3SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      const startDateStr = new Date(filters.startDate).toISOString();
      keyConditionExpression += ' AND GSI3SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
    } else if (filters.endDate) {
      const endDateStr = new Date(filters.endDate).toISOString();
      keyConditionExpression += ' AND GSI3SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
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
      ScanIndexForward: false, // Return results in descending order (newest first)
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

    // Apply case-insensitive driver name filtering in application layer
    const filteredTrips = this.applyDriverNameFilter(trips, filters.driverName);

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips: filteredTrips };

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
      // GSI2SK is stored as full ISO timestamp (e.g., 2025-12-12T09:00:00Z#trip-123)
      if (filters.startDate && filters.endDate) {
        const startDateStr = new Date(filters.startDate).toISOString();
        const endDateStr = new Date(filters.endDate).toISOString();
        keyConditionExpression += ' AND GSI2SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `${startDateStr}#`;
        expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        const startDateStr = new Date(filters.startDate).toISOString();
        keyConditionExpression += ' AND GSI2SK >= :startSk';
        expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      } else if (filters.endDate) {
        const endDateStr = new Date(filters.endDate).toISOString();
        keyConditionExpression += ' AND GSI2SK <= :endSk';
        expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
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
        ScanIndexForward: false, // Return results in descending order (newest first)
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

    // Apply case-insensitive driver name filtering in application layer
    const filteredTrips = this.applyDriverNameFilter(allTrips, filters.driverName);

    // Apply limit if specified
    const limit = filters.limit || 50;
    const limitedTrips = filteredTrips.slice(0, limit);

    return { trips: limitedTrips };
  }



  /**
   * Query trips using GSI2 (Lorry Index)
   * Requirements: 1.1, 1.5, 3.2, 3.6, 6.4
   * 
   * GSI2 Structure:
   * - GSI2PK: DISPATCHER#{dispatcherId}
   * - GSI2SK: LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
   * 
   * This method is optimized for queries with lorryId filter, providing highest selectivity
   * (~20 items per lorry vs ~10,000 items for default index).
   * 
   * KeyConditionExpression handles: dispatcherId, lorryId, date range
   * FilterExpression handles: brokerId, driverId, status
   * Application layer handles: driverName (case-insensitive)
   * 
   * Comprehensive logging includes:
   * - Query start with filter details
   * - Actual reads after query execution (from DynamoDB response)
   * - Query errors with full context
   * 
   * @param dispatcherId - Dispatcher ID to query trips for
   * @param filters - Trip filters including required lorryId
   * @param dynamodbClient - DynamoDB client instance
   * @returns Query result with trips and optional pagination token
   */
  private async queryByLorryIndex(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    const startTime = Date.now();
    let totalRCU = 0;
    let isError = false;

    try {
      // Log query start with filter details
      // Requirements: 3.6, 6.4
      this.logQueryStart('GSI2', filters);

      // Build KeyConditionExpression for GSI2
      // GSI2PK = DISPATCHER#{dispatcherId}
      // GSI2SK = LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
      let keyConditionExpression = 'GSI2PK = :gsi2pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi2pk': `DISPATCHER#${dispatcherId}`,
      };

      // Add date range filtering in KeyConditionExpression using GSI2SK
      // GSI2SK format: LORRY#{lorryId}#{YYYY-MM-DD}#{tripId}
      // We need to construct the range to match this format
      // IMPORTANT: Normalize dates to UTC to avoid timezone issues
      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const endDateStr = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        keyConditionExpression += ' AND GSI2SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `LORRY#${filters.lorryId}#${startDateStr}#`;
        expressionAttributeValues[':endSk'] = `LORRY#${filters.lorryId}#${endDateStr}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI2SK >= :startSk';
        expressionAttributeValues[':startSk'] = `LORRY#${filters.lorryId}#${startDateStr}#`;
      } else if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const endDateStr = endDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI2SK <= :endSk';
        expressionAttributeValues[':endSk'] = `LORRY#${filters.lorryId}#${endDateStr}#ZZZZZZZZ`;
      } else {
        // No date filter - just match lorryId prefix
        keyConditionExpression += ' AND begins_with(GSI2SK, :lorryPrefix)';
        expressionAttributeValues[':lorryPrefix'] = `LORRY#${filters.lorryId}#`;
      }

      // Build FilterExpression for remaining filters (broker, driver, status)
      // Exclude lorryId since it's already in KeyConditionExpression
      const { filterExpression, filterAttributeNames, filterAttributeValues } =
        this.buildFilterExpression(filters, ['lorryId']);

      // Build query parameters
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: {
          ...expressionAttributeValues,
          ...filterAttributeValues,
        },
        Limit: filters.limit || 50,
        ScanIndexForward: false, // Return results in descending order (newest first)
        ReturnConsumedCapacity: 'TOTAL', // Request RCU consumption data
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

      // Execute query
      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      // Track RCU consumption from DynamoDB response
      if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
        totalRCU = result.ConsumedCapacity.CapacityUnits;
      }

      // Map results to Trip objects
      const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));

      // Apply case-insensitive driver name filtering in application layer
      const filteredTrips = this.applyDriverNameFilter(trips, filters.driverName);

      // Build response
      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: filteredTrips 
      };

      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(
          JSON.stringify(result.LastEvaluatedKey),
        ).toString('base64');
      }

      // Emit CloudWatch metrics for query performance
      // Requirements: 6.1
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI2', responseTimeMs, totalRCU, isError);

      // Log actual reads after query execution
      // Requirements: 3.6, 6.4
      this.logQueryCompletion('GSI2', filters, totalRCU, filteredTrips.length, responseTimeMs);

      return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      
      // Emit error metrics
      await this.emitQueryMetrics('GSI2', responseTimeMs, totalRCU, isError);

      // Log error with full context
      // Requirements: 3.6, 6.4
      this.logQueryError(error, filters, 'GSI2');

      // If GSI2 query fails, fall back to GSI1 (default index)
      console.log('Falling back to GSI1 (default index) due to GSI2 query error');
      return this.getTripsForDispatcher(
        dispatcherId,
        filters,
        dynamodbClient,
      );
    }
  }

  /**
   * Query trips using GSI3 (Driver Index)
   * Requirements: 1.2, 3.3
   * 
   * GSI3 Structure:
   * - GSI3PK: DISPATCHER#{dispatcherId}
   * - GSI3SK: DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
   * 
   * This method is optimized for queries with driverId filter, providing high selectivity
   * (~50 items per driver vs ~10,000 items for default index).
   * 
   * KeyConditionExpression handles: dispatcherId, driverId, date range
   * FilterExpression handles: brokerId, lorryId, status
   * Application layer handles: driverName (case-insensitive)
   * 
   * @param dispatcherId - Dispatcher ID to query trips for
   * @param filters - Trip filters including required driverId
   * @param dynamodbClient - DynamoDB client instance
   * @returns Query result with trips and optional pagination token
   */
  private async queryByDriverIndex(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    const startTime = Date.now();
    let totalRCU = 0;
    let isError = false;

    try {
      // Build KeyConditionExpression for GSI3
      // GSI3PK = DISPATCHER#{dispatcherId}
      // GSI3SK = DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
      let keyConditionExpression = 'GSI3PK = :gsi3pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi3pk': `DISPATCHER#${dispatcherId}`,
      };

      // Add date range filtering in KeyConditionExpression using GSI3SK
      // GSI3SK format: DRIVER#{driverId}#{YYYY-MM-DD}#{tripId}
      // We need to construct the range to match this format
      // IMPORTANT: Normalize dates to UTC to avoid timezone issues
      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const endDateStr = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        keyConditionExpression += ' AND GSI3SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `DRIVER#${filters.driverId}#${startDateStr}#`;
        expressionAttributeValues[':endSk'] = `DRIVER#${filters.driverId}#${endDateStr}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI3SK >= :startSk';
        expressionAttributeValues[':startSk'] = `DRIVER#${filters.driverId}#${startDateStr}#`;
      } else if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const endDateStr = endDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI3SK <= :endSk';
        expressionAttributeValues[':endSk'] = `DRIVER#${filters.driverId}#${endDateStr}#ZZZZZZZZ`;
      } else {
        // No date filter - just match driverId prefix
        keyConditionExpression += ' AND begins_with(GSI3SK, :driverPrefix)';
        expressionAttributeValues[':driverPrefix'] = `DRIVER#${filters.driverId}#`;
      }

      // Build FilterExpression for remaining filters (broker, lorry, status)
      // Exclude driverId since it's already in KeyConditionExpression
      const { filterExpression, filterAttributeNames, filterAttributeValues } =
        this.buildFilterExpression(filters, ['driverId']);

      // Build query parameters
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI3',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: {
          ...expressionAttributeValues,
          ...filterAttributeValues,
        },
        Limit: filters.limit || 50,
        ScanIndexForward: false, // Return results in descending order (newest first)
        ReturnConsumedCapacity: 'TOTAL', // Request RCU consumption data
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

      // Execute query
      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      // Track RCU consumption from DynamoDB response
      if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
        totalRCU = result.ConsumedCapacity.CapacityUnits;
      }

      // Map results to Trip objects
      const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));

      // Apply case-insensitive driver name filtering in application layer
      const filteredTrips = this.applyDriverNameFilter(trips, filters.driverName);

      // Build response
      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: filteredTrips 
      };

      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(
          JSON.stringify(result.LastEvaluatedKey),
        ).toString('base64');
      }

      // Emit CloudWatch metrics for query performance
      // Requirements: 6.1
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI3', responseTimeMs, totalRCU, isError);

      return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      
      // Emit error metrics
      await this.emitQueryMetrics('GSI3', responseTimeMs, totalRCU, isError);

      // Log error with context
      console.error('Error querying GSI3 (Driver Index):', {
        error: error.message,
        filters,
        timestamp: new Date().toISOString(),
      });

      // If GSI3 query fails, fall back to GSI1 (default index)
      console.log('Falling back to GSI1 (default index) due to GSI3 query error');
      return this.getTripsForDispatcher(
        dispatcherId,
        filters,
        dynamodbClient,
      );
    }
  }

  /**
   * Query trips using GSI4 (Broker Index)
   * Requirements: 1.3, 3.4, 3.6, 6.4
   * 
   * GSI4 Structure:
   * - GSI4PK: DISPATCHER#{dispatcherId}
   * - GSI4SK: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
   * 
   * This method is optimized for queries with brokerId filter, providing medium selectivity
   * (~200 items per broker vs ~10,000 items for default index).
   * 
   * KeyConditionExpression handles: dispatcherId, brokerId, date range
   * FilterExpression handles: lorryId, driverId, status
   * Application layer handles: driverName (case-insensitive)
   * 
   * Comprehensive logging includes:
   * - Query start with filter details
   * - Actual reads after query execution (from DynamoDB response)
   * - Query errors with full context
   * 
   * @param dispatcherId - Dispatcher ID to query trips for
   * @param filters - Trip filters including required brokerId
   * @param dynamodbClient - DynamoDB client instance
   * @returns Query result with trips and optional pagination token
   */
  private async queryByBrokerIndex(
    dispatcherId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    const startTime = Date.now();
    let totalRCU = 0;
    let isError = false;

    try {
      // Log query start with filter details
      // Requirements: 3.6, 6.4
      this.logQueryStart('GSI4', filters);

      // Build KeyConditionExpression for GSI4
      // GSI4PK = DISPATCHER#{dispatcherId}
      // GSI4SK = BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
      let keyConditionExpression = 'GSI4PK = :gsi4pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi4pk': `DISPATCHER#${dispatcherId}`,
      };

      // Add date range filtering in KeyConditionExpression using GSI4SK
      // GSI4SK format: BROKER#{brokerId}#{YYYY-MM-DD}#{tripId}
      // We need to construct the range to match this format
      // IMPORTANT: Normalize dates to UTC to avoid timezone issues
      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const endDateStr = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        keyConditionExpression += ' AND GSI4SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `BROKER#${filters.brokerId}#${startDateStr}#`;
        expressionAttributeValues[':endSk'] = `BROKER#${filters.brokerId}#${endDateStr}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI4SK >= :startSk';
        expressionAttributeValues[':startSk'] = `BROKER#${filters.brokerId}#${startDateStr}#`;
      } else if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const endDateStr = endDate.toISOString().split('T')[0];
        keyConditionExpression += ' AND GSI4SK <= :endSk';
        expressionAttributeValues[':endSk'] = `BROKER#${filters.brokerId}#${endDateStr}#ZZZZZZZZ`;
      } else {
        // No date filter - just match brokerId prefix
        keyConditionExpression += ' AND begins_with(GSI4SK, :brokerPrefix)';
        expressionAttributeValues[':brokerPrefix'] = `BROKER#${filters.brokerId}#`;
      }

      // Build FilterExpression for remaining filters (lorry, driver, status)
      // Exclude brokerId since it's already in KeyConditionExpression
      const { filterExpression, filterAttributeNames, filterAttributeValues } =
        this.buildFilterExpression(filters, ['brokerId']);

      // Build query parameters
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI4',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: {
          ...expressionAttributeValues,
          ...filterAttributeValues,
        },
        Limit: filters.limit || 50,
        ScanIndexForward: false, // Return results in descending order (newest first)
        ReturnConsumedCapacity: 'TOTAL', // Request RCU consumption data
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

      // Execute query
      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      // Track RCU consumption from DynamoDB response
      if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
        totalRCU = result.ConsumedCapacity.CapacityUnits;
      }

      // Map results to Trip objects
      const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));

      // Apply case-insensitive driver name filtering in application layer
      const filteredTrips = this.applyDriverNameFilter(trips, filters.driverName);

      // Build response
      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: filteredTrips 
      };

      if (result.LastEvaluatedKey) {
        response.lastEvaluatedKey = Buffer.from(
          JSON.stringify(result.LastEvaluatedKey),
        ).toString('base64');
      }

      // Emit CloudWatch metrics for query performance
      // Requirements: 6.1
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI4', responseTimeMs, totalRCU, isError);

      // Log actual reads after query execution
      // Requirements: 3.6, 6.4
      this.logQueryCompletion('GSI4', filters, totalRCU, filteredTrips.length, responseTimeMs);

      return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      
      // Emit error metrics
      await this.emitQueryMetrics('GSI4', responseTimeMs, totalRCU, isError);

      // Log error with full context
      // Requirements: 3.6, 6.4
      this.logQueryError(error, filters, 'GSI4');

      // If GSI4 query fails, fall back to GSI1 (default index)
      console.log('Falling back to GSI1 (default index) due to GSI4 query error');
      return this.getTripsForDispatcher(
        dispatcherId,
        filters,
        dynamodbClient,
      );
    }
  }

  /**
   * Build FilterExpression with attribute exclusion support
   * Requirements: 1.4
   * 
   * This is a shared utility that generates DynamoDB FilterExpression, ExpressionAttributeNames,
   * and ExpressionAttributeValues from a filters object, excluding specified attributes.
   * 
   * Used across all GSI query methods to avoid duplication and ensure consistent filtering logic.
   * 
   * @param filters - Object containing filter criteria (brokerId, status, lorryId, driverId, etc.)
   * @param excludeAttributes - Array of attribute names to exclude from FilterExpression
   *                           (these are typically handled in KeyConditionExpression)
   * @returns Object containing filterExpression, filterAttributeNames, and filterAttributeValues
   * 
   * @example
   * // When querying GSI2 (Lorry Index), lorryId is in KeyConditionExpression
   * const result = buildFilterExpression(filters, ['lorryId']);
   * // Result will include brokerId, driverId, status in FilterExpression, but not lorryId
   */
  private buildFilterExpression(
    filters: any,
    excludeAttributes: string[] = []
  ): {
    filterExpression: string;
    filterAttributeNames: Record<string, string>;
    filterAttributeValues: Record<string, any>;
  } {
    const filterExpressions: string[] = [];
    const filterAttributeNames: Record<string, string> = {};
    const filterAttributeValues: Record<string, any> = {};

    // Define all possible filter attributes and their mappings
    const filterableAttributes = [
      { key: 'brokerId', attributeName: 'brokerId' },
      { key: 'status', attributeName: 'status' },
      { key: 'lorryId', attributeName: 'lorryId' },
      { key: 'driverId', attributeName: 'driverId' },
    ];

    // Build filter expressions for each attribute that:
    // 1. Exists in the filters object
    // 2. Is not in the excludeAttributes list
    for (const { key, attributeName } of filterableAttributes) {
      if (filters[key] && !excludeAttributes.includes(key)) {
        filterExpressions.push(`#${key} = :${key}`);
        filterAttributeNames[`#${key}`] = attributeName;
        filterAttributeValues[`:${key}`] = filters[key];
      }
    }

    // Note: driverName filtering is done in application layer for case-insensitive matching
    // DynamoDB's contains() is case-sensitive, so we filter after query

    return {
      filterExpression: filterExpressions.join(' AND '),
      filterAttributeNames,
      filterAttributeValues,
    };
  }

  /**
   * Build secondary filter expressions for broker, status, lorry, driver
   * These are applied after the key condition query
   * Note: driverName is NOT included here - it's filtered in application layer for case-insensitive matching
   * 
   * @deprecated Use buildFilterExpression instead for better flexibility
   */
  private buildSecondaryFilters(filters: any): {
    filterExpression: string;
    filterAttributeNames: Record<string, string>;
    filterAttributeValues: Record<string, any>;
  } {
    // Delegate to the new buildFilterExpression method with no exclusions
    return this.buildFilterExpression(filters, []);
  }

  /**
   * Apply case-insensitive driver name filtering in application layer
   * DynamoDB's contains() is case-sensitive, so we need to filter after query
   */
  private applyDriverNameFilter(trips: Trip[], driverName: string | undefined): Trip[] {
    if (!driverName) {
      return trips;
    }

    const searchTerm = driverName.toLowerCase();
    return trips.filter(trip => 
      trip.driverName && trip.driverName.toLowerCase().includes(searchTerm)
    );
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
      loadedMiles: item.loadedMiles,
      emptyMiles: item.emptyMiles,
      totalMiles: item.totalMiles,
      fuelAvgCost: item.fuelAvgCost,
      fuelAvgGallonsPerMile: item.fuelAvgGallonsPerMile,
      lumperFees: item.lumperFees,
      detentionFees: item.detentionFees,
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

    // Use getAllTripsForAggregation to fetch ALL trips in the date range
    // Payment reports need complete data for accurate aggregation, not just paginated results
    const trips = await this.getAllTripsForAggregation(userId, role, tripFilters);

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
      lumperFees: trip.lumperFees,
      detentionFees: trip.detentionFees,
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
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5
   */
  private generateDispatcherReport(
    trips: TripPaymentDetail[],
    groupBy?: string,
  ): DispatcherPaymentReport {
    const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
    
    // Calculate additional fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionFees = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    
    // Profit calculation includes additional fees as expenses (Requirement 7.2)
    const profit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments - totalAdditionalFees;

    const report: DispatcherPaymentReport = {
      totalBrokerPayments,
      totalDriverPayments,
      totalLorryOwnerPayments,
      totalLumperFees,
      totalDetentionFees,
      totalAdditionalFees,
      profit,
      tripCount: trips.length,
      trips,
      // Always include all grouped data for frontend flexibility
      groupedByBroker: this.groupByBroker(trips),
      groupedByDriver: this.groupByDriver(trips),
      groupedByLorry: this.groupByLorry(trips),
    };

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
   * Helper method to get ALL trips for aggregation purposes (no pagination)
   * This fetches all trips matching the filters by paginating through all results
   */
  private async getAllTripsForAggregation(
    userId: string,
    userRole: UserRole,
    filters: TripFilters,
  ): Promise<Trip[]> {
    const allTrips: Trip[] = [];
    let lastEvaluatedKey: string | undefined = undefined;
    const pageSize = 100; // Fetch in batches of 100
    let batchCount = 0;

    do {
      batchCount++;
      const { trips, lastEvaluatedKey: nextKey } = await this.getTrips(
        userId,
        userRole,
        { ...filters, limit: pageSize, lastEvaluatedKey }
      );
      
      allTrips.push(...trips);
      lastEvaluatedKey = nextKey;
      
      // Safety check to prevent infinite loops (max 10,000 trips)
      if (allTrips.length >= 10000) {
        console.warn('[getAllTripsForAggregation] Reached maximum trip limit (10,000) for aggregation');
        break;
      }
    } while (lastEvaluatedKey);

    return allTrips;
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
    // Get ALL trips for the dispatcher with filters (no pagination limit for aggregation)
    const trips = await this.getAllTripsForAggregation(dispatcherId, UserRole.Dispatcher, filters);

    // Initialize counts for all statuses
    const summary: Partial<Record<TripStatus, number>> = {
      [TripStatus.Scheduled]: 0,
      [TripStatus.PickedUp]: 0,
      [TripStatus.InTransit]: 0,
      [TripStatus.Delivered]: 0,
      [TripStatus.Paid]: 0,
      [TripStatus.Canceled]: 0,
    };

    // Count trips by status
    for (const trip of trips) {
      summary[trip.status] = (summary[trip.status] || 0) + 1;
    }

    return summary as Record<TripStatus, number>;
  }

  /**
   * Get payment summary for dashboard
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5
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
    totalLumperFees: number;
    totalDetentionFees: number;
    totalAdditionalFees: number;
    totalProfit: number;
  }> {
    // Get ALL trips for the dispatcher with filters (no pagination limit for aggregation)
    const allTrips = await this.getAllTripsForAggregation(dispatcherId, UserRole.Dispatcher, filters);
    const trips = allTrips;

    // Calculate totals
    const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
    const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
    const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
    
    // Calculate fuel costs (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
    const totalFuelCosts = trips.reduce((sum, trip) => {
      if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
        const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
        return sum + (totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost);
      }
      return sum;
    }, 0);
    
    // Calculate additional fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionFees = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    
    // Profit calculation includes fuel costs and additional fees as expenses (Requirements 6.2, 7.2)
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments - totalFuelCosts - totalAdditionalFees;

    return {
      totalBrokerPayments,
      totalDriverPayments,
      totalLorryOwnerPayments,
      totalLumperFees,
      totalDetentionFees,
      totalAdditionalFees,
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
    // Get ALL trips for the dispatcher with filters (no pagination limit for aggregation)
    const trips = await this.getAllTripsForAggregation(dispatcherId, UserRole.Dispatcher, filters);

    // Group trips by month
    const monthlyData: Record<string, {
      brokerPayments: number;
      driverPayments: number;
      lorryOwnerPayments: number;
      fuelCosts: number;
      additionalFees: number;
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
          fuelCosts: 0,
          additionalFees: 0,
        };
      }

      monthlyData[monthKey].brokerPayments += trip.brokerPayment;
      monthlyData[monthKey].driverPayments += trip.driverPayment;
      monthlyData[monthKey].lorryOwnerPayments += trip.lorryOwnerPayment;
      
      // Add fuel costs (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
      if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
        const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
        monthlyData[monthKey].fuelCosts += totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost;
      }
      
      // Add additional fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
      monthlyData[monthKey].additionalFees += (trip.lumperFees || 0) + (trip.detentionFees || 0);
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
        monthlyData[month].lorryOwnerPayments -
        monthlyData[month].fuelCosts -
        monthlyData[month].additionalFees
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

  /**
   * Get status audit trail for a trip
   * Requirements: 11.2 - Status change audit trails with timestamps and user information
   */
  async getStatusAuditTrail(
    tripId: string,
    userId: string,
    userRole: UserRole
  ): Promise<StatusAuditTrail> {
    // Verify user has access to this trip
    await this.getTripById(tripId, userId, userRole);
    
    // Get audit trail from DynamoDB
    return this.statusAuditService.getAuditTrail(tripId);
  }

  /**
   * Get available status transitions for a trip
   * Requirements: 11.3 - Workflow automation rules and validations
   */
  async getAvailableStatusTransitions(
    tripId: string,
    userId: string,
    userRole: UserRole
  ): Promise<{
    currentStatus: TripStatus;
    availableTransitions: Array<{
      status: TripStatus;
      label: string;
      color: string;
      icon: string;
      description: string;
      requiresApproval: boolean;
    }>;
  }> {
    // Get the trip
    const trip = await this.getTripById(tripId, userId, userRole);
    
    // Get available transitions based on current status and user role
    const availableStatuses = this.statusWorkflowService.getAvailableTransitions(
      trip.status,
      userRole
    );
    
    // Enrich with display information
    const availableTransitions = availableStatuses.map(status => {
      const displayInfo = this.statusWorkflowService.getStatusDisplayInfo(status);
      const validation = this.statusWorkflowService.validateStatusTransition(
        trip.status,
        status,
        userRole
      );
      
      return {
        status,
        ...displayInfo,
        requiresApproval: validation.warnings?.includes('This status change requires approval') || false
      };
    });
    
    return {
      currentStatus: trip.status,
      availableTransitions
    };
  }

  /**
   * Change trip status with audit trail and workflow validation
   * Requirements: 11.1, 11.2, 11.3 - Enhanced status tracking with audit and validation
   */
  async changeStatusWithAudit(
    tripId: string,
    userId: string,
    userName: string,
    userRole: UserRole,
    request: StatusChangeRequest
  ): Promise<Trip> {
    // Get the trip
    const trip = await this.getTripById(tripId, userId, userRole);
    
    // Validate the status transition
    const validation = this.statusWorkflowService.validateStatusTransition(
      trip.status,
      request.newStatus,
      userRole
    );
    
    if (!validation.isValid) {
      throw new BadRequestException(validation.errorMessage);
    }
    
    // Create audit entry
    const auditEntry = this.statusWorkflowService.createAuditEntry(
      tripId,
      trip.status,
      request.newStatus,
      userId,
      userName,
      request,
      false // Not automatic
    );
    
    // Save audit entry
    await this.statusAuditService.saveAuditEntry(auditEntry);
    
    // Update trip status
    const updatedTrip = await this.updateTripStatus(
      tripId,
      userId,
      userRole,
      request.newStatus
    );
    
    return updatedTrip;
  }

  /**
   * Get workflow statistics for reporting
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  async getWorkflowStatistics(
    userId: string,
    userRole: UserRole,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    // For now, return basic statistics
    // In production, this would aggregate data from multiple trips
    
    if (userRole !== UserRole.Dispatcher && userRole !== UserRole.Admin) {
      throw new ForbiddenException('Only dispatchers and admins can view workflow statistics');
    }
    
    // Get status change statistics
    const stats = await this.statusAuditService.getStatusChangeStatistics(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate || new Date().toISOString()
    );
    
    return stats;
  }

  /**
   * Log query start with filter details
   * Requirements: 3.6, 6.4
   * 
   * Logs structured information about the query being executed:
   * - Index being used
   * - Filter details
   * - Timestamp
   * 
   * This enables correlation with query completion and error logs
   */
  private logQueryStart(indexName: string, filters: any): void {
    // Logging disabled for cleaner console output
    // Uncomment below for debugging query performance
    /*
    const logData = {
      level: 'INFO',
      message: 'Query execution started',
      indexName,
      filters: {
        dispatcherId: filters.dispatcherId,
        dateRange: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
        lorryId: filters.lorryId || null,
        driverId: filters.driverId || null,
        brokerId: filters.brokerId || null,
        status: filters.status || null,
        driverName: filters.driverName || null,
        limit: filters.limit || null,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[TripsService] Query started on ${indexName}`,
      JSON.stringify(logData, null, 2),
    );
    */
  }

  /**
   * Log query completion with actual reads
   * Requirements: 3.6, 6.4
   * 
   * Logs structured information about the completed query:
   * - Index that was used
   * - Filter details
   * - Actual RCU consumed (from DynamoDB response)
   * - Number of items returned
   * - Query response time
   * - Timestamp
   * 
   * This enables performance analysis and cost optimization
   */
  private logQueryCompletion(
    indexName: string,
    filters: any,
    actualRCU: number,
    itemsReturned: number,
    responseTimeMs: number,
  ): void {
    // Logging disabled for cleaner console output
    // Uncomment below for debugging query performance
    /*
    const logData = {
      level: 'INFO',
      message: 'Query execution completed',
      indexName,
      performance: {
        actualRCU,
        itemsReturned,
        responseTimeMs,
      },
      filters: {
        dispatcherId: filters.dispatcherId,
        dateRange: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
        lorryId: filters.lorryId || null,
        driverId: filters.driverId || null,
        brokerId: filters.brokerId || null,
        status: filters.status || null,
        driverName: filters.driverName || null,
        limit: filters.limit || null,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[TripsService] Query completed on ${indexName} | RCU: ${actualRCU} | Items: ${itemsReturned} | Time: ${responseTimeMs}ms`,
      JSON.stringify(logData, null, 2),
    );
    */
  }
}
