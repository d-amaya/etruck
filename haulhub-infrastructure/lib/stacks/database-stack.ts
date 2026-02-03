import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName, getEnvironmentConfig } from '../config';

/**
 * DatabaseStack - DynamoDB Tables for eTrucky Data Storage
 * 
 * ACTIVE TABLES (Carrier-Centric Architecture):
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
 * - PK/SK design with GSIs for efficient queries
 */
export class DatabaseStack extends cdk.Stack {
  // eTrucky tables (carrier-centric architecture)
  public readonly eTruckyBrokersTable: dynamodb.Table;
  public readonly eTruckyTrucksTable: dynamodb.Table;
  public readonly eTruckyTrailersTable: dynamodb.Table;
  public readonly eTruckyTripsTable: dynamodb.Table;
  public readonly eTruckyUsersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const config = getEnvironmentConfig(props.environment);

    // ========================================
    // eTRUCKY TABLES (Carrier-Centric Architecture)
    // ========================================
    // These tables implement the carrier-centric model with userId-based relationships.
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
