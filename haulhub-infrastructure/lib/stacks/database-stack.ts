import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName, getEnvironmentConfig } from '../config';

/**
 * DatabaseStack - DynamoDB Tables for HaulHub Data Storage
 * 
 * ACTIVE TABLES (Multi-Table Architecture):
 * - Trips table with GSI1, GSI2, GSI3, GSI4 for optimized trip queries
 * - Lorries table with GSI1, GSI2 for lorry and document queries
 * - Users table for user profile data
 * - Brokers table for broker reference data
 * 
 * NEW eTRUCKY TABLES (Parallel Architecture for Migration):
 * - eTrucky-Users: All user types including carriers (unified user model)
 * - eTrucky-Brokers: Broker reference data
 * - eTrucky-Trucks: Truck assets with carrier and owner relationships
 * - eTrucky-Trailers: Trailer assets with carrier relationships
 * - eTrucky-Trips: Enhanced trips with userId-based relationships
 * 
 * All tables use:
 * - On-demand billing mode
 * - Encryption at rest
 * - Point-in-time recovery (configurable)
 */
export class DatabaseStack extends cdk.Stack {
  // Legacy HaulHub tables (kept for backward compatibility)
  public readonly tripsTable: dynamodb.Table;
  public readonly brokersTable: dynamodb.Table;
  public readonly lorriesTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;

  // New eTrucky tables (parallel architecture)
  public readonly eTruckyBrokersTable: dynamodb.Table;
  public readonly eTruckyTrucksTable: dynamodb.Table;
  public readonly eTruckyTrailersTable: dynamodb.Table;
  public readonly eTruckyTripsTable: dynamodb.Table;
  public readonly eTruckyUsersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const config = getEnvironmentConfig(props.environment);

    // ========================================
    // DEDICATED TABLES
    // ========================================
    // These tables are actively used by the application services.
    // They replace the legacy single-table design with optimized multi-table architecture.

