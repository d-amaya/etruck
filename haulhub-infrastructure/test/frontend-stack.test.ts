import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { HaulHubStackProps } from '../lib/types';
import { getEnvironmentConfig } from '../lib/config';

describe('FrontendStack', () => {
  let app: cdk.App;
  let stack: FrontendStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    
    const config = getEnvironmentConfig('dev');
    
    // Create the FrontendStack
    stack = new FrontendStack(app, 'TestFrontendStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
      environment: 'dev',
      awsProfile: 'haul-hub',
      config,
    });
    
    template = Template.fromStack(stack);
  });

  describe('S3 Frontend Bucket', () => {
    test('should create frontend bucket', () => {
      template.resourceCountIs('AWS::S3::Bucket', 1);
    });

    test('should have correct bucket name', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-frontend-dev',
      });
    });

    test('should enable encryption', () => {
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

    test('should block all public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('should enable versioning', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });
  });

  describe('CloudFront Distribution', () => {
    test('should create CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    test('should configure HTTPS redirect', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        },
      });
    });

    test('should set default root object to index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultRootObject: 'index.html',
        },
      });
    });

    test('should enable compression', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            Compress: true,
          },
        },
      });
    });

    test('should enable IPv6', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          IPV6Enabled: true,
        },
      });
    });

    test('should use HTTP/2 and HTTP/3', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          HttpVersion: 'http2and3',
        },
      });
    });

    test.skip('should use TLS 1.2 minimum when certificate is provided', () => {
      // When no custom certificate is provided, CloudFront uses default certificate
      // TLS minimum is only set when using a custom certificate
      const customApp = new cdk.App();
      const customConfig = getEnvironmentConfig('dev');
      
      const customStack = new FrontendStack(customApp, 'CustomCertStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'dev',
        awsProfile: 'haul-hub',
        config: customConfig,
        // Domain configuration removed - using CloudFront default domain
        // certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        // domainName: 'app.haulhub.com',
      });
      const customTemplate = Template.fromStack(customStack);
      
      customTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            MinimumProtocolVersion: 'TLSv1.2_2021',
          },
        },
      });
    });

    test('should configure price class from config', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_100',
        },
      });
    });
  });

  describe('Origin Access Control', () => {
    test('should use Origin Access Control (OAC)', () => {
      // OAC is automatically created by S3BucketOrigin.withOriginAccessControl()
      // It's the newer recommended approach instead of OAI
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    });
  });

  describe('Cache Policies', () => {
    test('should create cache policy for static assets with dev settings', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          Name: 'HaulHub-StaticAssets-dev',
          Comment: 'Cache policy for static assets (JS, CSS, images)',
          DefaultTTL: 300, // 5 minutes in seconds for dev
          MaxTTL: 3600, // 1 hour in seconds for dev
          MinTTL: 0,
        },
      });
    });

    test('should create cache policy for index.html with dev settings', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          Name: 'HaulHub-Index-dev',
          Comment: 'Cache policy for index.html with short TTL',
          DefaultTTL: 0, // 0 seconds for dev (no cache)
          MaxTTL: 300, // 5 minutes in seconds for dev
          MinTTL: 0,
        },
      });
    });

    test('should enable Gzip and Brotli compression in cache policies', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          Name: 'HaulHub-StaticAssets-dev',
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingGzip: true,
            EnableAcceptEncodingBrotli: true,
          },
        },
      });
    });

    test('should create exactly two cache policies', () => {
      template.resourceCountIs('AWS::CloudFront::CachePolicy', 2);
    });
  });

  describe('Custom Error Responses', () => {
    test('should configure 403 error to redirect to index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            {
              ErrorCode: 403,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
              ErrorCachingMinTTL: 300,
            },
          ]),
        },
      });
    });

    test('should configure 404 error to redirect to index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            {
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
              ErrorCachingMinTTL: 300,
            },
          ]),
        },
      });
    });
  });

  describe('Additional Behaviors for Static Assets', () => {
    test('should configure behavior for JavaScript files', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CacheBehaviors: Match.arrayWith([
            Match.objectLike({
              PathPattern: '*.js',
              ViewerProtocolPolicy: 'redirect-to-https',
              Compress: true,
            }),
          ]),
        },
      });
    });

    test('should configure behavior for CSS files', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CacheBehaviors: Match.arrayWith([
            Match.objectLike({
              PathPattern: '*.css',
              ViewerProtocolPolicy: 'redirect-to-https',
              Compress: true,
            }),
          ]),
        },
      });
    });

    test('should configure behavior for image files', () => {
      const imagePatterns = ['*.png', '*.jpg', '*.svg', '*.ico'];
      imagePatterns.forEach(pattern => {
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
          DistributionConfig: {
            CacheBehaviors: Match.arrayWith([
              Match.objectLike({
                PathPattern: pattern,
                ViewerProtocolPolicy: 'redirect-to-https',
                Compress: true,
              }),
            ]),
          },
        });
      });
    });

    test('should configure behavior for font files', () => {
      const fontPatterns = ['*.woff', '*.woff2'];
      fontPatterns.forEach(pattern => {
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
          DistributionConfig: {
            CacheBehaviors: Match.arrayWith([
              Match.objectLike({
                PathPattern: pattern,
                ViewerProtocolPolicy: 'redirect-to-https',
                Compress: true,
              }),
            ]),
          },
        });
      });
    });
  });

  describe('Stack Outputs', () => {
    test('should export Frontend Bucket Name', () => {
      template.hasOutput('FrontendBucketName', {
        Description: 'S3 Bucket Name for Frontend Hosting',
        Export: {
          Name: 'HaulHub-FrontendBucketName-dev',
        },
      });
    });

    test('should export Frontend Bucket ARN', () => {
      template.hasOutput('FrontendBucketArn', {
        Description: 'S3 Bucket ARN for Frontend Hosting',
        Export: {
          Name: 'HaulHub-FrontendBucketArn-dev',
        },
      });
    });

    test('should export Distribution ID', () => {
      template.hasOutput('DistributionId', {
        Description: 'CloudFront Distribution ID',
        Export: {
          Name: 'HaulHub-DistributionId-dev',
        },
      });
    });

    test('should export Distribution Domain Name', () => {
      template.hasOutput('DistributionDomainName', {
        Description: 'CloudFront Distribution Domain Name',
        Export: {
          Name: 'HaulHub-DistributionDomain-dev',
        },
      });
    });

    test('should output Frontend URL', () => {
      template.hasOutput('FrontendUrl', {
        Description: 'Frontend Application URL',
      });
    });

    test('should output deploy command', () => {
      template.hasOutput('DeployCommand', {
        Description: 'Command to deploy frontend to S3',
      });
    });

    test('should output invalidation command', () => {
      template.hasOutput('InvalidationCommand', {
        Description: 'Command to invalidate CloudFront cache',
      });
    });
  });

  describe('Tags', () => {
    test('should have Component and Purpose tags', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Frontend' },
          { Key: 'Purpose', Value: 'CDN' },
        ]),
      });
    });
  });

  describe('Production Environment', () => {
    test('should enable logging in production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      
      const prodStack = new FrontendStack(prodApp, 'ProdFrontendStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Logging: Match.objectLike({
            Prefix: 'cloudfront/',
          }),
        },
      });
    });

    test('should use PriceClass_All in production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      
      const prodStack = new FrontendStack(prodApp, 'ProdFrontendStack2', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_All',
        },
      });
    });

    test('should create log bucket in production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      
      const prodStack = new FrontendStack(prodApp, 'ProdFrontendStack3', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      // Log bucket should be created
      prodTemplate.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'haulhub-cloudfront-logs-prod',
      });
    });

    test('should not enable logging in dev environment', () => {
      // Dev template should not have logging configuration
      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const distributionKeys = Object.keys(distributions);
      
      expect(distributionKeys.length).toBe(1);
      distributionKeys.forEach(key => {
        const logging = distributions[key].Properties?.DistributionConfig?.Logging;
        expect(logging).toBeUndefined();
      });
    });
  });

  describe('Custom Domain Configuration', () => {
    test.skip('should configure custom domain when provided', () => {
      const customApp = new cdk.App();
      const customConfig = getEnvironmentConfig('dev');
      
      const customStack = new FrontendStack(customApp, 'CustomFrontendStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'dev',
        awsProfile: 'haul-hub',
        config: customConfig,
        // Domain configuration removed - using CloudFront default domain
        // domainName: 'app.haulhub.com',
        // certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });
      const customTemplate = Template.fromStack(customStack);

      customTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['app.haulhub.com'],
        },
      });
    });

    test('should not configure custom domain when not provided', () => {
      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const distributionKeys = Object.keys(distributions);
      
      expect(distributionKeys.length).toBe(1);
      distributionKeys.forEach(key => {
        const aliases = distributions[key].Properties?.DistributionConfig?.Aliases;
        expect(aliases).toBeUndefined();
      });
    });
  });

  describe('Resource Count', () => {
    test('should create expected number of resources', () => {
      template.resourceCountIs('AWS::S3::Bucket', 1); // Frontend bucket (log bucket only in prod)
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
      template.resourceCountIs('AWS::CloudFront::CachePolicy', 2);
    });
  });
});
