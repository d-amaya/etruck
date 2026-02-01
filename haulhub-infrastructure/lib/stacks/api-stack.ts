import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName } from '../config';
import * as path from 'path';

/**
 * ApiStack - API Gateway and Lambda integration for HaulHub Backend
 * 
 * This stack creates:
 * - Lambda function running NestJS application
 * - API Gateway REST API with Lambda integration
 * - CORS configuration for CloudFront
 * - CloudWatch logging
 * - IAM roles and permissions
 * 
 * Requirements: 17.1, 17.2, 17.5, 18.5
 */
export interface ApiStackProps extends HaulHubStackProps {
  userPoolId: string;
  userPoolArn: string;
  userPoolClientId: string;
  // eTrucky tables (new architecture)
  eTruckyBrokersTableName: string;
  eTruckyBrokersTableArn: string;
  eTruckyUsersTableName: string;
  eTruckyUsersTableArn: string;
  eTruckyTrucksTableName: string;
  eTruckyTrucksTableArn: string;
  eTruckyTrailersTableName: string;
  eTruckyTrailersTableArn: string;
  eTruckyTripsTableName: string;
  eTruckyTripsTableArn: string;
  documentsBucketName: string;
  documentsBucketArn: string;
  allowedOrigins?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Create Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: getResourceName('LambdaExecutionRole', props.environment),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for HaulHub backend Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB permissions for eTrucky tables
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
      ],
      resources: [
        props.eTruckyBrokersTableArn,
        props.eTruckyUsersTableArn,
        `${props.eTruckyUsersTableArn}/index/*`,
        props.eTruckyTrucksTableArn,
        `${props.eTruckyTrucksTableArn}/index/*`,
        props.eTruckyTrailersTableArn,
        `${props.eTruckyTrailersTableArn}/index/*`,
        props.eTruckyTripsTableArn,
        `${props.eTruckyTripsTableArn}/index/*`,
      ],
    }));

    // Grant S3 permissions for document storage
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
      ],
      resources: [
        `${props.documentsBucketArn}/*`,
      ],
    }));

    // Grant Cognito permissions
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:ListUsers',
        'cognito-idp:AdminInitiateAuth',
      ],
      resources: [props.userPoolArn],
    }));

    // Create CloudWatch Log Group for Lambda
    const logGroup = new logs.LogGroup(this, 'BackendFunctionLogGroup', {
      logGroupName: `/aws/lambda/${getResourceName('BackendFunction', props.environment)}`,
      retention: props.config.enableDetailedMonitoring 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create Lambda function
    // Note: Lambda code should be built using './scripts/build-lambda.sh' before deployment
    // This creates a deployment package with compiled code and dependencies
    this.lambdaFunction = new lambda.Function(this, 'BackendFunction', {
      functionName: getResourceName('BackendFunction', props.environment),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../haulhub-backend/.lambda-package')),
      role: lambdaRole,
      memorySize: props.config.lambdaMemorySize,
      timeout: cdk.Duration.seconds(props.config.lambdaTimeout),
      environment: {
        NODE_ENV: props.environment,
        // Table names (pointing to eTrucky tables)
        TRIPS_TABLE_NAME: props.eTruckyTripsTableName,
        BROKERS_TABLE_NAME: props.eTruckyBrokersTableName,
        LORRIES_TABLE_NAME: props.eTruckyTrucksTableName,
        TRAILERS_TABLE_NAME: props.eTruckyTrailersTableName,
        USERS_TABLE_NAME: props.eTruckyUsersTableName,
        // AWS Services
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        DOCUMENTS_BUCKET_NAME: props.documentsBucketName,
        ALLOWED_ORIGINS: this.getAllowedOrigins(props).join(','),
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      description: 'HaulHub Backend API (NestJS)',
      logGroup: logGroup,
    });

    // Add tags
    cdk.Tags.of(this.lambdaFunction).add('Component', 'Backend');

    // Create API Gateway REST API
    this.api = new apigateway.RestApi(this, 'RestApi', {
      restApiName: getResourceName('RestApi', props.environment),
      description: 'HaulHub Backend REST API',
      
      // Deploy options
      deployOptions: {
        stageName: props.environment,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: props.config.enableDetailedMonitoring 
          ? apigateway.MethodLoggingLevel.INFO 
          : apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: props.config.enableDetailedMonitoring,
        metricsEnabled: true,
      },
      
      // CORS configuration
      defaultCorsPreflightOptions: {
        allowOrigins: this.getAllowedOrigins(props),
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },
      
      // CloudWatch role for logging
      cloudWatchRole: true,
      
      // Endpoint configuration (EDGE for global distribution)
      endpointConfiguration: {
        types: [apigateway.EndpointType.EDGE],
      },
    });

    // Add tags
    cdk.Tags.of(this.api).add('Component', 'API');

    // Create Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(this.lambdaFunction, {
      proxy: true,
      allowTestInvoke: true,
      timeout: cdk.Duration.seconds(29), // API Gateway max is 29 seconds
    });

    // Add proxy resource to handle all routes
    const proxyResource = this.api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${getResourceName('ApiUrl', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: `${getResourceName('ApiId', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${getResourceName('LambdaFunctionArn', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda Function Name',
      exportName: `${getResourceName('LambdaFunctionName', props.environment)}`,
    });
  }

  /**
   * Get allowed origins based on environment
   * Production includes custom domain, all environments include localhost for development
   */
  private getAllowedOrigins(props: ApiStackProps): string[] {
    const origins = [
      'http://localhost:4200',
      'https://localhost:4200',
      // Always include production domains for all environments
      'https://etrucky.com',
      'https://www.etrucky.com',
    ];

    // Add any additional origins from context/props
    if (props.allowedOrigins && props.allowedOrigins !== '*') {
      const additionalOrigins = props.allowedOrigins.split(',').map(o => o.trim());
      origins.push(...additionalOrigins);
    }

    return origins;
  }
}
