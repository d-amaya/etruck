import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName, getEnvironmentConfig } from '../config';

/**
 * DatabaseStack - DynamoDB Tables for eTrucky Data Storage
 * 
 * ACTIVE TABLES (Admin-Centric Hierarchy):
 * - eTruckyUsers: All user types (unified user model)
 * - eTruckyBrokers: Broker reference data
 * - eTruckyTrucks: Truck assets with carrier relationships
 * - eTruckyTrailers: Trailer assets with carrier relationships
 * - eTruckyOrders: Orders with role-based GSIs
 * 
 * All tables use:
 * - On-demand billing mode
 * - Encryption at rest
 * - Point-in-time recovery (configurable)
 * - PK/SK design with GSIs for efficient queries
 */
export class DatabaseStack extends cdk.Stack {
  public readonly v2OrdersTable: dynamodb.Table;
  public readonly v2UsersTable: dynamodb.Table;
  public readonly v2TrucksTable: dynamodb.Table;
  public readonly v2TrailersTable: dynamodb.Table;
  public readonly v2BrokersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const config = getEnvironmentConfig(props.environment);

    const v2TableProps = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: config.enableDynamoDbPitr },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    // eTruckyOrders — Orders with 5 GSIs for role-based querying
    this.v2OrdersTable = new dynamodb.Table(this, 'V2OrdersTable', {
      tableName: 'eTruckyOrders',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      ...v2TableProps,
    });

    // GSI1: CARRIER#<carrierId> + <timestamp>#<orderId>
    this.v2OrdersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: DISPATCHER#<dispatcherId> + <timestamp>#<orderId>
    this.v2OrdersTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: DRIVER#<driverId> + <timestamp>#<orderId>
    this.v2OrdersTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: ADMIN#<adminId> + <timestamp>#<orderId>
    this.v2OrdersTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI5: BROKER#<brokerId> + <timestamp>#<orderId>
    this.v2OrdersTable.addGlobalSecondaryIndex({
      indexName: 'GSI5',
      partitionKey: { name: 'GSI5PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI5SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.v2OrdersTable).add('Component', 'Database');
    cdk.Tags.of(this.v2OrdersTable).add('Architecture', 'eTrucky-v2');

    new cdk.CfnOutput(this, 'V2OrdersTableName', {
      value: this.v2OrdersTable.tableName,
      description: 'v2 Orders DynamoDB Table Name',
      exportName: `${getResourceName('V2OrdersTableName', props.environment)}`,
    });

    // eTruckyUsers — Users with GSI1 (by carrier) and GSI2 (by email)
    this.v2UsersTable = new dynamodb.Table(this, 'V2UsersTable', {
      tableName: 'eTruckyUsers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      ...v2TableProps,
    });

    this.v2UsersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.v2UsersTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.v2UsersTable).add('Component', 'Database');
    cdk.Tags.of(this.v2UsersTable).add('Architecture', 'eTrucky-v2');

    new cdk.CfnOutput(this, 'V2UsersTableName', {
      value: this.v2UsersTable.tableName,
      description: 'v2 Users DynamoDB Table Name',
      exportName: `${getResourceName('V2UsersTableName', props.environment)}`,
    });

    // eTruckyTrucks — GSI1 only (no GSI2, TruckOwner removed)
    this.v2TrucksTable = new dynamodb.Table(this, 'V2TrucksTable', {
      tableName: 'eTruckyTrucks',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      ...v2TableProps,
    });

    this.v2TrucksTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.v2TrucksTable).add('Component', 'Database');
    cdk.Tags.of(this.v2TrucksTable).add('Architecture', 'eTrucky-v2');

    new cdk.CfnOutput(this, 'V2TrucksTableName', {
      value: this.v2TrucksTable.tableName,
      description: 'v2 Trucks DynamoDB Table Name',
      exportName: `${getResourceName('V2TrucksTableName', props.environment)}`,
    });

    // eTruckyTrailers — GSI1 only
    this.v2TrailersTable = new dynamodb.Table(this, 'V2TrailersTable', {
      tableName: 'eTruckyTrailers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      ...v2TableProps,
    });

    this.v2TrailersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.v2TrailersTable).add('Component', 'Database');
    cdk.Tags.of(this.v2TrailersTable).add('Architecture', 'eTrucky-v2');

    new cdk.CfnOutput(this, 'V2TrailersTableName', {
      value: this.v2TrailersTable.tableName,
      description: 'v2 Trailers DynamoDB Table Name',
      exportName: `${getResourceName('V2TrailersTableName', props.environment)}`,
    });

    // eTruckyBrokers — No GSIs
    this.v2BrokersTable = new dynamodb.Table(this, 'V2BrokersTable', {
      tableName: 'eTruckyBrokers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      ...v2TableProps,
    });

    cdk.Tags.of(this.v2BrokersTable).add('Component', 'Database');
    cdk.Tags.of(this.v2BrokersTable).add('Architecture', 'eTrucky-v2');

    new cdk.CfnOutput(this, 'V2BrokersTableName', {
      value: this.v2BrokersTable.tableName,
      description: 'v2 Brokers DynamoDB Table Name',
      exportName: `${getResourceName('V2BrokersTableName', props.environment)}`,
    });
  }
}
