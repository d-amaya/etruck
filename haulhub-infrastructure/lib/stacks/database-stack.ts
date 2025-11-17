import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName, getEnvironmentConfig } from '../config';

/**
 * DatabaseStack - DynamoDB Tables for HaulHub Data Storage
 * 
 * This stack creates:
 * - Main table (legacy, to be deprecated)
 * - Trips table with GSI1, GSI2, GSI3 for optimized trip queries
 * - Brokers table for broker reference data
 * - Lorries table with GSI1, GSI2 for lorry and document queries
 * - Users table for user profile data
 * - On-demand billing mode
 * - Encryption at rest
 */
export class DatabaseStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly tripsTable: dynamodb.Table;
  public readonly brokersTable: dynamodb.Table;
  public readonly lorriesTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const config = getEnvironmentConfig(props.environment);

    // Create DynamoDB Table with single table design
    this.table = new dynamodb.Table(this, 'HaulHubTable', {
      tableName: getResourceName('Table', props.environment),
      
      // Partition key and sort key for single table design
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Billing mode - on-demand for cost efficiency with variable workloads
      billingMode: config.dynamoDbBillingMode === 'PAY_PER_REQUEST'
        ? dynamodb.BillingMode.PAY_PER_REQUEST
        : dynamodb.BillingMode.PROVISIONED,
      
      // Encryption at rest using AWS managed keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Point-in-time recovery for production
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.enableDynamoDbPitr,
      },
      
      // Deletion protection
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      
      // Stream configuration (for future use with Lambda triggers)
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      
      // Time to live attribute (for future use)
      timeToLiveAttribute: 'ttl',
    });

    // GSI1: For querying trips by dispatcher
    // Access pattern: Dispatcher views their trips
    // GSI1PK = DISPATCHER#<DispatcherId>
    // GSI1SK = <TripDate>#<TripId>
    this.table.addGlobalSecondaryIndex({
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

    // GSI2: For querying trips by lorry owner
    // Access pattern: Lorry owner views trips for their lorries
    // GSI2PK = OWNER#<OwnerId>
    // GSI2SK = <TripDate>#<LorryId>#<TripId>
    this.table.addGlobalSecondaryIndex({
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

    // GSI3: For querying trips by driver AND lorries by verification status
    // Access pattern 1: Driver views their assigned trips
    // GSI3PK = DRIVER#<DriverId>
    // GSI3SK = <TripDate>#<TripId>
    // 
    // Access pattern 2: Admin views pending lorry verifications
    // GSI3PK = LORRY_STATUS#<Status>
    // GSI3SK = <CreatedAt>#<LorryId>
    this.table.addGlobalSecondaryIndex({
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



    // Add tags to table
    cdk.Tags.of(this.table).add('Component', 'Database');

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
      exportName: `${getResourceName('TableName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB Table ARN',
      exportName: `${getResourceName('TableArn', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'TableStreamArn', {
      value: this.table.tableStreamArn || 'N/A',
      description: 'DynamoDB Table Stream ARN',
    });

    new cdk.CfnOutput(this, 'GSI1IndexName', {
      value: 'GSI1',
      description: 'GSI1 Index Name (Driver Trip Queries)',
    });

    new cdk.CfnOutput(this, 'GSI2IndexName', {
      value: 'GSI2',
      description: 'GSI2 Index Name (Lorry Trip Queries)',
    });

    new cdk.CfnOutput(this, 'GSI3IndexName', {
      value: 'GSI3',
      description: 'GSI3 Index Name (Lorry Verification Status Queries)',
    });

    // ========================================
    // NEW DEDICATED TABLES
    // ========================================

    // Trips Table - Optimized for trip operations with O(1) lookups by trip ID
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

    // Brokers Table - Reference data for brokers
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