    // Trips Table - Optimized for trip operations with O(1) lookups by trip ID
    // Used by: TripsService, AnalyticsService
    this.tripsTable = new dynamodb.Table(this, 'TripsTable', {
      tableName: getResourceName('TripsTable', props.environment),
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI1: Dispatcher trip queries
    this.tripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Lorry owner trip queries
    this.tripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: Driver trip queries
    this.tripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: {
        name: 'GSI3PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI3SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: Broker trip queries (Trip Filtering Optimization)
    // Access pattern: Dispatcher queries trips by broker with date range
    // GSI4PK = DISPATCHER#<DispatcherId>
    // GSI4SK = BROKER#<BrokerId>#<YYYY-MM-DD>#<TripId>
    // Selectivity: Medium (~200 items per broker)
    this.tripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: {
        name: 'GSI4PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI4SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.tripsTable).add('Component', 'Database');

    new cdk.CfnOutput(this, 'TripsTableName', {
      value: this.tripsTable.tableName,
      description: 'Trips DynamoDB Table Name',
      exportName: `${getResourceName('TripsTableName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'TripsTableArn', {
      value: this.tripsTable.tableArn,
      description: 'Trips DynamoDB Table ARN',
      exportName: `${getResourceName('TripsTableArn', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'TripsTableStreamArn', {
      value: this.tripsTable.tableStreamArn || 'N/A',
      description: 'Trips DynamoDB Table Stream ARN',
    });

    new cdk.CfnOutput(this, 'TripsTableGSI4IndexName', {
      value: 'GSI4',
      description: 'GSI4 Index Name (Broker-Optimized Index for Trip Filtering)',
    });

    // Brokers Table - Reference data for brokers
    // Used by: BrokersService
    this.brokersTable = new dynamodb.Table(this, 'BrokersTable', {
      tableName: getResourceName('BrokersTable', props.environment),
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(this.brokersTable).add('Component', 'Database');

    new cdk.CfnOutput(this, 'BrokersTableName', {
      value: this.brokersTable.tableName,
      description: 'Brokers DynamoDB Table Name',
      exportName: `${getResourceName('BrokersTableName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'BrokersTableArn', {
      value: this.brokersTable.tableArn,
      description: 'Brokers DynamoDB Table ARN',
      exportName: `${getResourceName('BrokersTableArn', props.environment)}`,
    });

    // Lorries Table - Lorry registration and verification documents
    // Used by: TripsService, TruckService, TrailerService
    this.lorriesTable = new dynamodb.Table(this, 'LorriesTable', {
      tableName: getResourceName('LorriesTable', props.environment),
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: Admin verification queries
    this.lorriesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Document queries by lorry
    this.lorriesTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.lorriesTable).add('Component', 'Database');

    new cdk.CfnOutput(this, 'LorriesTableName', {
      value: this.lorriesTable.tableName,
      description: 'Lorries DynamoDB Table Name',
      exportName: `${getResourceName('LorriesTableName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'LorriesTableArn', {
      value: this.lorriesTable.tableArn,
      description: 'Lorries DynamoDB Table ARN',
      exportName: `${getResourceName('LorriesTableArn', props.environment)}`,
    });

    // Users Table - User profile data
    // Used by: User management services
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: getResourceName('UsersTable', props.environment),
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(this.usersTable).add('Component', 'Database');

    new cdk.CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      description: 'Users DynamoDB Table Name',
      exportName: `${getResourceName('UsersTableName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'UsersTableArn', {
      value: this.usersTable.tableArn,
      description: 'Users DynamoDB Table ARN',
      exportName: `${getResourceName('UsersTableArn', props.environment)}`,
    });

    // ========================================
    // eTRUCKY TABLES (New Architecture)
    // ========================================
    // These tables implement the new carrier-centric model with userId-based relationships.
    // They run in parallel with legacy HaulHub tables for zero-downtime migration.
    //
    // Key Design: Carriers are stored in eTrucky-Users with role='CARRIER' and carrierId=userId

    // eTrucky-Brokers Table - Broker reference data (independent of carriers)
    // PK: BROKER#<brokerId>
    // SK: METADATA
    this.eTruckyBrokersTable = new dynamodb.Table(this, 'ETruckyBrokersTable', {
      tableName: 'eTrucky-Brokers',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(this.eTruckyBrokersTable).add('Component', 'Database');
    cdk.Tags.of(this.eTruckyBrokersTable).add('Architecture', 'eTrucky');

    new cdk.CfnOutput(this, 'ETruckyBrokersTableName', {
      value: this.eTruckyBrokersTable.tableName,
      description: 'eTrucky Brokers DynamoDB Table Name',
      exportName: `${getResourceName('ETruckyBrokersTableName', props.environment)}`,
    });

    // eTrucky-Trucks Table - Truck assets with carrier and owner relationships
    // PK: TRUCK#<truckId>
    // SK: METADATA
    // GSI1: carrierId-index for querying trucks by carrier
    // GSI2: truckOwnerId-index for querying trucks by owner
    this.eTruckyTrucksTable = new dynamodb.Table(this, 'ETruckyTrucksTable', {
      tableName: 'eTrucky-Trucks',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: Query trucks by carrier
    this.eTruckyTrucksTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // CARRIER#<carrierId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // TRUCK#<truckId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Query trucks by owner
    this.eTruckyTrucksTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // OWNER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // TRUCK#<truckId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.eTruckyTrucksTable).add('Component', 'Database');
    cdk.Tags.of(this.eTruckyTrucksTable).add('Architecture', 'eTrucky');

    new cdk.CfnOutput(this, 'ETruckyTrucksTableName', {
      value: this.eTruckyTrucksTable.tableName,
      description: 'eTrucky Trucks DynamoDB Table Name',
      exportName: `${getResourceName('ETruckyTrucksTableName', props.environment)}`,
    });

    // eTrucky-Trailers Table - Trailer assets with carrier relationships
    // PK: TRAILER#<trailerId>
    // SK: METADATA
    // GSI1: carrierId-index for querying trailers by carrier
    this.eTruckyTrailersTable = new dynamodb.Table(this, 'ETruckyTrailersTable', {
      tableName: 'eTrucky-Trailers',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: Query trailers by carrier
    this.eTruckyTrailersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // CARRIER#<carrierId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // TRAILER#<trailerId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.eTruckyTrailersTable).add('Component', 'Database');
    cdk.Tags.of(this.eTruckyTrailersTable).add('Architecture', 'eTrucky');

    new cdk.CfnOutput(this, 'ETruckyTrailersTableName', {
      value: this.eTruckyTrailersTable.tableName,
      description: 'eTrucky Trailers DynamoDB Table Name',
      exportName: `${getResourceName('ETruckyTrailersTableName', props.environment)}`,
    });

    // eTrucky-Trips Table - Enhanced trips with userId-based relationships
    // PK: TRIP#<tripId>
    // SK: METADATA
    // GSI1: carrierId-tripDate-index
    // GSI2: dispatcherId-tripDate-index
    // GSI3: driverId-tripDate-index
    // GSI4: truckOwnerId-tripDate-index
    // GSI5: brokerId-tripDate-index
    this.eTruckyTripsTable = new dynamodb.Table(this, 'ETruckyTripsTable', {
      tableName: 'eTrucky-Trips',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI1: Carrier trip queries
    this.eTruckyTripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // CARRIER#<carrierId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // <YYYY-MM-DD>#TRIP#<tripId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Dispatcher trip queries
    this.eTruckyTripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // DISPATCHER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // <YYYY-MM-DD>#TRIP#<tripId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: Driver trip queries
    this.eTruckyTripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: {
        name: 'GSI3PK', // DRIVER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI3SK', // <YYYY-MM-DD>#TRIP#<tripId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: Truck Owner trip queries
    this.eTruckyTripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: {
        name: 'GSI4PK', // OWNER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI4SK', // <YYYY-MM-DD>#TRIP#<tripId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI5: Broker trip queries (for filtering)
    this.eTruckyTripsTable.addGlobalSecondaryIndex({
      indexName: 'GSI5',
      partitionKey: {
        name: 'GSI5PK', // BROKER#<brokerId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI5SK', // <YYYY-MM-DD>#TRIP#<tripId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.eTruckyTripsTable).add('Component', 'Database');
    cdk.Tags.of(this.eTruckyTripsTable).add('Architecture', 'eTrucky');

    new cdk.CfnOutput(this, 'ETruckyTripsTableName', {
      value: this.eTruckyTripsTable.tableName,
      description: 'eTrucky Trips DynamoDB Table Name',
      exportName: `${getResourceName('ETruckyTripsTableName', props.environment)}`,
    });

    // eTrucky-Users Table - Enhanced user profiles with carrier relationships
    // PK: USER#<userId>
    // SK: METADATA
    // GSI1: carrierId-role-index for querying users by carrier and role
    // GSI2: email-index for email lookups
    this.eTruckyUsersTable = new dynamodb.Table(this, 'ETruckyUsersTable', {
      tableName: 'eTrucky-Users',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: Query users by carrier and role
    this.eTruckyUsersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // CARRIER#<carrierId>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // ROLE#<role>#USER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Query users by email
    this.eTruckyUsersTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // EMAIL#<email>
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // USER#<userId>
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.eTruckyUsersTable).add('Component', 'Database');
    cdk.Tags.of(this.eTruckyUsersTable).add('Architecture', 'eTrucky');

    new cdk.CfnOutput(this, 'ETruckyUsersTableName', {
      value: this.eTruckyUsersTable.tableName,
      description: 'eTrucky Users DynamoDB Table Name',
      exportName: `${getResourceName('ETruckyUsersTableName', props.environment)}`,
    });
  }
}
