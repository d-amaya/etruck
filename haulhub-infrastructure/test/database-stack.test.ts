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

  describe('DynamoDB Table', () => {
    test('should create a DynamoDB table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'HaulHub-Table-dev',
      });
    });

    test('should configure single table design with PK and SK', () => {
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

    test('should enable DynamoDB streams', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });

    test('should configure TTL attribute', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true,
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
    test('should create GSI1 for driver trip queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
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

    test('should create GSI2 for lorry trip queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
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

    test('should create GSI3 for lorry verification status queries', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
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

    test('should define all GSI attributes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
          { AttributeName: 'GSI3PK', AttributeType: 'S' },
          { AttributeName: 'GSI3SK', AttributeType: 'S' },
        ]),
      });
    });

    test('should create exactly four GSIs', () => {
      const table = template.findResources('AWS::DynamoDB::Table');
      const tableResource = Object.values(table)[0] as any;
      expect(tableResource.Properties.GlobalSecondaryIndexes.length).toBe(4);
    });
  });

  describe('Stack Outputs', () => {
    test('should export table name', () => {
      template.hasOutput('TableName', {
        Description: 'DynamoDB Table Name',
        Export: {
          Name: 'HaulHub-TableName-dev',
        },
      });
    });

    test('should export table ARN', () => {
      template.hasOutput('TableArn', {
        Description: 'DynamoDB Table ARN',
        Export: {
          Name: 'HaulHub-TableArn-dev',
        },
      });
    });

    test('should output table stream ARN', () => {
      template.hasOutput('TableStreamArn', {
        Description: 'DynamoDB Table Stream ARN',
      });
    });

    test('should output GSI1 index name', () => {
      template.hasOutput('GSI1IndexName', {
        Description: 'GSI1 Index Name (Driver Trip Queries)',
      });
    });

    test('should output GSI2 index name', () => {
      template.hasOutput('GSI2IndexName', {
        Description: 'GSI2 Index Name (Lorry Trip Queries)',
      });
    });

    test('should output GSI3 index name', () => {
      template.hasOutput('GSI3IndexName', {
        Description: 'GSI3 Index Name (Lorry Verification Status Queries)',
      });
    });
  });

  describe('Resource Count', () => {
    test('should create five DynamoDB tables (main + 4 dedicated tables)', () => {
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
