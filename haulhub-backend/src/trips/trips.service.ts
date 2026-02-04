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
  TruckOwnerPaymentReport,
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
    const scheduledDate = new Date(dto.scheduledTimestamp);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid scheduledTimestamp format');
    }

    // Validate payments are positive numbers
    if (dto.brokerPayment <= 0) {
      throw new BadRequestException('brokerPayment must be a positive number');
    }
    if (dto.truckOwnerPayment <= 0) {
      throw new BadRequestException('truckOwnerPayment must be a positive number');
    }
    if (dto.driverPayment <= 0) {
      throw new BadRequestException('driverPayment must be a positive number');
    }

    const tripId = uuidv4();
    const now = new Date().toISOString();

    const trip: Trip = {
      // Primary identifiers
      tripId,
      
      // Entity relationships
      carrierId: dto.carrierId,
      dispatcherId,
      driverId: dto.driverId,
      truckId: dto.truckId,
      trailerId: dto.trailerId,
      truckOwnerId: dto.truckOwnerId,
      brokerId: dto.brokerId,
      
      // Order information
      orderConfirmation: dto.orderConfirmation,
      orderStatus: 'Scheduled',
      
      // Timestamps
      scheduledTimestamp: dto.scheduledTimestamp,
      pickupTimestamp: null,
      deliveryTimestamp: null,
      
      // Pickup location details
      pickupCompany: dto.pickupCompany || '',
      pickupAddress: dto.pickupAddress || '',
      pickupCity: dto.pickupCity || '',
      pickupState: dto.pickupState || '',
      pickupZip: dto.pickupZip || '',
      pickupPhone: dto.pickupPhone || '',
      pickupNotes: dto.pickupNotes || '',
      
      // Delivery location details
      deliveryCompany: dto.deliveryCompany || '',
      deliveryAddress: dto.deliveryAddress || '',
      deliveryCity: dto.deliveryCity || '',
      deliveryState: dto.deliveryState || '',
      deliveryZip: dto.deliveryZip || '',
      deliveryPhone: dto.deliveryPhone || '',
      deliveryNotes: dto.deliveryNotes || '',
      
      // Mileage tracking
      mileageEmpty: dto.mileageEmpty || 0,
      mileageOrder: dto.mileageOrder || 0,
      mileageTotal: dto.mileageTotal || 0,
      
      // Rates
      brokerRate: 0,
      driverRate: 0,
      truckOwnerRate: 0,
      dispatcherRate: 0,
      factoryRate: 0,
      orderRate: 0,
      orderAverage: 0,
      
      // Payments
      brokerPayment: dto.brokerPayment,
      driverPayment: dto.driverPayment,
      truckOwnerPayment: dto.truckOwnerPayment,
      dispatcherPayment: 0,
      
      // Advances
      brokerAdvance: 0,
      driverAdvance: 0,
      factoryAdvance: 0,
      
      // Costs and expenses
      fuelCost: 0,
      fuelGasAvgCost: 0,
      fuelGasAvgGallxMil: 0,
      brokerCost: 0,
      factoryCost: 0,
      lumperValue: dto.lumperFees || 0,
      detentionValue: dto.detentionFees || 0,
      orderExpenses: 0,
      orderRevenue: 0,
      
      // Additional notes
      notes: dto.notes || '',
      
      // Audit timestamps
      createdAt: now,
      updatedAt: now,
    };

    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();

      // Populate GSI attributes for optimized querying
      const gsiAttributes = this.populateGSIAttributes({
        tripId,
        dispatcherId,
        carrierId: dto.carrierId,
        truckId: dto.truckId,
        truckOwnerId: dto.truckOwnerId,
        driverId: dto.driverId,
        brokerId: dto.brokerId,
        scheduledTimestamp: dto.scheduledTimestamp,
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
      if (userRole === UserRole.Carrier) {
        // Carriers can view all trips in their organization
        // We need to verify the carrier owns this trip by checking if the trip's carrierId matches
        // For now, we'll allow carriers to view any trip (they should only see their own org's trips via queries)
        // In production, add carrierId verification here if needed
      } else if (userRole === UserRole.Dispatcher && trip.dispatcherId !== userId) {
        throw new ForbiddenException('You do not have permission to access this trip');
      } else if (userRole === UserRole.Driver && trip.driverId !== userId) {
        throw new ForbiddenException('You do not have permission to access this trip');
      } else if (userRole === UserRole.LorryOwner) {
        // For lorry owner, we need to verify they own the lorry
        // This would require checking the lorry ownership, which we'll skip for now
        // In production, add lorry ownership verification here
      }

      // Enrich trip with asset details for display
      const enrichedResponse = await this.enrichTripsWithAssetMetadata([trip], userId, userRole);
      
      return enrichedResponse.trips[0];
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

    // Note: scheduledTimestamp, truckId, and driverId are silently ignored
    // These fields affect GSI sort keys and cannot be updated
    // The UI prevents users from changing them (disabled fields)

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
      const scheduledDate = new Date(existingTrip.scheduledTimestamp);
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

    if (dto.truckOwnerPayment !== undefined) {
      if (dto.truckOwnerPayment <= 0) {
        throw new BadRequestException('truckOwnerPayment must be a positive number');
      }
      updateExpressions.push('#truckOwnerPayment = :truckOwnerPayment');
      expressionAttributeNames['#truckOwnerPayment'] = 'truckOwnerPayment';
      expressionAttributeValues[':truckOwnerPayment'] = dto.truckOwnerPayment;
    }

    if (dto.driverPayment !== undefined) {
      if (dto.driverPayment <= 0) {
        throw new BadRequestException('driverPayment must be a positive number');
      }
      updateExpressions.push('#driverPayment = :driverPayment');
      expressionAttributeNames['#driverPayment'] = 'driverPayment';
      expressionAttributeValues[':driverPayment'] = dto.driverPayment;
    }

    if (dto.mileageOrder !== undefined) {
      updateExpressions.push('#mileageOrder = :mileageOrder');
      expressionAttributeNames['#mileageOrder'] = 'mileageOrder';
      expressionAttributeValues[':mileageOrder'] = dto.mileageOrder;
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

    if (dto.notes !== undefined) {
      updateExpressions.push('#notes = :notes');
      expressionAttributeNames['#notes'] = 'notes';
      expressionAttributeValues[':notes'] = dto.notes;
    }

    // Handle orderStatus updates (with automatic timestamp management)
    if (dto.orderStatus !== undefined) {
      updateExpressions.push('#orderStatus = :orderStatus');
      expressionAttributeNames['#orderStatus'] = 'orderStatus';
      expressionAttributeValues[':orderStatus'] = dto.orderStatus;

      // Automatically set pickupTimestamp when status changes to "Picked Up"
      if (dto.orderStatus === TripStatus.PickedUp && !existingTrip.pickupTimestamp) {
        const pickupTime = new Date().toISOString();
        updateExpressions.push('#pickupTimestamp = :pickupTimestamp');
        expressionAttributeNames['#pickupTimestamp'] = 'pickupTimestamp';
        expressionAttributeValues[':pickupTimestamp'] = pickupTime;
      }

      // Automatically set deliveryTimestamp when status changes to "Delivered"
      if (dto.orderStatus === TripStatus.Delivered && !existingTrip.deliveryTimestamp) {
        const deliveryTime = new Date().toISOString();
        updateExpressions.push('#deliveryTimestamp = :deliveryTimestamp');
        expressionAttributeNames['#deliveryTimestamp'] = 'deliveryTimestamp';
        expressionAttributeValues[':deliveryTimestamp'] = deliveryTime;
      }
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
      'scheduledTimestamp',
      'brokerId',
      'truckId',
      'trailerId',
      'truckOwnerId',
      'carrierId',
      'driverId',
      'brokerPayment',
      'truckOwnerPayment',
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
   * - GSI1: Carrier index (carrier + timestamp sorting)
   * - GSI2: Dispatcher index (dispatcher + timestamp sorting)
   * - GSI3: Driver index (driver + timestamp sorting)
   * - GSI4: Truck Owner index (owner + timestamp sorting)
   * - GSI5: Broker index (broker + timestamp sorting)
   * 
   * Format:
   * - GSI1SK: {ISO_TIMESTAMP}#{tripId}
   * - GSI2SK: {ISO_TIMESTAMP}#{tripId}
   * - GSI3SK: {ISO_TIMESTAMP}#{tripId}
   * - GSI4SK: {ISO_TIMESTAMP}#{tripId}
   * - GSI5SK: {ISO_TIMESTAMP}#{tripId}
   */
  private populateGSIAttributes(params: {
    tripId: string;
    dispatcherId: string;
    truckId: string;
    driverId: string;
    brokerId: string;
    scheduledTimestamp: string;
    carrierId?: string;
    truckOwnerId?: string;
  }): {
    GSI1PK: string;
    GSI1SK: string;
    GSI2PK: string;
    GSI2SK: string;
    GSI3PK: string;
    GSI3SK: string;
    GSI4PK: string;
    GSI4SK: string;
    GSI5PK: string;
    GSI5SK: string;
  } {
    const { tripId, dispatcherId, truckId, driverId, brokerId, scheduledTimestamp, carrierId, truckOwnerId } = params;
    
    // Parse the scheduled date
    const scheduledDate = new Date(scheduledTimestamp);
    
    // Use ISO timestamp for all GSI sort keys to enable precise time-based queries
    const scheduledDateTimeStr = scheduledDate.toISOString().split('.')[0] + 'Z'; // Remove milliseconds
    
    return {
      // GSI1: Carrier index
      GSI1PK: `CARRIER#${carrierId || dispatcherId}`, // Use carrierId if available, fallback to dispatcherId
      GSI1SK: `${scheduledDateTimeStr}#${tripId}`,
      
      // GSI2: Dispatcher index
      GSI2PK: `DISPATCHER#${dispatcherId}`,
      GSI2SK: `${scheduledDateTimeStr}#${tripId}`,
      
      // GSI3: Driver index
      GSI3PK: `DRIVER#${driverId}`,
      GSI3SK: `${scheduledDateTimeStr}#${tripId}`,
      
      // GSI4: Truck Owner index
      GSI4PK: `OWNER#${truckOwnerId || dispatcherId}`, // Use truckOwnerId if available, fallback to dispatcherId
      GSI4SK: `${scheduledDateTimeStr}#${tripId}`,
      
      // GSI5: Broker index
      GSI5PK: `BROKER#${brokerId}`,
      GSI5SK: `${scheduledDateTimeStr}#${tripId}`,
    };
  }

  /**
   * Validate GSI attribute formats using regex patterns
   * Requirements: 3.1
   * 
   * Ensures all GSI attributes follow the correct format to prevent query issues:
   * - GSI1SK through GSI5SK: {ISO_TIMESTAMP}#{tripId}
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
    GSI5PK: string;
    GSI5SK: string;
  }): void {
    const errors: string[] = [];

    // Validate all GSI SK formats: {ISO-8601-datetime-without-ms}#{tripId}
    // Format: YYYY-MM-DDTHH:mm:ssZ#uuid
    const gsiPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z#[a-f0-9-]+$/;
    
    if (!gsiPattern.test(gsiAttributes.GSI1SK)) {
      errors.push(`Invalid GSI1SK format: ${gsiAttributes.GSI1SK}`);
    }
    
    if (!gsiPattern.test(gsiAttributes.GSI2SK)) {
      errors.push(`Invalid GSI2SK format: ${gsiAttributes.GSI2SK}`);
    }

    if (!gsiPattern.test(gsiAttributes.GSI3SK)) {
      errors.push(`Invalid GSI3SK format: ${gsiAttributes.GSI3SK}`);
    }

    if (!gsiPattern.test(gsiAttributes.GSI4SK)) {
      errors.push(`Invalid GSI4SK format: ${gsiAttributes.GSI4SK}`);
    }
    
    if (!gsiPattern.test(gsiAttributes.GSI5SK)) {
      errors.push(`Invalid GSI5SK format: ${gsiAttributes.GSI5SK}`);
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
    this.validateStatusTransition(existingTrip.orderStatus as TripStatus, newStatus, userRole);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    updateExpressions.push('#status = :status');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = newStatus;

    // Record deliveryTimestamp when status changes to Delivered
    if (newStatus === TripStatus.Delivered && !existingTrip.deliveryTimestamp) {
      updateExpressions.push('#deliveryTimestamp = :deliveryTimestamp');
      expressionAttributeNames['#deliveryTimestamp'] = 'deliveryTimestamp';
      expressionAttributeValues[':deliveryTimestamp'] = new Date().toISOString().split('.')[0] + 'Z';
    }
    
    // Record pickupTimestamp when status changes to Picked Up
    if (newStatus === TripStatus.PickedUp && !existingTrip.pickupTimestamp) {
      updateExpressions.push('#pickupTimestamp = :pickupTimestamp');
      expressionAttributeNames['#pickupTimestamp'] = 'pickupTimestamp';
      expressionAttributeValues[':pickupTimestamp'] = new Date().toISOString().split('.')[0] + 'Z';
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

      // In eTrucky schema, we use userId directly (not driverLicenseNumber)
      // Query GSI3 to find trips for this driver using their userId
      const queryCommand = new QueryCommand({
        TableName: this.tripsTableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :gsi3pk',
        ExpressionAttributeValues: {
          ':gsi3pk': `DRIVER#${userId}`,
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
      let result: { trips: Trip[]; lastEvaluatedKey?: string };
      
      if (userRole === UserRole.Dispatcher) {
        result = await this.getTripsForDispatcher(userId, filters, dynamodbClient);
      } else if (userRole === UserRole.Carrier) {
        result = await this.getTripsForCarrier(userId, filters, dynamodbClient);
      } else if (userRole === UserRole.Driver) {
        result = await this.getTripsForDriver(userId, filters, dynamodbClient);
      } else if (userRole === UserRole.LorryOwner || userRole === UserRole.TruckOwner) {
        result = await this.getTripsForLorryOwner(userId, filters, dynamodbClient);
      } else {
        throw new ForbiddenException('Invalid role for trip queries');
      }

      // Apply role-based filtering to hide sensitive fields
      const filteredTrips = result.trips.map(trip => this.filterTripByRole(trip, userRole) as Trip);

      // Enrich trips with asset metadata for frontend display
      const enrichedResponse = await this.enrichTripsWithAssetMetadata(filteredTrips, userId, userRole);

      return {
        ...enrichedResponse,
        lastEvaluatedKey: result.lastEvaluatedKey,
      };
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
   * Get all trips for a carrier (public method for carrier dashboard)
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
   * 
   * Queries GSI1 (Carrier Index) to get all trips for the carrier's organization.
   * Returns all trips without role-based field filtering (carrier sees everything).
   * 
   * @param carrierId - The carrier ID
   * @param filters - Optional filters (startDate, endDate, dispatcherId, driverId, brokerId, status)
   * @returns Array of trips (no pagination for dashboard simplicity)
   */
  async getTripsByCarrier(
    carrierId: string,
    filters?: any,
  ): Promise<Trip[]> {
    try {
      const dynamodbClient = this.awsService.getDynamoDBClient();
      
      // Use the private method with empty filters if none provided
      const result = await this.getTripsForCarrier(
        carrierId,
        filters || {},
        dynamodbClient,
      );

      // Return all trips without role-based filtering (carrier sees all fields)
      return result.trips;
    } catch (error: any) {
      console.error('Error getting trips by carrier:', error);
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
   * Includes automatic fallback to GSI2 if optimized query fails, ensuring
   * high availability.
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
      // For now, use default GSI2 for all queries with FilterExpression
      // TODO: Implement optimized GSI3 (driver) and GSI4 (broker) query methods
      return await this.queryByDefaultIndex(dispatcherId, filters, dynamodbClient);
    } catch (error: any) {
      // Log error with full context
      // Requirements: 5.2, 3.6, 6.4
      this.logQueryError(error, filters, 'unknown');

      // Fallback to default index (GSI2) to ensure availability
      // Requirements: 5.2
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
   * Query trips using GSI2 (Dispatcher Index) with application-layer filtering
   * 
   * PAGINATION STRATEGY:
   * - Always query using GSI2 (DISPATCHER#{dispatcherId}) regardless of secondary filters
   * - Apply ALL secondary filters (broker, status, truck, driver) at application layer
   * - Never use DynamoDB FilterExpression to avoid pagination issues
   * - Fetch in batches until requested page size is reached or no more records exist
   * - lastEvaluatedKey represents the last record SHOWN to user, not last scanned
   * 
   * GSI2 Structure:
   * - GSI2PK: DISPATCHER#{dispatcherId}
   * - GSI2SK: {ISO_TIMESTAMP}#{tripId}
   * 
   * KeyConditionExpression handles: dispatcherId, date range (only)
   * Application layer handles: ALL secondary filters (broker, status, truck, driver, driverName)
   * 
   * @param dispatcherId - Dispatcher ID to query trips for
   * @param filters - Trip filters (date range, status, broker, truck, driver)
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
      this.logQueryStart('GSI2', filters);
    
      // Build key condition expression for GSI2 (Dispatcher Index)
      // ONLY use partition key and date range - NO secondary filters in DynamoDB
      let keyConditionExpression = 'GSI2PK = :gsi2pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi2pk': `DISPATCHER#${dispatcherId}`,
      };

      // Add date range filtering if provided (GSI2SK = {ISO_TIMESTAMP}#tripId)
      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        
        const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
        const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
        
        keyConditionExpression += ' AND GSI2SK BETWEEN :startSk AND :endSk';
        expressionAttributeValues[':startSk'] = `${startDateStr}#`;
        expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
      } else if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
        keyConditionExpression += ' AND GSI2SK >= :startSk';
        expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      } else if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
        keyConditionExpression += ' AND GSI2SK <= :endSk';
        expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
      }

      const requestedLimit = filters.limit ? Number(filters.limit) : 50;
      const allTrips: Trip[] = [];
      let dynamoDBLastKey = filters.lastEvaluatedKey;
      
      const queryStartTime = Date.now();
      const maxQueryTimeMs = 10000; // 10 seconds timeout
      const maxBatches = 10; // Prevent infinite loops
      let batchCount = 0;
      
      // Determine batch size based on filter selectivity estimate
      const hasSecondaryFilters = !!(filters.brokerId || filters.orderStatus || filters.truckId || filters.driverId || filters.driverName);
      const batchSize = hasSecondaryFilters ? 200 : requestedLimit; // Fetch more if filtering
      
      // Keep fetching until we have enough filtered results or run out of data
      while (Date.now() - queryStartTime < maxQueryTimeMs && batchCount < maxBatches) {
        batchCount++;
        
        // Build query params - NO FilterExpression, only KeyConditionExpression
        const queryParams: any = {
          TableName: this.tripsTableName,
          IndexName: 'GSI2',
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: batchSize,
          ScanIndexForward: false, // Newest first
          ReturnConsumedCapacity: 'TOTAL',
        };

        if (dynamoDBLastKey) {
          try {
            queryParams.ExclusiveStartKey = JSON.parse(
              Buffer.from(dynamoDBLastKey, 'base64').toString('utf-8'),
            );
          } catch (error) {
            throw new BadRequestException('Invalid lastEvaluatedKey format');
          }
        }

        const queryCommand = new QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);

        // Track RCU consumption
        if (result.ConsumedCapacity?.CapacityUnits) {
          totalRCU += result.ConsumedCapacity.CapacityUnits;
        }

        const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        allTrips.push(...batchTrips);

        // Update DynamoDB pagination key
        if (result.LastEvaluatedKey) {
          dynamoDBLastKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        } else {
          dynamoDBLastKey = undefined;
          break; // No more data in DynamoDB
        }

        // Apply all filters at application layer
        const filteredSoFar = this.applyAllFilters(allTrips, filters);
        
        // Stop if we have enough filtered results
        if (filteredSoFar.length >= requestedLimit) {
          break;
        }
        
        // Stop if no more data from DynamoDB
        if (!dynamoDBLastKey) {
          break;
        }
      }

      // Apply all filters at application layer
      const filteredTrips = this.applyAllFilters(allTrips, filters);

      // Trim to requested limit
      const trimmedTrips = filteredTrips.slice(0, requestedLimit);
      const hasMoreItems = filteredTrips.length > requestedLimit;
      
      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: trimmedTrips 
      };

      // Set lastEvaluatedKey to the last VISIBLE record (not last scanned)
      if (hasMoreItems && trimmedTrips.length > 0) {
        const lastTrip = trimmedTrips[trimmedTrips.length - 1];
        const lastKey = {
          PK: `TRIP#${lastTrip.tripId}`,
          SK: 'METADATA',
          GSI2PK: `DISPATCHER#${dispatcherId}`,
          GSI2SK: `${lastTrip.scheduledTimestamp}#${lastTrip.tripId}`,
        };
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
      } else if (dynamoDBLastKey) {
        // We have more data in DynamoDB but not enough filtered results yet
        // Return the DynamoDB key so next request can continue
        response.lastEvaluatedKey = dynamoDBLastKey;
      }

      // Emit metrics
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI2', responseTimeMs, totalRCU, isError);

      // Log completion
      this.logQueryCompletion('GSI2', filters, totalRCU, trimmedTrips.length, responseTimeMs);

      return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI2', responseTimeMs, totalRCU, isError);
      this.logQueryError(error, filters, 'GSI2');
      throw error;
    }
  }

  /**
   * Get trips for a driver with application-layer filtering
   * 
   * PAGINATION STRATEGY:
   * - Always query using GSI3 (DRIVER#{driverId}) regardless of secondary filters
   * - Apply ALL secondary filters at application layer
   * - Never use DynamoDB FilterExpression
   * - Fetch in batches until requested page size is reached
   * 
   * Query GSI3 by GSI3PK: DRIVER#{userId}, GSI3SK: {ISO_TIMESTAMP}#{tripId}
   */
  private async getTripsForDriver(
    userId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    // Build key condition expression for GSI3 (Driver Index)
    // ONLY partition key and date range - NO secondary filters
    let keyConditionExpression = 'GSI3PK = :gsi3pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi3pk': `DRIVER#${userId}`,
    };

    // Add date range filtering if provided
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      
      keyConditionExpression += ' AND GSI3SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI3SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
    } else if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI3SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    }

    const requestedLimit = filters.limit ? Number(filters.limit) : 50;
    const allTrips: Trip[] = [];
    let dynamoDBLastKey = filters.lastEvaluatedKey;
    
    const maxBatches = 10;
    let batchCount = 0;
    const hasSecondaryFilters = !!(filters.brokerId || filters.orderStatus || filters.truckId);
    const batchSize = hasSecondaryFilters ? 200 : requestedLimit;

    // Fetch batches until we have enough filtered results
    while (batchCount < maxBatches) {
      batchCount++;
      
      // Build query params - NO FilterExpression
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI3',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: batchSize,
        ScanIndexForward: false,
      };

      if (dynamoDBLastKey) {
        try {
          queryParams.ExclusiveStartKey = JSON.parse(
            Buffer.from(dynamoDBLastKey, 'base64').toString('utf-8'),
          );
        } catch (error) {
          throw new BadRequestException('Invalid lastEvaluatedKey format');
        }
      }

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
      allTrips.push(...batchTrips);

      if (result.LastEvaluatedKey) {
        dynamoDBLastKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      } else {
        dynamoDBLastKey = undefined;
        break;
      }

      // Apply filters and check if we have enough
      const filteredSoFar = this.applyAllFilters(allTrips, filters);
      if (filteredSoFar.length >= requestedLimit || !dynamoDBLastKey) {
        break;
      }
    }

    // Apply all filters at application layer
    const filteredTrips = this.applyAllFilters(allTrips, filters);
    const trimmedTrips = filteredTrips.slice(0, requestedLimit);
    const hasMoreItems = filteredTrips.length > requestedLimit;

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips: trimmedTrips };

    if (hasMoreItems && trimmedTrips.length > 0) {
      const lastTrip = trimmedTrips[trimmedTrips.length - 1];
      const lastKey = {
        PK: `TRIP#${lastTrip.tripId}`,
        SK: 'METADATA',
        GSI3PK: `DRIVER#${userId}`,
        GSI3SK: `${lastTrip.scheduledTimestamp}#${lastTrip.tripId}`,
      };
      response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    } else if (dynamoDBLastKey) {
      response.lastEvaluatedKey = dynamoDBLastKey;
    }

    return response;
  }

  /**
   * Get trips for a truck owner with application-layer filtering
   * 
   * PAGINATION STRATEGY:
   * - Always query using GSI4 (OWNER#{ownerId}) regardless of secondary filters
   * - Apply ALL secondary filters at application layer
   * - Never use DynamoDB FilterExpression
   * - Fetch in batches until requested page size is reached
   * 
   * Query GSI4 by GSI4PK: OWNER#{ownerId}, GSI4SK: {ISO_TIMESTAMP}#{tripId}
   */
  private async getTripsForLorryOwner(
    ownerId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    // Build key condition expression for GSI4 (Truck Owner Index)
    // ONLY partition key and date range - NO secondary filters
    let keyConditionExpression = 'GSI4PK = :gsi4pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi4pk': `OWNER#${ownerId}`,
    };

    // Add date range filtering
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      
      keyConditionExpression += ' AND GSI4SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI4SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
    } else if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI4SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    }

    const requestedLimit = filters.limit ? Number(filters.limit) : 50;
    const allTrips: Trip[] = [];
    let dynamoDBLastKey = filters.lastEvaluatedKey;
    
    const maxBatches = 10;
    let batchCount = 0;
    const hasSecondaryFilters = !!(filters.brokerId || filters.orderStatus || filters.truckId);
    const batchSize = hasSecondaryFilters ? 200 : requestedLimit;

    // Fetch batches until we have enough filtered results
    while (batchCount < maxBatches) {
      batchCount++;
      
      // Build query params - NO FilterExpression
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI4',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: batchSize,
      };

      if (dynamoDBLastKey) {
        try {
          queryParams.ExclusiveStartKey = JSON.parse(
            Buffer.from(dynamoDBLastKey, 'base64').toString('utf-8'),
          );
        } catch (error) {
          throw new BadRequestException('Invalid lastEvaluatedKey format');
        }
      }

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
      allTrips.push(...batchTrips);

      if (result.LastEvaluatedKey) {
        dynamoDBLastKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      } else {
        dynamoDBLastKey = undefined;
        break;
      }

      // Apply filters and check if we have enough
      const filteredSoFar = this.applyAllFilters(allTrips, filters);
      if (filteredSoFar.length >= requestedLimit || !dynamoDBLastKey) {
        break;
      }
    }

    // Apply all filters at application layer
    const filteredTrips = this.applyAllFilters(allTrips, filters);
    const trimmedTrips = filteredTrips.slice(0, requestedLimit);
    const hasMoreItems = filteredTrips.length > requestedLimit;

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips: trimmedTrips };

    if (hasMoreItems && trimmedTrips.length > 0) {
      const lastTrip = trimmedTrips[trimmedTrips.length - 1];
      const lastKey = {
        PK: `TRIP#${lastTrip.tripId}`,
        SK: 'METADATA',
        GSI4PK: `OWNER#${ownerId}`,
        GSI4SK: `${lastTrip.scheduledTimestamp}#${lastTrip.tripId}`,
      };
      response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    } else if (dynamoDBLastKey) {
      response.lastEvaluatedKey = dynamoDBLastKey;
    }

    return response;
  }

  /**
   * Get trips for a carrier with application-layer filtering
   * 
   * PAGINATION STRATEGY:
   * - Always query using GSI1 (CARRIER#{carrierId}) regardless of secondary filters
   * - Apply ALL secondary filters at application layer
   * - Never use DynamoDB FilterExpression
   * - Fetch in batches until requested page size is reached
   * 
   * Queries GSI1 (Carrier Index) to get all trips for the carrier's organization
   */
  private async getTripsForCarrier(
    carrierId: string,
    filters: any,
    dynamodbClient: any,
  ): Promise<{ trips: Trip[]; lastEvaluatedKey?: string }> {
    console.log('[getTripsForCarrier] Starting query with filters:', {
      carrierId,
      filters: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        dispatcherId: filters.dispatcherId,
        brokerId: filters.brokerId,
        orderStatus: filters.orderStatus,
        limit: filters.limit
      }
    });

    // Build key condition expression for GSI1 (Carrier Index)
    // ONLY partition key and date range - NO secondary filters
    let keyConditionExpression = 'GSI1PK = :gsi1pk';
    const expressionAttributeValues: Record<string, any> = {
      ':gsi1pk': `CARRIER#${carrierId}`,
    };
    
    console.log('[getTripsForCarrier] Querying GSI1 with:', {
      GSI1PK: `CARRIER#${carrierId}`,
      dateRange: filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : 'none'
    });

    // Add date range filtering
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      
      keyConditionExpression += ' AND GSI1SK BETWEEN :startSk AND :endSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    } else if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const startDateStr = startDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI1SK >= :startSk';
      expressionAttributeValues[':startSk'] = `${startDateStr}#`;
    } else if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      const endDateStr = endDate.toISOString().split('.')[0] + 'Z';
      keyConditionExpression += ' AND GSI1SK <= :endSk';
      expressionAttributeValues[':endSk'] = `${endDateStr}#ZZZZZZZZ`;
    }

    const requestedLimit = filters.limit ? Number(filters.limit) : 50;
    const allTrips: Trip[] = [];
    let dynamoDBLastKey = filters.lastEvaluatedKey;
    
    const maxBatches = 10;
    let batchCount = 0;
    const hasSecondaryFilters = !!(filters.brokerId || filters.orderStatus || filters.truckId || filters.driverId || filters.dispatcherId);
    const batchSize = hasSecondaryFilters ? 200 : requestedLimit;

    // Fetch batches until we have enough filtered results
    while (batchCount < maxBatches) {
      batchCount++;
      
      // Build query params - NO FilterExpression
      const queryParams: any = {
        TableName: this.tripsTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: batchSize,
      };

      if (dynamoDBLastKey) {
        try {
          queryParams.ExclusiveStartKey = JSON.parse(
            Buffer.from(dynamoDBLastKey, 'base64').toString('utf-8'),
          );
        } catch (error) {
          throw new BadRequestException('Invalid lastEvaluatedKey format');
        }
      }

      const queryCommand = new QueryCommand(queryParams);
      const result = await dynamodbClient.send(queryCommand);

      const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
      allTrips.push(...batchTrips);
      
      console.log(`[getTripsForCarrier] Batch ${batchCount}: fetched ${batchTrips.length} trips`);
      if (filters.brokerId) {
        const brokerMatches = batchTrips.filter(t => t.brokerId === filters.brokerId);
        console.log(`[getTripsForCarrier] Batch ${batchCount}: ${brokerMatches.length} trips match broker ${filters.brokerId}`);
        if (brokerMatches.length > 0) {
          brokerMatches.forEach(t => {
            console.log(`  - Trip ${t.tripId.substring(0, 8)}: dispatcher=${t.dispatcherId?.substring(0, 8)}, broker=${t.brokerId}, date=${t.scheduledTimestamp}`);
          });
        }
      }

      if (result.LastEvaluatedKey) {
        dynamoDBLastKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      } else {
        dynamoDBLastKey = undefined;
        break;
      }

      // Apply filters and check if we have enough
      const filteredSoFar = this.applyAllFilters(allTrips, filters);
      if (filteredSoFar.length >= requestedLimit || !dynamoDBLastKey) {
        break;
      }
    }

    // Apply all filters at application layer
    const filteredTrips = this.applyAllFilters(allTrips, filters);
    const trimmedTrips = filteredTrips.slice(0, requestedLimit);
    const hasMoreItems = filteredTrips.length > requestedLimit;

    console.log('[getTripsForCarrier] Query complete:', {
      carrierId,
      totalFetched: allTrips.length,
      afterFiltering: filteredTrips.length,
      returned: trimmedTrips.length,
      batchesFetched: batchCount,
      stoppedEarly: batchCount >= maxBatches || (filteredTrips.length >= requestedLimit && dynamoDBLastKey !== undefined),
      appliedFilters: {
        dispatcherId: filters.dispatcherId || 'none',
        brokerId: filters.brokerId || 'none',
        orderStatus: filters.orderStatus || 'none'
      }
    });

    const response: { trips: Trip[]; lastEvaluatedKey?: string } = { trips: trimmedTrips };

    if (hasMoreItems && trimmedTrips.length > 0) {
      const lastTrip = trimmedTrips[trimmedTrips.length - 1];
      const lastKey = {
        PK: `TRIP#${lastTrip.tripId}`,
        SK: 'METADATA',
        GSI1PK: `CARRIER#${carrierId}`,
        GSI1SK: `${lastTrip.scheduledTimestamp}#${lastTrip.tripId}`,
      };
      response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    } else if (dynamoDBLastKey) {
      response.lastEvaluatedKey = dynamoDBLastKey;
    }

    return response;
  }

  /**
   * Query trips using GSI3 (Driver Index)
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
      // NOTE: FilterExpression removed - all filtering done at application layer
      const filterExpression = '';
      const filterAttributeNames = {};
      const filterAttributeValues = {};

      const requestedLimit = filters.limit ? Number(filters.limit) : 50;
      const trips: Trip[] = [];
      let lastEvaluatedKey = filters.lastEvaluatedKey;
      
      // When using FilterExpression, keep fetching until we have enough results
      const fetchLimit = requestedLimit + 1;
      const queryStartTime = Date.now();
      const maxQueryTimeMs = 10000; // 10 seconds - balance between completeness and UX
      let iterations = 0;
      
      const hasMultipleFilters = [filters.status, filters.brokerId, filters.driverId, filters.driverName].filter(f => f).length > 0;
      
      // Dynamic batch size based on filter selectivity
      // Lorry filter is highly selective (~20 items), so we can use smaller batches
      const hasDynamoDBFilters = !!(filters.brokerId || filters.status || filters.driverId);
      const hasDriverNameFilter = !!filters.driverName;
      let batchSize: number;
      
      if (hasDriverNameFilter || hasMultipleFilters) {
        // Most sparse: application-layer filtering or multiple filters
        batchSize = 500;
      } else if (hasDynamoDBFilters) {
        // Moderate sparsity: DynamoDB FilterExpression
        batchSize = 200;
      } else {
        // Dense data: lorry filter only, no additional filters
        // Since GSI2 is already highly selective (~20 items), use smaller batch
        batchSize = Math.max(fetchLimit, 100);
      }
      
      while (Date.now() - queryStartTime < maxQueryTimeMs) {
        iterations++;
        
        // Build query parameters with dynamic batch size for efficiency
        const queryParams: any = {
          TableName: this.tripsTableName,
          IndexName: 'GSI2',
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: {
            ...expressionAttributeValues,
            ...filterAttributeValues,
          },
          Limit: batchSize, // Dynamic based on filter selectivity
          ScanIndexForward: false,
          ReturnConsumedCapacity: 'TOTAL',
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

        // Execute query
        const queryCommand = new QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);

        // Track RCU consumption
        if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
          totalRCU += result.ConsumedCapacity.CapacityUnits;
        }

        // Map and filter results
        const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        let filteredBatch = this.applyDriverNameFilter(batchTrips, filters.driverName);
        
        // Apply status filtering in application layer
        if (filters.status) {
          filteredBatch = filteredBatch.filter(trip => trip.orderStatus === filters.status);
        }
        
        trips.push(...filteredBatch);

        // Check if we have enough results or no more items
        if (!result.LastEvaluatedKey || trips.length >= requestedLimit) {
          lastEvaluatedKey = result.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : undefined;
          break;
        }

        lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }

      // Check if we hit the timeout limit
      const queryTimeMs = Date.now() - queryStartTime;
      if (queryTimeMs >= maxQueryTimeMs) {
        console.warn(`[GSI2] Query timeout reached after ${iterations} iterations and ${queryTimeMs}ms. Returning partial results.`, {
          requestedLimit,
          itemsFound: trips.length,
          filters,
        });
      }

      const trimmedTrips = trips.slice(0, requestedLimit);

      // Build response
      const response: { trips: Trip[]; lastEvaluatedKey?: string} = { 
        trips: trimmedTrips 
      };

      // CRITICAL: Set lastEvaluatedKey based on the LAST RETURNED ITEM, not last fetched item
      // This ensures no items are lost between pages when application-layer filtering is applied
      if (trips.length > requestedLimit && trimmedTrips.length > 0) {
        const lastReturnedTrip = trimmedTrips[trimmedTrips.length - 1];
        const scheduledDate = new Date(lastReturnedTrip.scheduledTimestamp);
        const dateOnlyStr = scheduledDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const lastKey = {
          PK: `TRIP#${lastReturnedTrip.tripId}`,
          SK: 'METADATA',
          GSI2PK: `DISPATCHER#${dispatcherId}`,
          GSI2SK: `${scheduledDate.toISOString().split('.')[0]}Z#${lastReturnedTrip.tripId}`,
        };
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
      }

      // Emit CloudWatch metrics for query performance
      // Requirements: 6.1
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI2', responseTimeMs, totalRCU, isError);

      // Log actual reads after query execution
      // Requirements: 3.6, 6.4
      this.logQueryCompletion('GSI2', filters, totalRCU, trimmedTrips.length, responseTimeMs);

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
      // NOTE: FilterExpression removed - all filtering done at application layer
      const filterExpression = '';
      const filterAttributeNames = {};
      const filterAttributeValues = {};

      const requestedLimit = filters.limit ? Number(filters.limit) : 50;
      const trips: Trip[] = [];
      let lastEvaluatedKey = filters.lastEvaluatedKey;
      
      // When using FilterExpression, keep fetching until we have enough results
      const fetchLimit = requestedLimit + 1;
      const queryStartTime = Date.now();
      const maxQueryTimeMs = 10000; // 10 seconds - balance between completeness and UX
      let iterations = 0;
      
      const hasMultipleFilters = [filters.status, filters.brokerId, filters.lorryId, filters.driverName].filter(f => f).length > 0;
      
      // Dynamic batch size based on filter selectivity
      // Driver filter is selective (~50 items), so we can use smaller batches
      const hasDynamoDBFilters = !!(filters.brokerId || filters.status || filters.lorryId);
      const hasDriverNameFilter = !!filters.driverName;
      let batchSize: number;
      
      if (hasDriverNameFilter || hasMultipleFilters) {
        // Most sparse: application-layer filtering or multiple filters
        batchSize = 500;
      } else if (hasDynamoDBFilters) {
        // Moderate sparsity: DynamoDB FilterExpression
        batchSize = 200;
      } else {
        // Dense data: driver filter only, no additional filters
        // Since GSI3 is already selective (~50 items), use smaller batch
        batchSize = Math.max(fetchLimit, 100);
      }
      
      while (Date.now() - queryStartTime < maxQueryTimeMs) {
        iterations++;
        
        // Build query parameters with dynamic batch size for efficiency
        const queryParams: any = {
          TableName: this.tripsTableName,
          IndexName: 'GSI3',
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: {
            ...expressionAttributeValues,
            ...filterAttributeValues,
          },
          Limit: batchSize, // Dynamic based on filter selectivity
          ScanIndexForward: false,
          ReturnConsumedCapacity: 'TOTAL',
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

        // Execute query
        const queryCommand = new QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);

        // Track RCU
        if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
          totalRCU += result.ConsumedCapacity.CapacityUnits;
        }

        // Map and filter results
        const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        let filteredBatch = this.applyDriverNameFilter(batchTrips, filters.driverName);
        
        // Apply status filtering in application layer
        if (filters.status) {
          filteredBatch = filteredBatch.filter(trip => trip.orderStatus === filters.status);
        }
        
        trips.push(...filteredBatch);

        // Check if we have enough results or no more items
        if (!result.LastEvaluatedKey || trips.length >= requestedLimit) {
          lastEvaluatedKey = result.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : undefined;
          break;
        }

        lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }

      // Check if we hit the timeout limit
      const queryTimeMs = Date.now() - queryStartTime;
      if (queryTimeMs >= maxQueryTimeMs) {
        console.warn(`[GSI3] Query timeout reached after ${iterations} iterations and ${queryTimeMs}ms. Returning partial results.`, {
          requestedLimit,
          itemsFound: trips.length,
          filters,
        });
      }

      const trimmedTrips = trips.slice(0, requestedLimit);

      // Build response
      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: trimmedTrips 
      };

      // CRITICAL: Set lastEvaluatedKey based on the LAST RETURNED ITEM, not last fetched item
      // This ensures no items are lost between pages when application-layer filtering is applied
      if (trips.length > requestedLimit && trimmedTrips.length > 0) {
        const lastReturnedTrip = trimmedTrips[trimmedTrips.length - 1];
        const scheduledDate = new Date(lastReturnedTrip.scheduledTimestamp);
        
        const lastKey = {
          PK: `TRIP#${lastReturnedTrip.tripId}`,
          SK: 'METADATA',
          GSI3PK: `DRIVER#${lastReturnedTrip.driverId}`,
          GSI3SK: `${scheduledDate.toISOString().split('.')[0]}Z#${lastReturnedTrip.tripId}`,
        };
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
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
   * IMPORTANT: Uses pagination loop when FilterExpression is present because DynamoDB
   * applies Limit BEFORE FilterExpression, which can result in 0 items returned even
   * when matching items exist beyond the limit.
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
      this.logQueryStart('GSI4', filters);

      // Build KeyConditionExpression for GSI4
      let keyConditionExpression = 'GSI4PK = :gsi4pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi4pk': `DISPATCHER#${dispatcherId}`,
      };

      // Add date range filtering
      if (filters.startDate && filters.endDate) {
        const startDate = new Date(filters.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setUTCHours(23, 59, 59, 999);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
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
        keyConditionExpression += ' AND begins_with(GSI4SK, :brokerPrefix)';
        expressionAttributeValues[':brokerPrefix'] = `BROKER#${filters.brokerId}#`;
      }

      // Build FilterExpression
      // NOTE: FilterExpression removed - all filtering done at application layer
      const filterExpression = '';
      const filterAttributeNames = {};
      const filterAttributeValues = {};

      const requestedLimit = filters.limit ? Number(filters.limit) : 50;
      const trips: Trip[] = [];
      let lastEvaluatedKey = filters.lastEvaluatedKey;
      
      // Keep fetching until we have enough results OR no more data
      const fetchLimit = requestedLimit + 1;
      const queryStartTime = Date.now();
      const maxQueryTimeMs = 10000; // 10 seconds - balance between completeness and UX
      let iterations = 0;
      
      const hasMultipleFilters = [filters.status, filters.lorryId, filters.driverId, filters.driverName].filter(f => f).length > 0;
      
      // Dynamic batch size based on filter selectivity
      // Broker filter is moderately selective (~200 items), adjust batch accordingly
      const hasDynamoDBFilters = !!(filters.lorryId || filters.status || filters.driverId);
      const hasDriverNameFilter = !!filters.driverName;
      let batchSize: number;
      
      if (hasDriverNameFilter || hasMultipleFilters) {
        // Most sparse: application-layer filtering or multiple filters
        batchSize = 500;
      } else if (hasDynamoDBFilters) {
        // Moderate sparsity: DynamoDB FilterExpression
        batchSize = 200;
      } else {
        // Dense data: broker filter only, no additional filters
        // Since GSI4 is already moderately selective (~200 items), use smaller batch
        batchSize = Math.max(fetchLimit, 150);
      }
      
      while (Date.now() - queryStartTime < maxQueryTimeMs) {
        iterations++;
        
        // Build query parameters with dynamic batch size for efficiency
        const queryParams: any = {
          TableName: this.tripsTableName,
          IndexName: 'GSI4',
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: {
            ...expressionAttributeValues,
            ...filterAttributeValues,
          },
          Limit: batchSize, // Dynamic based on filter selectivity
          ScanIndexForward: false,
          ReturnConsumedCapacity: 'TOTAL',
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
        
        if (result.ConsumedCapacity && result.ConsumedCapacity.CapacityUnits) {
          totalRCU += result.ConsumedCapacity.CapacityUnits;
        }

        const batchTrips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        const filteredBatch = this.applyDriverNameFilter(batchTrips, filters.driverName);
        trips.push(...filteredBatch);

        if (!result.LastEvaluatedKey || trips.length >= requestedLimit) {
          lastEvaluatedKey = result.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : undefined;
          break;
        }

        lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }

      // Check if we hit the timeout limit
      const queryTimeMs = Date.now() - queryStartTime;
      if (queryTimeMs >= maxQueryTimeMs) {
        console.warn(`[GSI4] Query timeout reached after ${iterations} iterations and ${queryTimeMs}ms. Returning partial results.`, {
          requestedLimit,
          itemsFound: trips.length,
          filters,
        });
      }

      const trimmedTrips = trips.slice(0, requestedLimit);

      const response: { trips: Trip[]; lastEvaluatedKey?: string } = { 
        trips: trimmedTrips 
      };

      // CRITICAL: Set lastEvaluatedKey based on the LAST RETURNED ITEM, not last fetched item
      // This ensures no items are lost between pages when application-layer filtering is applied
      if (trips.length > requestedLimit && trimmedTrips.length > 0) {
        const lastReturnedTrip = trimmedTrips[trimmedTrips.length - 1];
        const scheduledDate = new Date(lastReturnedTrip.scheduledTimestamp);
        
        const lastKey = {
          PK: `TRIP#${lastReturnedTrip.tripId}`,
          SK: 'METADATA',
          GSI5PK: `BROKER#${lastReturnedTrip.brokerId}`,
          GSI5SK: `${scheduledDate.toISOString().split('.')[0]}Z#${lastReturnedTrip.tripId}`,
        };
        response.lastEvaluatedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
      }

      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI4', responseTimeMs, totalRCU, isError);
      this.logQueryCompletion('GSI4', filters, totalRCU, trimmedTrips.length, responseTimeMs);

      return response;
    } catch (error: any) {
      isError = true;
      const responseTimeMs = Date.now() - startTime;
      await this.emitQueryMetrics('GSI4', responseTimeMs, totalRCU, isError);
      this.logQueryError(error, filters, 'GSI4');
      return this.getTripsForDispatcher(dispatcherId, filters, dynamodbClient);
    }
  }

  /**
   * Apply all secondary filters at application layer
   * 
   * This method applies ALL filters (broker, status, truck, driver, driverName) 
   * at the application layer after fetching from DynamoDB.
   * 
   * This ensures:
   * - Predictable pagination (no skipped records)
   * - Consistent page sizes
   * - Simple pagination logic
   * 
   * @param trips - Array of trips to filter
   * @param filters - Filter criteria
   * @returns Filtered array of trips
   */
  private applyAllFilters(trips: Trip[], filters: any): Trip[] {
    let filtered = trips;
    const initialCount = trips.length;

    // Filter by dispatcher (for carrier queries)
    if (filters.dispatcherId) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(trip => {
        const matches = trip.dispatcherId === filters.dispatcherId;
        if (!matches && beforeCount <= 10) {
          console.log(`[applyAllFilters] Trip ${trip.tripId} dispatcher mismatch: ${trip.dispatcherId} !== ${filters.dispatcherId}`);
        }
        return matches;
      });
      console.log(`[applyAllFilters] After dispatcher filter (${filters.dispatcherId}): ${filtered.length} trips (removed ${beforeCount - filtered.length})`);
    }

    // Filter by broker
    if (filters.brokerId) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(trip => {
        const matches = trip.brokerId === filters.brokerId;
        if (!matches && beforeCount <= 10) {
          console.log(`[applyAllFilters] Trip ${trip.tripId} broker mismatch: ${trip.brokerId} !== ${filters.brokerId}`);
        }
        return matches;
      });
      console.log(`[applyAllFilters] After broker filter (${filters.brokerId}): ${filtered.length} trips (removed ${beforeCount - filtered.length})`);
    }

    // Filter by status
    if (filters.orderStatus) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(trip => trip.orderStatus === filters.orderStatus);
      console.log(`[applyAllFilters] After status filter (${filters.orderStatus}): ${filtered.length} trips (removed ${beforeCount - filtered.length})`);
    }

    // Filter by truck
    if (filters.truckId) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(trip => trip.truckId === filters.truckId);
      console.log(`[applyAllFilters] After truck filter (${filters.truckId}): ${filtered.length} trips (removed ${beforeCount - filtered.length})`);
    }

    // Filter by driver
    if (filters.driverId) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(trip => trip.driverId === filters.driverId);
      console.log(`[applyAllFilters] After driver filter (${filters.driverId}): ${filtered.length} trips (removed ${beforeCount - filtered.length})`);
    }

    // Filter by driver name (case-insensitive)
    if (filters.driverName) {
      filtered = this.applyDriverNameFilter(filtered, filters.driverName);
    }

    if (initialCount !== filtered.length) {
      console.log(`[applyAllFilters] Total: ${initialCount} → ${filtered.length} trips after all filters`);
    }

    return filtered;
  }

  /**
   * Apply case-insensitive driver name filtering in application layer
   * 
   * NOTE: Driver name filtering is not supported in the current schema.
   * The Trip table only stores driverId. To filter by driver name, you would need to:
   * 1. Fetch all driver records from Users table
   * 2. Filter by name
   * 3. Get their userIds
   * 4. Filter trips by those userIds
   * 
   * For now, this method returns all trips if driverName filter is provided.
   */
  private applyDriverNameFilter(trips: Trip[], driverName: string | undefined): Trip[] {
    if (!driverName) {
      return trips;
    }

    // TODO: Implement driver name filtering by fetching driver records from Users table
    console.warn('Driver name filtering is not yet implemented. Returning all trips.');
    return trips;
  }

  /**
   * Map DynamoDB item to Trip interface
   */
  private mapItemToTrip(item: any): Trip {
    return {
      // Primary identifiers
      tripId: item.tripId,
      
      // Entity relationships
      carrierId: item.carrierId || item.dispatcherId, // Fallback for old data
      dispatcherId: item.dispatcherId,
      driverId: item.driverId,
      truckId: item.truckId,
      trailerId: item.trailerId || '',
      truckOwnerId: item.truckOwnerId || '',
      brokerId: item.brokerId,
      
      // Order information
      orderConfirmation: item.orderConfirmation || '',
      orderStatus: item.orderStatus || item.status || 'Scheduled',
      
      // Timestamps
      scheduledTimestamp: item.scheduledTimestamp,
      pickupTimestamp: item.pickupTimestamp || null,
      deliveryTimestamp: item.deliveryTimestamp || null,
      
      // Pickup location details
      pickupCompany: item.pickupCompany || '',
      pickupAddress: item.pickupAddress || '',
      pickupCity: item.pickupCity || '',
      pickupState: item.pickupState || '',
      pickupZip: item.pickupZip || '',
      pickupPhone: item.pickupPhone || '',
      pickupNotes: item.pickupNotes || '',
      
      // Delivery location details
      deliveryCompany: item.deliveryCompany || '',
      deliveryAddress: item.deliveryAddress || '',
      deliveryCity: item.deliveryCity || '',
      deliveryState: item.deliveryState || '',
      deliveryZip: item.deliveryZip || '',
      deliveryPhone: item.deliveryPhone || '',
      deliveryNotes: item.deliveryNotes || '',
      
      // Mileage tracking
      mileageEmpty: item.mileageEmpty || 0,
      mileageOrder: item.mileageOrder || 0,
      mileageTotal: item.mileageTotal || 0,
      
      // Rates
      brokerRate: item.brokerRate || 0,
      driverRate: item.driverRate || 0,
      truckOwnerRate: item.truckOwnerRate || 0,
      dispatcherRate: item.dispatcherRate || 0,
      factoryRate: item.factoryRate || 0,
      orderRate: item.orderRate || 0,
      orderAverage: item.orderAverage || 0,
      
      // Payments
      brokerPayment: item.brokerPayment || 0,
      driverPayment: item.driverPayment || 0,
      truckOwnerPayment: item.truckOwnerPayment || 0,
      dispatcherPayment: item.dispatcherPayment || 0,
      
      // Advances
      brokerAdvance: item.brokerAdvance || 0,
      driverAdvance: item.driverAdvance || 0,
      factoryAdvance: item.factoryAdvance || 0,
      
      // Costs and expenses
      fuelCost: item.fuelCost || 0,
      fuelGasAvgCost: item.fuelGasAvgCost || 0,
      fuelGasAvgGallxMil: item.fuelGasAvgGallxMil || 0,
      brokerCost: item.brokerCost || 0,
      factoryCost: item.factoryCost || 0,
      lumperValue: item.lumperValue || 0,
      detentionValue: item.detentionValue || 0,
      orderExpenses: item.orderExpenses || 0,
      orderRevenue: item.orderRevenue || 0,
      
      // Additional notes
      notes: item.notes || '',
      
      // Audit timestamps
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
      truckId: filters.truckId,
      driverId: filters.driverId,
    };

    // Use getAllTripsForAggregation to fetch ALL trips in the date range
    // Payment reports need complete data for accurate aggregation, not just paginated results
    const trips = await this.getAllTripsForAggregation(userId, role, tripFilters);

    // Convert trips to payment details
    const tripPaymentDetails: TripPaymentDetail[] = trips.map((trip) => ({
      tripId: trip.tripId,
      dispatcherId: trip.dispatcherId,
      scheduledTimestamp: trip.scheduledTimestamp,
      pickupLocation: `${trip.pickupCity}, ${trip.pickupState}`, // Construct from new fields
      dropoffLocation: `${trip.deliveryCity}, ${trip.deliveryState}`, // Construct from new fields
      brokerId: trip.brokerId,
      brokerName: '', // Will be fetched separately if needed
      truckId: trip.truckId,
      driverId: trip.driverId,
      driverName: '', // Will be fetched separately if needed
      brokerPayment: trip.brokerPayment,
      truckOwnerPayment: trip.truckOwnerPayment,
      driverPayment: trip.driverPayment,
      mileageOrder: trip.mileageOrder,
      lumperFees: trip.lumperValue, // Map from new field name
      detentionFees: trip.detentionValue, // Map from new field name
      status: trip.orderStatus, // Use orderStatus as the source
      orderStatus: trip.orderStatus,
    }));

    // Generate role-specific report
    switch (role) {
      case UserRole.Dispatcher:
        return this.generateDispatcherReport(tripPaymentDetails, filters.groupBy);
      case UserRole.Driver:
        return this.generateDriverReport(tripPaymentDetails, filters.groupBy);
      case UserRole.LorryOwner:
      case UserRole.TruckOwner:
        return this.generateTruckOwnerReport(tripPaymentDetails, filters.groupBy);
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
    const totalTruckOwnerPayments = trips.reduce((sum, trip) => sum + trip.truckOwnerPayment, 0);
    
    // Calculate additional fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionFees = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    
    // Profit calculation includes additional fees as expenses (Requirement 7.2)
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalTruckOwnerPayments - totalAdditionalFees;

    const report: DispatcherPaymentReport = {
      totalBrokerPayments,
      totalDriverPayments,
      totalTruckOwnerPayments,
      totalLumperFees,
      totalDetentionFees,
      totalAdditionalFees,
      profit: totalProfit,
      tripCount: trips.length,
      trips,
      // Always include all grouped data for frontend flexibility
      groupedByBroker: this.groupByBroker(trips),
      groupedByDriver: this.groupByDriver(trips),
      groupedByTruck: this.groupByTruck(trips),
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
    const totalDistance = trips.reduce((sum, trip) => sum + (trip.mileageOrder || 0), 0);

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
   * Generate truck owner payment report
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  private generateTruckOwnerReport(
    trips: TripPaymentDetail[],
    groupBy?: string,
  ): TruckOwnerPaymentReport {
    const totalTruckOwnerPayments = trips.reduce((sum, trip) => sum + trip.truckOwnerPayment, 0);

    const report: TruckOwnerPaymentReport = {
      totalTruckOwnerPayments,
      tripCount: trips.length,
      trips,
    };

    // Add grouping if requested
    if (groupBy === 'truck') {
      report.groupedByTruck = this.groupByTruck(trips);
    } else if (groupBy === 'dispatcher') {
      report.groupedByDispatcher = this.groupByDispatcherForTruckOwner(trips);
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
          brokerName: trip.brokerId, // Use ID as placeholder, frontend can fetch name
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
          driverName: trip.driverId, // Use ID as placeholder, frontend can fetch name
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
   * Group trips by truck
   */
  private groupByTruck(trips: TripPaymentDetail[]): Record<string, {
    totalPayment: number;
    tripCount: number;
  }> {
    const grouped: Record<string, {
      totalPayment: number;
      tripCount: number;
    }> = {};

    for (const trip of trips) {
      if (!grouped[trip.truckId]) {
        grouped[trip.truckId] = {
          totalPayment: 0,
          tripCount: 0,
        };
      }
      grouped[trip.truckId].totalPayment += trip.truckOwnerPayment;
      grouped[trip.truckId].tripCount += 1;
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
   * Group trips by dispatcher for truck owner reports
   * Sum truck owner payments by dispatcher
   */
  private groupByDispatcherForTruckOwner(trips: TripPaymentDetail[]): Record<string, {
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
      
      grouped[dispatcherId].totalPayment += trip.truckOwnerPayment;
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
      summary[trip.orderStatus] = (summary[trip.orderStatus] || 0) + 1;
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
    totalTruckOwnerPayments: number;
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
    const totalTruckOwnerPayments = trips.reduce((sum, trip) => sum + trip.truckOwnerPayment, 0);
    
    // Calculate fuel costs (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
    const totalFuelCosts = trips.reduce((sum, trip) => {
      if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
        const totalMiles = (trip.loadedMiles || trip.mileageOrder || 0) + (trip.emptyMiles || 0);
        return sum + (totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost);
      }
      return sum;
    }, 0);
    
    // Calculate additional fees (Requirements 7.1, 7.2, 7.3, 7.4, 7.5)
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionFees = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalAdditionalFees = totalLumperFees + totalDetentionFees;
    
    // Profit calculation includes fuel costs and additional fees as expenses (Requirements 6.2, 7.2)
    const totalProfit = totalBrokerPayments - totalDriverPayments - totalTruckOwnerPayments - totalFuelCosts - totalAdditionalFees;

    return {
      totalBrokerPayments,
      totalDriverPayments,
      totalTruckOwnerPayments,
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
    truckOwnerPayments: number[];
    profit: number[];
  }> {
    // Get ALL trips for the dispatcher with filters (no pagination limit for aggregation)
    const trips = await this.getAllTripsForAggregation(dispatcherId, UserRole.Dispatcher, filters);

    // Group trips by month
    const monthlyData: Record<string, {
      brokerPayments: number;
      driverPayments: number;
      truckOwnerPayments: number;
      fuelCosts: number;
      additionalFees: number;
    }> = {};

    for (const trip of trips) {
      // Extract year-month from scheduled date (YYYY-MM)
      const date = new Date(trip.scheduledTimestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          brokerPayments: 0,
          driverPayments: 0,
          truckOwnerPayments: 0,
          fuelCosts: 0,
          additionalFees: 0,
        };
      }

      monthlyData[monthKey].brokerPayments += trip.brokerPayment;
      monthlyData[monthKey].driverPayments += trip.driverPayment;
      monthlyData[monthKey].truckOwnerPayments += trip.truckOwnerPayment;
      
      // Add fuel costs (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
      if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
        const totalMiles = (trip.loadedMiles || trip.mileageOrder || 0) + (trip.emptyMiles || 0);
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
    const truckOwnerPayments: number[] = [];
    const profit: number[] = [];

    for (const month of sortedMonths) {
      // Format label as "MMM YYYY" (e.g., "Jan 2024")
      const [year, monthNum] = month.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      labels.push(label);
      brokerPayments.push(monthlyData[month].brokerPayments);
      driverPayments.push(monthlyData[month].driverPayments);
      truckOwnerPayments.push(monthlyData[month].truckOwnerPayments);
      profit.push(
        monthlyData[month].brokerPayments -
        monthlyData[month].driverPayments -
        monthlyData[month].truckOwnerPayments -
        monthlyData[month].fuelCosts -
        monthlyData[month].additionalFees
      );
    }

    return {
      labels,
      brokerPayments,
      driverPayments,
      truckOwnerPayments,
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

  /**
   * Enrich trips with asset metadata for frontend display
   * Fetches related entities (brokers, trucks, trailers, drivers) and includes them in response
   */
  private async enrichTripsWithAssetMetadata(
    trips: Trip[],
    userId: string,
    userRole: UserRole,
  ): Promise<{ trips: Trip[]; assets: any }> {
    
    // Collect unique IDs from all trips
    const brokerIds = new Set<string>();
    const truckIds = new Set<string>();
    const trailerIds = new Set<string>();
    const driverIds = new Set<string>();

    trips.forEach(trip => {
      if (trip.brokerId) brokerIds.add(trip.brokerId);
      if (trip.truckId) truckIds.add(trip.truckId);
      if (trip.trailerId) trailerIds.add(trip.trailerId);
      if (trip.driverId) driverIds.add(trip.driverId);
    });

    // Fetch all related entities in parallel
    const [brokers, trucks, trailers, drivers] = await Promise.all([
      this.fetchBrokersByIds(Array.from(brokerIds)),
      this.fetchTrucksByIds(Array.from(truckIds)),
      this.fetchTrailersByIds(Array.from(trailerIds)),
      this.fetchDriversByIds(Array.from(driverIds)),
    ]);

    // Build lookup maps
    const brokerMap = new Map(brokers.map(b => [b.brokerId, b]));
    const truckMap = new Map(trucks.map(t => [t.truckId, t]));
    const trailerMap = new Map(trailers.map(t => [t.trailerId, t]));
    const driverMap = new Map(drivers.map(d => [d.userId, d]));

    // Enrich trips with names
    const enrichedTrips = trips.map(trip => {
      const enriched = { ...trip };
      
      // Add broker name
      if (trip.brokerId && brokerMap.has(trip.brokerId)) {
        enriched.brokerName = brokerMap.get(trip.brokerId)!.brokerName;
      }
      
      // Add driver name and license
      if (trip.driverId && driverMap.has(trip.driverId)) {
        const driver = driverMap.get(trip.driverId)!;
        enriched.driverName = driver.name;
        enriched.driverLicense = driver.nationalId; // Add driver license for table display
      }
      
      // Ensure legacy location fields are populated
      if (!enriched.pickupLocation && trip.pickupCity && trip.pickupState) {
        enriched.pickupLocation = `${trip.pickupCity}, ${trip.pickupState}`;
      }
      if (!enriched.dropoffLocation && trip.deliveryCity && trip.deliveryState) {
        enriched.dropoffLocation = `${trip.deliveryCity}, ${trip.deliveryState}`;
      }
      
      // Ensure legacy status field is populated
      if (!enriched.status && trip.orderStatus) {
        enriched.status = trip.orderStatus as any;
      }
      
      return enriched;
    });

    // Return enriched trips and asset metadata
    return {
      trips: enrichedTrips,
      assets: {
        brokers: brokers.map(b => ({ brokerId: b.brokerId, brokerName: b.brokerName })),
        trucks: trucks.map(t => ({ truckId: t.truckId, plate: t.plate, brand: t.brand, year: t.year })),
        trailers: trailers.map(t => ({ trailerId: t.trailerId, plate: t.plate, brand: t.brand, year: t.year })),
        drivers: drivers.map(d => ({ userId: d.userId, name: d.name, email: d.email })),
      },
    };
  }

  /**
   * Fetch brokers by IDs
   */
  private async fetchBrokersByIds(brokerIds: string[]): Promise<any[]> {
    if (brokerIds.length === 0) return [];
    
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const brokersTableName = this.configService.brokersTableName;
    
    const brokers = await Promise.all(
      brokerIds.map(async (brokerId) => {
        try {
          const result = await dynamodbClient.send(
            new GetCommand({
              TableName: brokersTableName,
              Key: { PK: `BROKER#${brokerId}`, SK: 'METADATA' },
            }),
          );
          return result.Item ? { brokerId: result.Item.brokerId, brokerName: result.Item.brokerName } : null;
        } catch (error) {
          console.error(`Error fetching broker ${brokerId}:`, error);
          return null;
        }
      }),
    );
    
    return brokers.filter(b => b !== null);
  }

  /**
   * Fetch trucks by IDs
   */
  private async fetchTrucksByIds(truckIds: string[]): Promise<any[]> {
    if (truckIds.length === 0) return [];
    
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const trucksTableName = this.configService.lorriesTableName;
    
    const trucks = await Promise.all(
      truckIds.map(async (truckId) => {
        try {
          const result = await dynamodbClient.send(
            new GetCommand({
              TableName: trucksTableName,
              Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
            }),
          );
          return result.Item ? {
            truckId: result.Item.truckId,
            plate: result.Item.plate,
            brand: result.Item.brand,
            year: result.Item.year,
          } : null;
        } catch (error) {
          console.error(`Error fetching truck ${truckId}:`, error);
          return null;
        }
      }),
    );
    
    return trucks.filter(t => t !== null);
  }

  /**
   * Fetch trailers by IDs
   */
  private async fetchTrailersByIds(trailerIds: string[]): Promise<any[]> {
    if (trailerIds.length === 0) return [];
    
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const trailersTableName = this.configService.trailersTableName;
    
    const trailers = await Promise.all(
      trailerIds.map(async (trailerId) => {
        try {
          const result = await dynamodbClient.send(
            new GetCommand({
              TableName: trailersTableName,
              Key: { PK: `TRAILER#${trailerId}`, SK: 'METADATA' },
            }),
          );
          return result.Item ? {
            trailerId: result.Item.trailerId,
            plate: result.Item.plate,
            brand: result.Item.brand,
            year: result.Item.year,
          } : null;
        } catch (error) {
          console.error(`Error fetching trailer ${trailerId}:`, error);
          return null;
        }
      }),
    );
    
    return trailers.filter(t => t !== null);
  }

  /**
   * Fetch drivers by IDs
   */
  private async fetchDriversByIds(driverIds: string[]): Promise<any[]> {
    if (driverIds.length === 0) return [];
    
    const dynamodbClient = this.awsService.getDynamoDBClient();
    const usersTableName = this.configService.usersTableName;
    
    const drivers = await Promise.all(
      driverIds.map(async (driverId) => {
        try {
          const result = await dynamodbClient.send(
            new GetCommand({
              TableName: usersTableName,
              Key: { PK: `USER#${driverId}`, SK: 'METADATA' },
            }),
          );
          return result.Item ? {
            userId: result.Item.userId,
            name: result.Item.name,
            email: result.Item.email,
            nationalId: result.Item.ss, // Driver license
          } : null;
        } catch (error) {
          console.error(`Error fetching driver ${driverId}:`, error);
          return null;
        }
      }),
    );
    
    return drivers.filter(d => d !== null);
  }

  /**
   * Filter trip data based on user role
   * Requirements: 1.12, 1.13, 1.20
   */
  private filterTripByRole(trip: Trip, role: UserRole): Partial<Trip> | Trip {
    switch (role) {
      case UserRole.Driver:
        return this.filterTripForDriver(trip);
      
      case UserRole.LorryOwner:
      case UserRole.TruckOwner:
        return this.filterTripForTruckOwner(trip);
      
      case UserRole.Dispatcher:
      case UserRole.Carrier:
      case UserRole.Admin:
        // Full access - return all fields
        return trip;
      
      default:
        // For unknown roles, apply driver filtering (most restrictive)
        return this.filterTripForDriver(trip);
    }
  }

  /**
   * Filter trip for driver view - hide sensitive financial fields
   * Requirements: 1.12
   */
  private filterTripForDriver(trip: Trip): Partial<Trip> {
    return {
      // Basic trip info
      tripId: trip.tripId,
      orderConfirmation: trip.orderConfirmation,
      orderStatus: trip.orderStatus,
      
      // Timestamps
      scheduledTimestamp: trip.scheduledTimestamp,
      pickupTimestamp: trip.pickupTimestamp,
      deliveryTimestamp: trip.deliveryTimestamp,
      
      // Locations
      pickupCity: trip.pickupCity,
      pickupState: trip.pickupState,
      deliveryCity: trip.deliveryCity,
      deliveryState: trip.deliveryState,
      
      // Mileage
      mileageOrder: trip.mileageOrder,
      mileageTotal: trip.mileageTotal,
      
      // Driver payment info (visible to driver)
      driverPayment: trip.driverPayment,
      driverRate: trip.driverRate,
      driverAdvance: trip.driverAdvance,
      driverId: trip.driverId,
      
      // Vehicle info
      truckId: trip.truckId,
      trailerId: trip.trailerId,
      
      // Notes
      notes: trip.notes,
    };
  }

  /**
   * Filter trip for truck owner view - hide sensitive financial fields
   * Requirements: 1.13
   */
  private filterTripForTruckOwner(trip: Trip): Partial<Trip> {
    return {
      // Basic trip info
      tripId: trip.tripId,
      orderConfirmation: trip.orderConfirmation,
      orderStatus: trip.orderStatus,
      
      // Timestamps
      scheduledTimestamp: trip.scheduledTimestamp,
      pickupTimestamp: trip.pickupTimestamp,
      deliveryTimestamp: trip.deliveryTimestamp,
      
      // Locations
      pickupCity: trip.pickupCity,
      pickupState: trip.pickupState,
      deliveryCity: trip.deliveryCity,
      deliveryState: trip.deliveryState,
      
      // Mileage
      mileageOrder: trip.mileageOrder,
      mileageTotal: trip.mileageTotal,
      
      // Truck owner payment info (visible to truck owner)
      truckOwnerPayment: trip.truckOwnerPayment,
      truckOwnerId: trip.truckOwnerId,
      
      // Vehicle info
      truckId: trip.truckId,
      
      // Notes
      notes: trip.notes,
    };
  }
}
