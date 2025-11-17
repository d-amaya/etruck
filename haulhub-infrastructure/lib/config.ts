import { EnvironmentConfig } from './types';

/**
 * Environment-specific configuration
 * 
 * This file contains configuration settings that vary by environment.
 * Adjust these values based on your deployment needs.
 */

export const getEnvironmentConfig = (environment: string): EnvironmentConfig => {
  const configs: Record<string, EnvironmentConfig> = {
    dev: {
      environment: 'dev',
      dynamoDbBillingMode: 'PAY_PER_REQUEST',
      lambdaMemorySize: 512,
      lambdaTimeout: 30,
      enableDetailedMonitoring: false,
      cloudFrontPriceClass: 'PriceClass_100', // North America and Europe only
      enableDynamoDbPitr: false,
      enableS3Versioning: true,
    },
    staging: {
      environment: 'staging',
      dynamoDbBillingMode: 'PAY_PER_REQUEST',
      lambdaMemorySize: 1024,
      lambdaTimeout: 30,
      enableDetailedMonitoring: true,
      cloudFrontPriceClass: 'PriceClass_100',
      enableDynamoDbPitr: true,
      enableS3Versioning: true,
    },
    prod: {
      environment: 'prod',
      dynamoDbBillingMode: 'PAY_PER_REQUEST',
      lambdaMemorySize: 1024,
      lambdaTimeout: 30,
      enableDetailedMonitoring: true,
      cloudFrontPriceClass: 'PriceClass_All', // All edge locations
      enableDynamoDbPitr: true,
      enableS3Versioning: true,
    },
  };

  return configs[environment] || configs.dev;
};

/**
 * Common resource naming convention
 */
export const getResourceName = (
  resourceType: string,
  environment: string,
  suffix?: string
): string => {
  const parts = ['HaulHub', resourceType, environment];
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join('-');
};

/**
 * Get stack name with consistent naming convention
 */
export const getStackName = (stackType: string, environment: string): string => {
  return `HaulHub-${stackType}-${environment}`;
};
