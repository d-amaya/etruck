import * as cdk from 'aws-cdk-lib';

/**
 * Extended stack properties for HaulHub stacks
 * Includes environment-specific configuration and common settings
 */
export interface HaulHubStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * AWS profile to use for deployment
   */
  awsProfile: string;

  /**
   * Environment-specific configuration
   */
  config: EnvironmentConfig;
}

/**
 * Configuration for environment-specific settings
 */
export interface EnvironmentConfig {
  /**
   * Environment name
   */
  environment: string;

  /**
   * DynamoDB billing mode
   */
  dynamoDbBillingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';

  /**
   * Lambda memory size in MB
   */
  lambdaMemorySize: number;

  /**
   * Lambda timeout in seconds
   */
  lambdaTimeout: number;

  /**
   * Enable CloudWatch detailed monitoring
   */
  enableDetailedMonitoring: boolean;

  /**
   * CloudFront price class
   */
  cloudFrontPriceClass: string;

  /**
   * Enable DynamoDB point-in-time recovery
   */
  enableDynamoDbPitr: boolean;

  /**
   * S3 bucket versioning enabled
   */
  enableS3Versioning: boolean;
}
