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

  describe('v2 DynamoDB Tables', () => {
    test('should create eTruckyOrders table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyOrders',
      });
    });

    test('should create eTruckyUsers table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyUsers',
      });
    });

    test('should create eTruckyTrucks table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyTrucks',
      });
    });

    test('should create eTruckyTrailers table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyTrailers',
      });
    });

    test('should create eTruckyBrokers table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyBrokers',
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

    test('should enable DynamoDB streams on eTruckyOrders table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyOrders',
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });

    test('should have eTrucky-v2 Architecture tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          {
            Key: 'Architecture',
            Value: 'eTrucky-v2',
          },
        ]),
      });
    });
  });

  describe('Global Secondary Indexes - v2 Tables', () => {
    test('eTruckyOrders should have five GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const ordersTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'eTruckyOrders'
      ) as any;
      expect(ordersTable.Properties.GlobalSecondaryIndexes.length).toBe(5);
    });

    test('eTruckyUsers should have two GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const usersTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'eTruckyUsers'
      ) as any;
      expect(usersTable.Properties.GlobalSecondaryIndexes.length).toBe(2);
    });

    test('eTruckyTrucks should have GSI1', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyTrucks',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ]),
      });
    });

    test('eTruckyTrailers should have GSI1', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTruckyTrailers',
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ]),
      });
    });
  });

  describe('Stack Outputs', () => {
    test('should export v2 Orders table name', () => {
      template.hasOutput('V2OrdersTableName', {
        Description: 'v2 Orders DynamoDB Table Name',
      });
    });

    test('should export v2 Users table name', () => {
      template.hasOutput('V2UsersTableName', {
        Description: 'v2 Users DynamoDB Table Name',
      });
    });

    test('should export v2 Trucks table name', () => {
      template.hasOutput('V2TrucksTableName', {
        Description: 'v2 Trucks DynamoDB Table Name',
      });
    });

    test('should export v2 Trailers table name', () => {
      template.hasOutput('V2TrailersTableName', {
        Description: 'v2 Trailers DynamoDB Table Name',
      });
    });

    test('should export v2 Brokers table name', () => {
      template.hasOutput('V2BrokersTableName', {
        Description: 'v2 Brokers DynamoDB Table Name',
      });
    });
  });

  describe('Resource Count', () => {
    test('should create five DynamoDB tables', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 5);
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
