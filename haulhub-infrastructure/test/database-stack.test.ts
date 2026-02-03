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

  describe('eTrucky DynamoDB Tables', () => {
    test('should create eTrucky-Brokers table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Brokers',
      });
    });

    test('should create eTrucky-Users table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Users',
      });
    });

    test('should create eTrucky-Trucks table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trucks',
      });
    });

    test('should create eTrucky-Trailers table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trailers',
      });
    });

    test('should create eTrucky-Trips table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trips',
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

    test('should enable DynamoDB streams on eTrucky-Trips table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trips',
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });

    test('should have eTrucky Architecture tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          {
            Key: 'Architecture',
            Value: 'eTrucky',
          },
        ]),
      });
    });
  });

  describe('Global Secondary Indexes - eTrucky Tables', () => {
    test('eTrucky-Trucks should have GSI1 for carrier queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trucks',
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

    test('eTrucky-Trucks should have GSI2 for owner queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trucks',
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

    test('eTrucky-Trailers should have GSI1 for carrier queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'eTrucky-Trailers',
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

    test('eTrucky-Trips should have five GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const tripsTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'eTrucky-Trips'
      ) as any;
      expect(tripsTable.Properties.GlobalSecondaryIndexes.length).toBe(5);
    });

    test('eTrucky-Users should have two GSIs', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      const usersTable = Object.values(tables).find((table: any) => 
        table.Properties.TableName === 'eTrucky-Users'
      ) as any;
      expect(usersTable.Properties.GlobalSecondaryIndexes.length).toBe(2);
    });
  });

  describe('Stack Outputs', () => {
    test('should export eTrucky-Brokers table name', () => {
      template.hasOutput('ETruckyBrokersTableName', {
        Description: 'eTrucky Brokers DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-ETruckyBrokersTableName-dev',
        },
      });
    });

    test('should export eTrucky-Trucks table name', () => {
      template.hasOutput('ETruckyTrucksTableName', {
        Description: 'eTrucky Trucks DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-ETruckyTrucksTableName-dev',
        },
      });
    });

    test('should export eTrucky-Trailers table name', () => {
      template.hasOutput('ETruckyTrailersTableName', {
        Description: 'eTrucky Trailers DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-ETruckyTrailersTableName-dev',
        },
      });
    });

    test('should export eTrucky-Trips table name', () => {
      template.hasOutput('ETruckyTripsTableName', {
        Description: 'eTrucky Trips DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-ETruckyTripsTableName-dev',
        },
      });
    });

    test('should export eTrucky-Users table name', () => {
      template.hasOutput('ETruckyUsersTableName', {
        Description: 'eTrucky Users DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-ETruckyUsersTableName-dev',
        },
      });
    });
  });

  describe('Resource Count', () => {
    test('should create five DynamoDB tables (eTrucky tables only)', () => {
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
