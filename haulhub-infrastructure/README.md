# HaulHub Infrastructure

AWS CDK infrastructure code for HaulHub transportation management system, written in TypeScript.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)
- [Stack Architecture](#stack-architecture)
- [Deployment Workflow](#deployment-workflow)
- [Auth Stack Details](#auth-stack-details)
- [Naming Conventions](#naming-conventions)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Overview

The HaulHub infrastructure uses AWS CDK to define and deploy all AWS resources in a reproducible, version-controlled manner. The infrastructure follows serverless architecture principles to minimize operational overhead and costs.

**Key Features:**
- Infrastructure as Code using AWS CDK with TypeScript
- Serverless architecture (Lambda, API Gateway, DynamoDB, S3)
- Environment-aware configuration (dev, staging, prod)
- Consistent resource naming and tagging
- Reusable constructs for common patterns
- Comprehensive testing with Jest

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with the `haul-hub` profile
- AWS CDK CLI installed globally: `npm install -g aws-cdk`
- Sufficient AWS permissions for resource creation

## Project Structure

```
haulhub-infrastructure/
├── bin/
│   └── haulhub.ts              # CDK app entry point
├── lib/
│   ├── constructs/             # Reusable CDK constructs
│   │   ├── base-construct.ts   # Base class with common functionality
│   │   └── index.ts            # Barrel export
│   ├── stacks/                 # CDK stack definitions
│   │   ├── auth-stack.ts       # Cognito authentication stack
│   │   └── index.ts            # Barrel export
│   ├── config.ts               # Environment-specific configuration
│   ├── types.ts                # TypeScript interfaces and types
│   └── index.ts                # Main library exports
├── test/                       # Jest tests
│   ├── auth-stack.test.ts      # Auth stack tests
│   └── config.test.ts          # Configuration tests
├── dist/                       # Compiled JavaScript output (gitignored)
├── cdk.out/                    # CDK CloudFormation output (gitignored)
├── cdk.json                    # CDK configuration
├── jest.config.js              # Jest test configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## Configuration

### AWS Profile

The infrastructure is configured to use the `haul-hub` AWS profile. Ensure your AWS credentials are configured:

```bash
aws configure --profile haul-hub
```

### Environment Configuration

Environment-specific settings are defined in `lib/config.ts`. Three environments are supported:

- **dev** - Development environment (default)
- **staging** - Staging environment
- **prod** - Production environment

To deploy to a specific environment:

```bash
npm run cdk deploy -- -c environment=staging
```

### Environment-Specific Settings

Each environment has customized settings:

**Development:**
- DynamoDB: On-demand billing
- Lambda: 512MB memory, 30s timeout
- Monitoring: Basic
- Backups: Disabled

**Staging:**
- DynamoDB: On-demand billing
- Lambda: 1024MB memory, 60s timeout
- Monitoring: Enhanced
- Backups: Enabled (7-day retention)

**Production:**
- DynamoDB: On-demand billing
- Lambda: 2048MB memory, 60s timeout
- Monitoring: Enhanced with alarms
- Backups: Enabled (30-day retention)
- CloudFront: Global edge locations

## Available Scripts

### Deployment Scripts

For deploying infrastructure, use the automated scripts in the root `scripts/` directory:

```bash
# From project root
./scripts/deploy-infrastructure.sh
```

See [../scripts/README.md](../scripts/README.md) and [../DEPLOYMENT.md](../DEPLOYMENT.md) for detailed deployment instructions.

### Development Scripts

#### Install Dependencies

```bash
npm install
```

#### Build TypeScript

```bash
npm run build
```

#### Watch Mode (Auto-rebuild)

```bash
npm run watch
```

#### Synthesize CloudFormation Templates

```bash
npm run synth
```

#### Run Tests

```bash
npm test
```

### Manual CDK Commands

For manual CDK operations:

#### Bootstrap CDK (One-time Setup)

```bash
npm run bootstrap
```

This creates the necessary S3 bucket and IAM roles for CDK deployments.

#### Deploy All Stacks

```bash
npm run deploy
```

#### Deploy Specific Stack

```bash
npx cdk deploy HaulHub-Auth-dev --profile haul-hub
```

#### Destroy All Stacks

```bash
npm run destroy
```

**Warning:** This will delete all resources. Use with caution!

## Stack Architecture

The HaulHub infrastructure is organized into the following stacks:

### 1. Auth Stack (✅ Implemented)

**Purpose:** User authentication and authorization

**Resources:**
- Cognito User Pool with email/password authentication
- User Pool Client for application access
- User Groups for role-based access control (Admin, Dispatcher, LorryOwner, Driver)
- Token configuration (1-hour access token, 1-year refresh token)

**Exports:**
- `UserPoolId`: Cognito User Pool ID
- `UserPoolArn`: Cognito User Pool ARN
- `UserPoolClientId`: Cognito User Pool Client ID
- `UserPoolDomain`: Cognito User Pool Domain URL

### 2. Database Stack (Planned)

**Purpose:** Data storage and retrieval

**Resources:**
- DynamoDB table with single-table design
- Global Secondary Indexes (GSIs) for access patterns
- Point-in-time recovery
- Encryption at rest

### 3. Storage Stack (Planned)

**Purpose:** Document and static file storage

**Resources:**
- S3 bucket for verification documents
- S3 bucket for frontend hosting
- Bucket policies and encryption
- Lifecycle policies

### 4. API Stack (✅ Implemented)

**Purpose:** Backend API and business logic

**Resources:**
- API Gateway REST API with HTTPS enforcement
- Lambda function running NestJS application
- Lambda execution role with DynamoDB, S3, and Cognito permissions
- CORS configuration for CloudFront
- CloudWatch logging and monitoring
- API Gateway throttling (1000 req/s rate limit, 2000 burst)

**Exports:**
- `ApiUrl`: API Gateway endpoint URL
- `ApiId`: API Gateway REST API ID
- `LambdaFunctionArn`: Lambda function ARN
- `LambdaFunctionName`: Lambda function name

### 5. Frontend Stack (Planned)

**Purpose:** Content delivery and hosting

**Resources:**
- CloudFront distribution
- SSL/TLS certificate
- Custom domain configuration
- Cache policies

## Deployment Workflow

### Initial Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Bootstrap CDK** (first time only):
   ```bash
   npm run bootstrap
   ```

4. **Synthesize templates**:
   ```bash
   npm run synth
   ```

5. **Deploy stacks**:
   ```bash
   npm run deploy
   ```

### Deploying to Different Environments

```bash
# Development (default)
npm run deploy

# Staging
npx cdk deploy --all -c environment=staging --profile haul-hub

# Production
npx cdk deploy --all -c environment=prod --profile haul-hub
```

### Updating Existing Stacks

```bash
# Update all stacks
npm run deploy

# Update specific stack
npx cdk deploy HaulHub-Auth-dev --profile haul-hub
```

## Auth Stack Details

### Features Implemented

✅ **Cognito User Pool**
- Sign-in method: Email and password
- Self sign-up enabled
- Email verification required
- Password policy: 8+ characters, uppercase, lowercase, numbers

✅ **Token Configuration**
- Access token: 1 hour expiration
- ID token: 1 hour expiration
- Refresh token: 1 year (365 days) expiration
- Token revocation enabled

✅ **User Groups (Roles)**
1. **Admin** (Precedence: 0) - System administrators
2. **Dispatcher** (Precedence: 1) - Manage transportation deals
3. **LorryOwner** (Precedence: 2) - Provide vehicles
4. **Driver** (Precedence: 3) - Operate lorries

✅ **Security Features**
- MFA: Optional (SMS and TOTP supported)
- Account recovery: Email only
- Prevent user existence errors: Enabled
- Authentication flows: User Password Auth and SRP Auth

### Deploy Auth Stack

```bash
# Development
npx cdk deploy HaulHub-Auth-dev --profile haul-hub

# Staging
npx cdk deploy HaulHub-Auth-staging --profile haul-hub -c environment=staging

# Production
npx cdk deploy HaulHub-Auth-prod --profile haul-hub -c environment=prod
```

### Auth Stack Outputs

After deployment, the following values are exported:

- `UserPoolId`: Use in backend for token validation
- `UserPoolArn`: Use for IAM policies
- `UserPoolClientId`: Use in backend for authentication
- `UserPoolDomain`: Use for hosted UI (if needed)

### JWT Claims Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "cognito:groups": ["Dispatcher"],
  "custom:role": "Dispatcher",
  "email_verified": true
}
```

## Naming Conventions

All resources follow a consistent naming pattern:

```
HaulHub-{ResourceType}-{Environment}-{Suffix}
```

**Examples:**
- `HaulHub-UserPool-dev`
- `HaulHub-Table-prod`
- `HaulHub-DocumentsBucket-staging`

## Tags

All resources are automatically tagged with:
- `Project: HaulHub`
- `Environment: dev|staging|prod`
- `ManagedBy: CDK`

## Base Constructs

The `BaseConstruct` class provides common functionality for all HaulHub constructs:

- **Consistent resource naming**: `createResourceName()`
- **Automatic tagging**: Applied to all resources
- **CloudFormation output creation**: `createOutput()`
- **Environment-aware configuration**: Access to environment config

**Example usage:**

```typescript
export class MyStack extends BaseConstruct {
  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    const bucketName = this.createResourceName('MyBucket');
    // Creates: HaulHub-MyBucket-dev

    this.createOutput('BucketName', bucketName);
    // Exports: HaulHub-MyStack-dev-BucketName
  }
}
```

## Testing

Comprehensive tests are included for all infrastructure components.

### Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:cov

# Watch mode
npm run test:watch
```

### Test Coverage

Current test coverage:
- ✅ Auth Stack: User Pool, Client, Groups, Outputs
- ✅ Configuration: Environment settings, resource naming
- ✅ All tests passing (15/15)

## Troubleshooting

### Issue: CDK Bootstrap Required

```
Error: This stack uses assets, so the toolkit stack must be deployed
```

**Solution**: Run `npx cdk bootstrap --profile haul-hub`

### Issue: Invalid AWS Profile

```
Error: Profile haul-hub not found
```

**Solution**: Configure AWS CLI with the haul-hub profile:
```bash
aws configure --profile haul-hub
```

### Issue: Insufficient Permissions

```
Error: User is not authorized to perform: cognito-idp:CreateUserPool
```

**Solution**: Ensure your AWS user/role has the necessary permissions:
- CloudFormation full access
- IAM role creation
- Service-specific permissions (Cognito, DynamoDB, S3, etc.)

### Issue: Stack Already Exists

```
Error: Stack HaulHub-Auth-dev already exists
```

**Solution**: Update the existing stack:
```bash
npx cdk deploy HaulHub-Auth-dev --profile haul-hub
```

Or destroy and recreate:
```bash
npx cdk destroy HaulHub-Auth-dev --profile haul-hub
npx cdk deploy HaulHub-Auth-dev --profile haul-hub
```

### Issue: TypeScript Compilation Errors

**Solution**: Run `npm run build` to see detailed error messages. Ensure all dependencies are installed.

## Build Structure

The infrastructure uses a clean build structure:

```
lib/, bin/    → TypeScript source files
dist/         → Compiled JavaScript output (gitignored)
cdk.out/      → CDK synthesis output (gitignored)
```

CDK uses `ts-node` to run TypeScript directly, so compilation is not required for CDK commands. The `dist/` folder is only needed for distribution/packaging.

## Cost Estimation

### Cognito (Auth Stack)
- First 50,000 MAUs: **Free**
- 50,001 - 100,000 MAUs: $0.0055 per MAU
- For a startup with minimal users, should be within free tier

### DynamoDB (Future)
- On-demand billing: Pay per request
- First 25 GB storage: Free tier
- Estimated: $1-10/month for low traffic

### Lambda (Future)
- First 1M requests/month: Free
- First 400,000 GB-seconds compute: Free
- Estimated: $0-5/month for low traffic

### S3 (Future)
- First 5 GB storage: Free tier
- First 20,000 GET requests: Free
- Estimated: $1-5/month

### CloudFront (Future)
- First 1 TB data transfer: $0.085/GB
- First 10M requests: $0.0075 per 10,000
- Estimated: $5-20/month

**Total Estimated Monthly Cost (Low Traffic):** $10-40/month

### API Stack Details

### Features Implemented

✅ **Lambda Function**
- Runtime: Node.js 20.x
- Handler: NestJS application via serverless-express
- Memory: 512MB (dev), 1024MB (staging/prod)
- Timeout: 30 seconds
- Environment variables: DynamoDB table, Cognito pool, S3 bucket
- Connection reuse enabled for performance

✅ **IAM Permissions**
- DynamoDB: Full CRUD access to table and GSIs
- S3: Read/write access to documents bucket
- Cognito: User management and authentication

✅ **API Gateway**
- Type: REST API with Edge-optimized endpoint
- CORS: Configured for CloudFront origin
- Throttling: 1000 requests/second, 2000 burst
- Logging: CloudWatch integration
- Proxy integration: All routes forwarded to Lambda

✅ **Security**
- HTTPS enforced
- CORS restricted to allowed origins
- IAM roles follow least privilege principle
- CloudWatch logging enabled

### Deploy API Stack

**Prerequisites:**
1. Auth Stack must be deployed first
2. Database Stack must be deployed first
3. Storage Stack must be deployed first
4. Backend must be built: `cd haulhub-backend && npm run build:lambda`

```bash
# Build backend
cd haulhub-backend
npm run build:lambda
cd ../haulhub-infrastructure

# Deploy API stack (development)
npx cdk deploy HaulHub-Api-dev --profile haul-hub

# Deploy all stacks in order
npx cdk deploy --all --profile haul-hub
```

### API Stack Outputs

After deployment, the following values are exported:

- `ApiUrl`: Use in frontend for API calls (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/dev/`)
- `ApiId`: API Gateway ID for CloudWatch logs
- `LambdaFunctionArn`: Lambda function ARN for monitoring
- `LambdaFunctionName`: Lambda function name for updates

### Testing the API

```bash
# Get API URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name HaulHub-Api-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text \
  --profile haul-hub)

# Test health endpoint (if implemented)
curl $API_URL/health

# Test authentication endpoint
curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## Next Steps

The following stacks will be implemented in subsequent tasks:

- [x] Auth Stack (Cognito)
- [x] Database Stack (DynamoDB)
- [x] Storage Stack (S3)
- [x] API Stack (API Gateway + Lambda)
- [ ] Frontend Stack (CloudFront)

## Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS CDK TypeScript Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)
- [HaulHub Design Document](../.kiro/specs/haulhub-transportation-management/design.md)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)

## License

ISC
