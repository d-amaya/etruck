# HaulHub Transportation Management System

A serverless web application for managing transportation logistics between Dispatchers, Lorry Owners, and Drivers.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Installation](#installation)
- [Building](#building)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)

---

## Overview

HaulHub is a transportation management system designed for the US logistics industry. The system facilitates coordination between:

- **Dispatchers**: Manage transportation deals from brokers, assign drivers and lorries
- **Lorry Owners**: Register vehicles, track trips involving their lorries
- **Drivers**: View assigned trips and track earnings
- **Admins**: Verify users, approve lorry registrations, manage broker lists

The application is built using AWS serverless architecture to minimize operational overhead while maintaining scalability.

---

## Project Structure

This is a monorepo containing four main packages:

```
haulhub/
├── haulhub-shared/           # Shared TypeScript types, interfaces, and DTOs
├── haulhub-backend/          # NestJS backend API (AWS Lambda)
├── haulhub-frontend/         # Angular frontend application
├── haulhub-infrastructure/   # AWS CDK infrastructure code
├── scripts/                  # Deployment and development scripts
├── package.json              # Root workspace configuration
└── README.md                 # This file
```

### Shared Package

The `shared` package contains TypeScript definitions used across all packages:

- **Enums**: UserRole, TripStatus, LorryVerificationStatus, VerificationStatus
- **Interfaces**: User, Trip, Lorry, Broker, DocumentMetadata
- **DTOs**: Request/response objects for API endpoints

Import shared types:
```typescript
import { UserRole, Trip, CreateTripDto } from '@haulhub/shared';
```

---

## Technology Stack

- **Frontend**: Angular 17+ with TypeScript, Angular Material
- **Backend**: NestJS with TypeScript, AWS Lambda
- **Infrastructure**: AWS CDK with TypeScript
- **Cloud Services**: 
  - AWS Cognito (Authentication)
  - AWS API Gateway (REST API)
  - AWS Lambda (Serverless compute)
  - AWS DynamoDB (NoSQL database)
  - AWS S3 (Document storage, frontend hosting)
  - AWS CloudFront (CDN)
- **Shared**: TypeScript interfaces, enums, and DTOs

---

## Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **AWS CLI** - [Installation Guide](https://aws.amazon.com/cli/)
- **AWS CDK CLI** - Install globally: `npm install -g aws-cdk`
- **Git** - For version control

### Verify Installation

```bash
node --version    # Should be 18.x or higher
npm --version
aws --version
cdk --version
```

### AWS Profile Configuration

This project uses the `haul-hub` AWS profile. Configure it:

```bash
aws configure --profile haul-hub
```

You'll be prompted for:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (use `us-east-1`)
- Default output format (use `json`)

Verify configuration:
```bash
aws sts get-caller-identity --profile haul-hub
```

---

## Installation

### Initial Setup

Install all dependencies for all packages:

```bash
npm install
```

This uses npm workspaces to:
1. Install all dependencies for all workspaces
2. Hoist shared dependencies to the root `node_modules`
3. Create symlinks for workspace packages

### Installing in a Specific Workspace

```bash
# From root
npm install <package> --workspace=haulhub-backend

# Or from within the workspace directory
cd haulhub-backend
npm install <package>
```

---

## Building

### Build All Packages

```bash
npm run build:all
```

### Build Individual Packages

```bash
npm run build:shared          # Build shared types (must be built first)
npm run build:backend         # Build backend
npm run build:frontend        # Build frontend
npm run build:infrastructure  # Build infrastructure
```

### Build Order

Always build in this order:
1. **haulhub-shared** - Must be built first as other packages depend on it
2. **haulhub-backend** - Backend API
3. **haulhub-frontend** - Angular application
4. **haulhub-infrastructure** - AWS CDK stacks

### Cleaning and Rebuilding

```bash
# Full clean (removes node_modules, lock files, build outputs)
npm run clean

# Fresh install and build
npm run fresh

# Rebuild only (clean build outputs and rebuild)
npm run rebuild

# Granular clean commands
npm run clean:deps    # Remove only node_modules
npm run clean:locks   # Remove only package-lock.json files
npm run clean:build   # Remove only build outputs
```

---

## Development

### Backend Development

Start the backend in development mode with hot-reload:

```bash
cd haulhub-backend
npm run start:dev
# Runs on http://localhost:3000
```

Or use the script:
```bash
./scripts/dev-backend.sh
```

### Frontend Development

Start the frontend in development mode with hot-reload:

```bash
cd haulhub-frontend
npm start
# Runs on http://localhost:4200
```

Or use the script:
```bash
./scripts/dev-frontend.sh
```

### Running Both Simultaneously

Open two terminal windows:

**Terminal 1** (Backend):
```bash
./scripts/dev-backend.sh
```

**Terminal 2** (Frontend):
```bash
./scripts/dev-frontend.sh
```

### Environment Variables

#### Backend (.env)

Create `haulhub-backend/.env`:

```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
DYNAMODB_TABLE_NAME=HaulHub
S3_DOCUMENTS_BUCKET_NAME=haulhub-documents-dev-XXXXXXXXXX
ALLOWED_ORIGINS=https://your-cloudfront-domain.cloudfront.net
NODE_ENV=development
PORT=3000
```

#### Frontend (environment.ts)

Update `haulhub-frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  cognitoUserPoolId: 'us-east-1_XXXXXXXXX',
  cognitoClientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  region: 'us-east-1'
};
```

---

## Testing

### Run All Tests

```bash
# Backend tests
cd haulhub-backend
npm test

# Frontend tests
cd haulhub-frontend
npm test

# Infrastructure tests
cd haulhub-infrastructure
npm test
```

### Test Coverage

```bash
# Backend coverage
cd haulhub-backend
npm run test:cov

# Frontend coverage
cd haulhub-frontend
npm run test:coverage
```

---

## Deployment

HaulHub provides automated deployment scripts for easy deployment to AWS.

### Quick Start Deployment

```bash
# 1. Deploy infrastructure (Cognito, DynamoDB, S3, API Gateway, Lambda, CloudFront)
./scripts/deploy-infrastructure.sh

# 2. Deploy backend (NestJS API to Lambda)
./scripts/deploy-backend.sh

# 3. Deploy frontend (Angular app to S3 + CloudFront)
./scripts/deploy-frontend.sh
```

### Initial Deployment Steps

#### Step 1: Install Dependencies

```bash
npm install
npm run build:all
```

#### Step 2: Deploy Infrastructure

```bash
./scripts/deploy-infrastructure.sh
```

Or manually:

```bash
cd haulhub-infrastructure
npm install
npm run build
npx cdk bootstrap --profile haul-hub
npx cdk deploy --all --profile haul-hub --require-approval never
```

**Expected Duration**: 10-15 minutes

**Outputs**: After deployment, note the following values:
- Cognito User Pool ID
- Cognito Client ID
- API Gateway URL
- S3 Bucket Names
- CloudFront Distribution ID

#### Step 3: Update Environment Variables

Update the `.env` files with the values from Step 2.

#### Step 4: Deploy Backend

```bash
./scripts/deploy-backend.sh
```

**Expected Duration**: 3-5 minutes

#### Step 5: Seed Initial Data

```bash
cd haulhub-backend
npm run seed:brokers
```

#### Step 6: Deploy Frontend

```bash
./scripts/deploy-frontend.sh
```

**Expected Duration**: 5-10 minutes (including CloudFront invalidation)

#### Step 7: Verify Deployment

1. **Test API**: 
   ```bash
   curl https://your-api-url.execute-api.us-east-1.amazonaws.com/dev/health
   ```

2. **Access Frontend**: 
   Open `https://your-cloudfront-domain.cloudfront.net` in a browser

3. **Register Test User**:
   - Navigate to registration page
   - Create a test account
   - Verify email
   - Log in

### Updating Deployments

```bash
# Update backend only
./scripts/deploy-backend.sh

# Update frontend only
./scripts/deploy-frontend.sh

# Update infrastructure
cd haulhub-infrastructure
npx cdk deploy --all --profile haul-hub
```

### Deployment Scripts

#### Infrastructure Deployment

```bash
./scripts/deploy-infrastructure.sh
```

**Environment Variables**:
- `AWS_PROFILE`: AWS profile to use (default: `haul-hub`)
- `ENVIRONMENT`: Deployment environment (default: `dev`)

**Example**:
```bash
AWS_PROFILE=haul-hub ENVIRONMENT=staging ./scripts/deploy-infrastructure.sh
```

#### Backend Deployment

```bash
./scripts/deploy-backend.sh
```

**What it does**:
1. Installs backend dependencies
2. Runs tests
3. Builds backend for Lambda
4. Deploys API stack with Lambda function

#### Frontend Deployment

```bash
./scripts/deploy-frontend.sh
```

**What it does**:
1. Installs frontend dependencies
2. Runs tests
3. Builds Angular app for production
4. Syncs files to S3
5. Invalidates CloudFront cache

### Rollback Procedures

#### Rollback Backend (Lambda)

```bash
# Find previous version
aws lambda list-versions-by-function \
  --function-name HaulHub-Lambda-dev \
  --profile haul-hub

# Update alias to previous version
aws lambda update-alias \
  --function-name HaulHub-Lambda-dev \
  --name live \
  --function-version <previous-version> \
  --profile haul-hub
```

#### Rollback Frontend (S3)

```bash
# List object versions
aws s3api list-object-versions \
  --bucket your-bucket-name \
  --prefix index.html \
  --profile haul-hub

# Restore previous version
aws s3api copy-object \
  --bucket your-bucket-name \
  --copy-source your-bucket-name/index.html?versionId=<version-id> \
  --key index.html \
  --profile haul-hub

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*" \
  --profile haul-hub
```

### Monitoring and Logs

#### CloudWatch Logs

```bash
# Backend logs
aws logs tail /aws/lambda/HaulHub-Lambda-dev \
  --follow \
  --profile haul-hub

# API Gateway logs
aws logs tail /aws/apigateway/HaulHub-Api-dev \
  --follow \
  --profile haul-hub
```

---

## API Documentation

### Authentication

HaulHub uses JWT (JSON Web Token) authentication via AWS Cognito.

**Token Types**:
1. **Access Token**: Short-lived (1 hour), used for API requests
2. **Refresh Token**: Long-lived (1 year), used to obtain new access tokens

**Authorization Header**:
```
Authorization: Bearer <access-token>
```

### Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod`

### Authentication Flow

```
1. User registers → POST /auth/register
2. User verifies email (Cognito sends verification email)
3. User logs in → POST /auth/login → Receives access + refresh tokens
4. User makes API requests with access token
5. Access token expires after 1 hour
6. Frontend automatically refreshes → POST /auth/refresh
7. User logs out → POST /auth/logout
```

### Error Responses

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/trips"
}
```

### HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `500 Internal Server Error` - Server error

### API Endpoints

#### Auth Endpoints

**POST /auth/register** - Register new user
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "role": "Dispatcher"
}
```

**POST /auth/login** - Login and get tokens
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**POST /auth/refresh** - Refresh access token
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**POST /auth/logout** - Logout

#### Trips Endpoints

**POST /trips** - Create trip (Dispatcher only)
**GET /trips** - Get trips (role-based filtering)
**GET /trips/:id** - Get trip details
**PATCH /trips/:id** - Update trip
**PATCH /trips/:id/status** - Update trip status
**GET /trips/reports/payments** - Get payment reports

#### Lorries Endpoints

**POST /lorries** - Register lorry (Lorry Owner only)
**GET /lorries** - Get lorries
**POST /lorries/:id/documents** - Upload document
**GET /lorries/:id/documents/:docId** - View document

#### Users Endpoints

**GET /users/profile** - Get current user profile
**PATCH /users/profile** - Update user profile

#### Admin Endpoints

**GET /admin/lorries/pending** - Get pending lorries
**PATCH /admin/lorries/:id/verify** - Verify lorry
**GET /admin/users/pending** - Get pending users
**PATCH /admin/users/:id/verify** - Verify user

#### Brokers Endpoints

**GET /brokers** - Get all brokers
**POST /brokers** - Create broker (Admin only)
**PATCH /brokers/:id** - Update broker (Admin only)
**DELETE /brokers/:id** - Delete broker (Admin only)

For complete API documentation with request/response examples, see [haulhub-backend/README.md](./haulhub-backend/README.md).

### Testing the API

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","fullName":"Test User","phoneNumber":"+1234567890","role":"Dispatcher"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Get trips (with token)
curl -X GET http://localhost:3000/trips \
  -H "Authorization: Bearer <access-token>"
```

---

## Troubleshooting

### CDK Bootstrap Failed

**Error**: `This stack uses assets, so the toolkit stack must be deployed`

**Solution**:
```bash
cd haulhub-infrastructure
npx cdk bootstrap --profile haul-hub
```

### Lambda Deployment Failed

**Error**: `Code size exceeds maximum allowed`

**Solution**: Optimize dependencies
```bash
cd haulhub-backend
npm prune --production
npm run build
```

### CloudFront Invalidation Timeout

Invalidation can take 10-15 minutes. Check status:
```bash
aws cloudfront get-invalidation \
  --distribution-id YOUR_DIST_ID \
  --id INVALIDATION_ID \
  --profile haul-hub
```

### CORS Errors

**Error**: `Access-Control-Allow-Origin` header missing

**Solution**: Update API Gateway CORS configuration:
```bash
cd haulhub-infrastructure
# Update CORS settings in api-stack.ts
npx cdk deploy HaulHub-Api-dev --profile haul-hub
```

### Duplicate Dependencies

If you encounter issues with duplicate dependencies:

```bash
npm run clean
npm install
npm run build:all
```

### Build Errors

If you get build errors:

```bash
# Ensure shared package is built first
npm run build:shared

# Clean and rebuild
npm run rebuild
```

### Common Workflows

**After pulling from git:**
```bash
npm install
npm run build:all
```

**After code changes:**
```bash
npm run rebuild
```

**Fixing dependency issues:**
```bash
npm run fresh
```

---

## Best Practices

1. **Always install from root** for initial setup
2. **Keep dependency versions aligned** across workspaces
3. **Build shared package first** before building dependent packages
4. **Use workspace scripts** from root for consistency
5. **Commit package-lock.json** to ensure reproducible builds
6. **Don't commit node_modules** or dist directories
7. **Run tests before committing** changes

---

## Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Angular Documentation](https://angular.io/docs)
- [HaulHub Design Document](.kiro/specs/haulhub-transportation-management/design.md)

---

## License

ISC

---

**Last Updated**: 2024-01-01
**Version**: 1.0.0
