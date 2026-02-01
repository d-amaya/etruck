import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { HaulHubStackProps } from '../lib/types';
import { getEnvironmentConfig } from '../lib/config';

describe('DatabaseStack', () => {
  let app: cdk.App;
  let stack: DatabaseStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const config = getEnvironmentConfig('dev');
    const props: HaulHubStackProps = {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
      environment: 'dev',
      awsProfile: 'haul-hub',
      config,
    };
    stack = new DatabaseStack(app, 'TestDatabaseStack', props);
    template = Template.fromStack(stack);
  });

  describe('DynamoDB Tables', () => {
    test('should create trips table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
      });
    });

    test('should create brokers table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-BrokersTable-dev',
      });
    });

    test('should create lorries table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-LorriesTable-dev',
      });
    });

    test('should create users table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-UsersTable-dev',
      });
    });

    test('should configure all tables with PK and SK', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
          {
            AttributeName: 'PK',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'SK',
            KeyType: 'RANGE',
          },
        ],
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'PK',
            AttributeType: 'S',
          },
          {
            AttributeName: 'SK',
            AttributeType: 'S',
          },
        ]),
      });
    });

    test('should configure on-demand billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('should enable encryption at rest', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    test('should enable DynamoDB streams on trips table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });

    test('should have Component tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          {
            Key: 'Component',
            Value: 'Database',
          },
        ]),
      });
    });
  });

  describe('Global Secondary Indexes', () => {
    test('should create GSI1 on trips table for dispatcher queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI1',
            KeySchema: [
              {
                AttributeName: 'GSI1PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI1SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should create GSI2 on trips table for lorry owner queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI2',
            KeySchema: [
              {
                AttributeName: 'GSI2PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI2SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should create GSI3 on trips table for driver queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI3',
            KeySchema: [
              {
                AttributeName: 'GSI3PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI3SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should create GSI4 on trips table for broker queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI4',
            KeySchema: [
              {
                AttributeName: 'GSI4PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI4SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should create GSI1 on lorries table for admin verification', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-LorriesTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI1',
            KeySchema: [
              {
                AttributeName: 'GSI1PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI1SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should create GSI2 on lorries table for document queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-LorriesTable-dev',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI2',
            KeySchema: [
              {
                AttributeName: 'GSI2PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI2SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('should define all GSI attributes on trips table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-TripsTable-dev',
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
          { AttributeName: 'GSI3PK', AttributeType: 'S' },
          { AttributeName: 'GSI3SK', AttributeType: 'S' },
          { AttributeName: 'GSI4PK', AttributeType: 'S' },
          { AttributeName: 'GSI4SK', AttributeType: 'S' },
        ]),
      });
    });

    test('trips table should have exactly four GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const tripsTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'HaulHub-TripsTable-dev'
      ) as any;
      expect(tripsTable.Properties.GlobalSecondaryIndexes.length).toBe(4);
    });

    test('lorries table should have exactly two GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const lorriesTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'HaulHub-LorriesTable-dev'
      ) as any;
      expect(lorriesTable.Properties.GlobalSecondaryIndexes.length).toBe(2);
    });
  });

  describe('Stack Outputs', () => {
    test('should export trips table name', () => {
      template.hasOutput('TripsTableName', {
        Description: 'Trips DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-TripsTableName-dev',
        },
      });
    });

    test('should export trips table ARN', () => {
      template.hasOutput('TripsTableArn', {
        Description: 'Trips DynamoDB Table ARN',
        Export: {
          Name: 'HaulHub-TripsTableArn-dev',
        },
      });
    });

    test('should output trips table stream ARN', () => {
      template.hasOutput('TripsTableStreamArn', {
        Description: 'Trips DynamoDB Table Stream ARN',
      });
    });

    test('should export brokers table name', () => {
      template.hasOutput('BrokersTableName', {
        Description: 'Brokers DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-BrokersTableName-dev',
        },
      });
    });

    test('should export lorries table name', () => {
      template.hasOutput('LorriesTableName', {
        Description: 'Lorries DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-LorriesTableName-dev',
        },
      });
    });

    test('should export users table name', () => {
      template.hasOutput('UsersTableName', {
        Description: 'Users DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-UsersTableName-dev',
        },
      });
    });

    test('should output GSI4 index name for broker queries', () => {
      template.hasOutput('TripsTableGSI4IndexName', {
        Description: 'GSI4 Index Name (Broker-Optimized Index for Trip Filtering)',
      });
    });
  });

  describe('Resource Count', () => {
    test('should create nine DynamoDB tables (4 HaulHub + 5 eTrucky tables)', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 9);
    });
  });

  describe('Production Environment', () => {
    test('should set RETAIN removal policy for production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new DatabaseStack(prodApp, 'ProdDatabaseStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResource('AWS::DynamoDB::Table', {
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain',
      });
    });

    test('should set DESTROY removal policy for non-production', () => {
      template.hasResource('AWS::DynamoDB::Table', {
        UpdateReplacePolicy: 'Delete',
        DeletionPolicy: 'Delete',
      });
    });

    test('should enable point-in-time recovery for production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new DatabaseStack(prodApp, 'ProdDatabaseStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    test('should disable point-in-time recovery for dev', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
    });
  });
});
