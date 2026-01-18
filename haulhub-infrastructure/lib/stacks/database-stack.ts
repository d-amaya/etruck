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
 * All tables use:
 * - On-demand billing mode
 * - Encryption at rest
 * - Point-in-time recovery (configurable)
 */
export class DatabaseStack extends cdk.Stack {
  public readonly tripsTable: dynamodb.Table;
  public readonly brokersTable: dynamodb.Table;
  public readonly lorriesTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;

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
  }
}
