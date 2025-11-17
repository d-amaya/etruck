import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/stacks/storage-stack';
import { HaulHubStackProps } from '../lib/types';
import { getEnvironmentConfig } from '../lib/config';

describe('StorageStack', () => {
  let app: cdk.App;
  let stack: StorageStack;
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
    stack = new StorageStack(app, 'TestStorageStack', props);
    template = Template.fromStack(stack);
  });

  describe('Documents Bucket', () => {
    test('should create documents bucket with correct name', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
      });
    });

    test('should enable encryption at rest', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    test('should enable versioning', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('should block all public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('should configure CORS for document uploads', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
        CorsConfiguration: {
          CorsRules: [
            {
              AllowedMethods: Match.arrayWith(['GET', 'PUT', 'POST', 'HEAD']),
              AllowedOrigins: ['*'],
              AllowedHeaders: ['*'],
              ExposedHeaders: Match.arrayWith(['ETag']),
              MaxAge: 3000,
            },
          ],
        },
      });
    });

    test('should have lifecycle rules', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
            }),
          ]),
        },
      });
    });

    test('should have Component and Purpose tags', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Storage' },
          { Key: 'Purpose', Value: 'VerificationDocuments' },
        ]),
      });
    });
  });

  // Note: Frontend bucket is now in FrontendStack, not StorageStack

  describe('Stack Outputs', () => {
    test('should export Documents Bucket Name', () => {
      template.hasOutput('DocumentsBucketName', {
        Description: 'S3 Bucket Name for Verification Documents',
        Export: {
          Name: 'HaulHub-DocumentsBucketName-dev',
        },
      });
    });

    test('should export Documents Bucket ARN', () => {
      template.hasOutput('DocumentsBucketArn', {
        Description: 'S3 Bucket ARN for Verification Documents',
        Export: {
          Name: 'HaulHub-DocumentsBucketArn-dev',
        },
      });
    });
  });

  describe('Resource Count', () => {
    test('should create exactly one S3 bucket (documents only)', () => {
      template.resourceCountIs('AWS::S3::Bucket', 1);
    });

    test('should create bucket policy for auto-delete', () => {
      // In dev environment, auto-delete is enabled which creates custom resources
      template.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
    });
  });

  describe('Production Environment', () => {
    test('should set RETAIN removal policy for production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new StorageStack(prodApp, 'ProdStorageStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      // Documents bucket should have RETAIN policy
      const buckets = prodTemplate.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      
      expect(bucketKeys.length).toBe(1);
      bucketKeys.forEach(key => {
        expect(buckets[key].UpdateReplacePolicy).toBe('Retain');
        expect(buckets[key].DeletionPolicy).toBe('Retain');
      });
    });

    test('should set DESTROY removal policy for non-production', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      
      expect(bucketKeys.length).toBe(1);
      bucketKeys.forEach(key => {
        expect(buckets[key].UpdateReplacePolicy).toBe('Delete');
        expect(buckets[key].DeletionPolicy).toBe('Delete');
      });
    });

    test('should enable lifecycle transition to IA in production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new StorageStack(prodApp, 'ProdStorageStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-documents-prod',
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'TransitionToIA',
              Status: 'Enabled',
              Transitions: [
                {
                  StorageClass: 'STANDARD_IA',
                  TransitionInDays: 90,
                },
              ],
            }),
          ]),
        },
      });
    });

    test('should not enable auto-delete in production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new StorageStack(prodApp, 'ProdStorageStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      // No auto-delete custom resources in production
      prodTemplate.resourceCountIs('Custom::S3AutoDeleteObjects', 0);
    });
  });
});
