import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName, getEnvironmentConfig } from '../config';

/**
 * StorageStack - S3 Buckets for HaulHub Storage
 * 
 * This stack creates:
 * - Verification documents bucket with encryption and versioning
 * - Bucket policies to block public access for documents bucket
 * - CORS configuration for document uploads
 */
export class StorageStack extends cdk.Stack {
  public readonly documentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const config = getEnvironmentConfig(props.environment);

    // Create verification documents bucket
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: getResourceName('documents', props.environment).toLowerCase(),
      
      // Encryption at rest using AWS managed keys
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Enable versioning for document history and recovery
      versioned: config.enableS3Versioning,
      
      // Block all public access - documents are private
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // CORS configuration for presigned URL uploads from frontend
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // Will be restricted to CloudFront domain in production
          allowedHeaders: ['*'],
          exposedHeaders: [
            'ETag',
            'x-amz-server-side-encryption',
            'x-amz-request-id',
            'x-amz-id-2',
          ],
          maxAge: 3000,
        },
      ],
      
      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          enabled: props.environment === 'prod',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          id: 'DeleteOldVersions',
          enabled: config.enableS3Versioning,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],
      
      // Server access logging (for production)
      serverAccessLogsPrefix: props.environment === 'prod' ? 'access-logs/' : undefined,
      
      // Deletion protection
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
    });

    // Add tags to bucket
    cdk.Tags.of(this.documentsBucket).add('Component', 'Storage');
    cdk.Tags.of(this.documentsBucket).add('Purpose', 'VerificationDocuments');

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'S3 Bucket Name for Verification Documents',
      exportName: `${getResourceName('DocumentsBucketName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketArn', {
      value: this.documentsBucket.bucketArn,
      description: 'S3 Bucket ARN for Verification Documents',
      exportName: `${getResourceName('DocumentsBucketArn', props.environment)}`,
    });
  }
}
