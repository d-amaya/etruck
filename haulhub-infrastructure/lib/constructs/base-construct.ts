import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { getResourceName } from '../config';

/**
 * Base construct with common functionality for all HaulHub constructs
 * 
 * This provides reusable patterns and utilities for creating AWS resources
 * with consistent naming, tagging, and configuration.
 */
export abstract class BaseConstruct extends Construct {
  protected readonly environment: string;

  constructor(scope: Construct, id: string, environment: string) {
    super(scope, id);
    this.environment = environment;
  }

  /**
   * Generate a resource name following HaulHub naming conventions
   */
  protected getResourceName(resourceType: string, suffix?: string): string {
    return getResourceName(resourceType, this.environment, suffix);
  }

  /**
   * Add common tags to a construct
   */
  protected addCommonTags(construct: Construct, additionalTags?: Record<string, string>): void {
    cdk.Tags.of(construct).add('Project', 'HaulHub');
    cdk.Tags.of(construct).add('Environment', this.environment);
    cdk.Tags.of(construct).add('ManagedBy', 'CDK');

    if (additionalTags) {
      Object.entries(additionalTags).forEach(([key, value]) => {
        cdk.Tags.of(construct).add(key, value);
      });
    }
  }

  /**
   * Create a CloudFormation output with consistent naming
   */
  protected createOutput(
    id: string,
    value: string,
    description?: string,
    exportName?: string
  ): cdk.CfnOutput {
    return new cdk.CfnOutput(this, id, {
      value,
      description,
      exportName: exportName || `${this.getResourceName(id)}`,
    });
  }
}
