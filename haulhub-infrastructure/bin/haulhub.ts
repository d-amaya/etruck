#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HaulHubStackProps } from '../lib/types';

/**
 * HaulHub CDK Application Entry Point
 * 
 * This is the main entry point for the HaulHub infrastructure.
 * It creates the CDK app and will instantiate all required stacks.
 */

// Import stacks
import { AuthStack } from '../lib/stacks/auth-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { getEnvironmentConfig } from '../lib/config';

const app = new cdk.App();

// Get environment-specific configuration from CDK context
const environment = app.node.tryGetContext('environment') || 'dev';
const awsProfile = app.node.tryGetContext('awsProfile') || 'haul-hub';

// Get environment configuration
const config = getEnvironmentConfig(environment);

// Define common stack properties
const stackProps: HaulHubStackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  awsProfile,
  config,
  tags: {
    Project: 'HaulHub',
    Environment: environment,
    ManagedBy: 'CDK',
  },
};

// Add tags to the entire app
cdk.Tags.of(app).add('Project', 'HaulHub');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');

// Instantiate stacks
const authStack = new AuthStack(app, `HaulHub-Auth-${environment}`, stackProps);

const databaseStack = new DatabaseStack(app, `HaulHub-Database-${environment}`, stackProps);

const storageStack = new StorageStack(app, `HaulHub-Storage-${environment}`, stackProps);

// API Stack depends on Auth, Database, and Storage
const apiStack = new ApiStack(app, `HaulHub-Api-${environment}`, {
  ...stackProps,
  userPoolId: authStack.userPool.userPoolId,
  userPoolArn: authStack.userPool.userPoolArn,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  tripsTableName: databaseStack.tripsTable.tableName,
  tripsTableArn: databaseStack.tripsTable.tableArn,
  brokersTableName: databaseStack.brokersTable.tableName,
  brokersTableArn: databaseStack.brokersTable.tableArn,
  lorriesTableName: databaseStack.lorriesTable.tableName,
  lorriesTableArn: databaseStack.lorriesTable.tableArn,
  usersTableName: databaseStack.usersTable.tableName,
  usersTableArn: databaseStack.usersTable.tableArn,
  documentsBucketName: storageStack.documentsBucket.bucketName,
  documentsBucketArn: storageStack.documentsBucket.bucketArn,
  allowedOrigins: app.node.tryGetContext('allowedOrigins') || '*',
});

// Add dependencies
apiStack.addDependency(authStack);
apiStack.addDependency(databaseStack);
apiStack.addDependency(storageStack);

// Frontend Stack (CloudFront and S3)
const frontendStack = new FrontendStack(app, `HaulHub-Frontend-${environment}`, stackProps);

// Synthesize the app
app.synth();
