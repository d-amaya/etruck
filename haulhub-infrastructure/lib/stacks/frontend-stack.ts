import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName } from '../config';

/**
 * FrontendStack - CloudFront Distribution and S3 Hosting for HaulHub Frontend
 * 
 * This stack creates:
 * - S3 bucket for frontend static files
 * - CloudFront distribution with S3 origin
 * - Origin Access Control (OAC) for secure S3 access
 * - Caching policies for static assets
 * - Custom error responses for SPA routing
 * - CloudFront distribution outputs
 */
export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly frontendBucket: s3.Bucket;
  public readonly certificate?: acm.Certificate;

  constructor(
    scope: Construct,
    id: string,
    props: HaulHubStackProps
  ) {
    super(scope, id, props);

    const config = props.config;

    // Create ACM Certificate for custom domain (production only)
    // Note: Certificate must be in us-east-1 region for CloudFront
    if (props.environment === 'prod') {
      this.certificate = new acm.Certificate(this, 'Certificate', {
        domainName: 'etrucky.com',
        subjectAlternativeNames: ['www.etrucky.com'],
        validation: acm.CertificateValidation.fromDns(),
      });

      // Output certificate ARN for reference
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: this.certificate.certificateArn,
        description: 'ACM Certificate ARN - Add DNS validation records from ACM console',
        exportName: `${getResourceName('CertificateArn', props.environment)}`,
      });
    }

    // Create frontend hosting bucket for Angular static files
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: getResourceName('frontend', props.environment).toLowerCase(),
      
      // Encryption at rest
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Versioning for rollback capability
      versioned: config.enableS3Versioning,
      
      // Block public access - CloudFront will access via OAI
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Deletion protection
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
    });

    // Create S3 origin with Origin Access Control (OAC)
    // This is the newer recommended approach instead of Origin Access Identity (OAI)
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.frontendBucket);

    // Define cache policy for static assets
    // Use shorter cache times for dev, longer for prod
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(
      this,
      'StaticAssetsCachePolicy',
      {
        cachePolicyName: getResourceName('StaticAssets', props.environment),
        comment: 'Cache policy for static assets (JS, CSS, images)',
        defaultTtl: props.environment === 'prod' 
          ? cdk.Duration.days(7) 
          : cdk.Duration.minutes(5),
        maxTtl: props.environment === 'prod' 
          ? cdk.Duration.days(365) 
          : cdk.Duration.hours(1),
        minTtl: cdk.Duration.seconds(0),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }
    );

    // Define cache policy for index.html (short TTL for SPA updates)
    const indexCachePolicy = new cloudfront.CachePolicy(
      this,
      'IndexCachePolicy',
      {
        cachePolicyName: getResourceName('Index', props.environment),
        comment: 'Cache policy for index.html with short TTL',
        defaultTtl: props.environment === 'prod'
          ? cdk.Duration.minutes(5)
          : cdk.Duration.seconds(0),
        maxTtl: props.environment === 'prod'
          ? cdk.Duration.hours(1)
          : cdk.Duration.minutes(5),
        minTtl: cdk.Duration.seconds(0),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }
    );

    // Create security headers policy for HTTPS enforcement
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: getResourceName('SecurityHeaders', props.environment),
        comment: 'Security headers including HSTS for HTTPS enforcement',
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(31536000), // 1 year
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: {
            override: true,
          },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
        },
      }
    );



    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `HaulHub Frontend Distribution - ${props.environment}`,
      
      // Custom domain configuration (production only)
      domainNames: props.environment === 'prod'
        ? ['etrucky.com', 'www.etrucky.com']
        : undefined,
      certificate: this.certificate,
      
      // S3 origin configuration
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: indexCachePolicy,
        responseHeadersPolicy: securityHeadersPolicy,
      },

      // Additional behaviors for static assets with longer cache
      additionalBehaviors: {
        '*.js': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.css': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.png': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.jpg': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.svg': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.ico': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.woff': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
        '*.woff2': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true,
        },
      },

      // Default root object
      defaultRootObject: 'index.html',

      // Custom error responses for SPA routing
      // All 403 and 404 errors redirect to index.html to support client-side routing
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],

      // Price class based on environment
      priceClass: this.getPriceClass(config.cloudFrontPriceClass),

      // Enable IPv6
      enableIpv6: true,

      // Enable logging for production
      enableLogging: props.environment === 'prod',
      logBucket: props.environment === 'prod' 
        ? new s3.Bucket(this, 'LogBucket', {
            bucketName: getResourceName('cloudfront-logs', props.environment).toLowerCase(),
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [
              {
                id: 'DeleteOldLogs',
                enabled: true,
                expiration: cdk.Duration.days(90),
              },
            ],
          })
        : undefined,
      logFilePrefix: 'cloudfront/',

      // SSL/TLS configuration (using CloudFront default certificate)
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

      // HTTP version
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // Add tags
    cdk.Tags.of(this.distribution).add('Component', 'Frontend');
    cdk.Tags.of(this.distribution).add('Purpose', 'CDN');

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 Bucket Name for Frontend Hosting',
      exportName: `${getResourceName('FrontendBucketName', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'FrontendBucketArn', {
      value: this.frontendBucket.bucketArn,
      description: 'S3 Bucket ARN for Frontend Hosting',
      exportName: `${getResourceName('FrontendBucketArn', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${getResourceName('DistributionId', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${getResourceName('DistributionDomain', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Frontend Application URL (CloudFront)',
    });

    // Output custom domain URL for production
    if (props.environment === 'prod') {
      new cdk.CfnOutput(this, 'CustomDomainUrl', {
        value: 'https://etrucky.com',
        description: 'Custom Domain URL (after DNS configuration)',
      });

      new cdk.CfnOutput(this, 'CustomDomainAlternate', {
        value: 'https://www.etrucky.com',
        description: 'Custom Domain Alternate URL',
      });
    }

    // Output deployment commands for convenience
    new cdk.CfnOutput(this, 'DeployCommand', {
      value: `aws s3 sync dist/ s3://${this.frontendBucket.bucketName}/ --delete --profile ${props.awsProfile}`,
      description: 'Command to deploy frontend to S3',
    });

    new cdk.CfnOutput(this, 'InvalidationCommand', {
      value: `aws cloudfront create-invalidation --distribution-id ${this.distribution.distributionId} --paths "/*" --profile ${props.awsProfile}`,
      description: 'Command to invalidate CloudFront cache',
    });
  }

  /**
   * Convert price class string to CloudFront PriceClass enum
   */
  private getPriceClass(priceClassString: string): cloudfront.PriceClass {
    const priceClassMap: Record<string, cloudfront.PriceClass> = {
      'PriceClass_100': cloudfront.PriceClass.PRICE_CLASS_100,
      'PriceClass_200': cloudfront.PriceClass.PRICE_CLASS_200,
      'PriceClass_All': cloudfront.PriceClass.PRICE_CLASS_ALL,
    };

    return priceClassMap[priceClassString] || cloudfront.PriceClass.PRICE_CLASS_100;
  }
}
