# HaulHub Transportation Management System

A serverless web application for managing transportation logistics between Dispatchers, Lorry Owners, and Drivers.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Configuration Files](#configuration-files)
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

## Configuration Files

HaulHub uses environment-specific configuration files that are excluded from git. These files contain your unique AWS resource URLs.

### `cdk.context.json` - Infrastructure Configuration

**Location**: `haulhub-infrastructure/cdk.context.json`

**Purpose**: Provides runtime configuration to CDK when deploying infrastructure.

**Contents**:
```json
{
  "environment": "dev",
  "awsProfile": "haul-hub",
  "allowedOrigins": "https://YOUR_CLOUDFRONT_URL.cloudfront.net"
}
```

**How it's used**: CDK reads this file and configures API Gateway CORS to only accept requests from your CloudFront distribution.

**Why excluded from git**: Each deployment has a unique CloudFront URL. Your URL: `d23ld7dtwui8dz.cloudfront.net`, someone else's: `abc123xyz.cloudfront.net`.

### `environment.prod.ts` - Frontend Configuration

**Location**: `haulhub-frontend/src/environments/environment.prod.ts`

**Purpose**: Tells your Angular frontend where to find your backend API in production.

**Contents**:
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev',
  apiBaseUrl: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev'
};
```

**How it's used**: Angular compiles this into your frontend code. All API calls use this URL.

**Why excluded from git**: Each deployment has a unique API Gateway URL.

### Two-Phase Deployment Pattern

**Why two deployments?** The first deployment creates resources and outputs URLs. The second deployment uses those URLs to secure CORS.

**Phase 1 - Initial Deployment**:
- Config files have placeholders
- CDK uses fallback: `allowedOrigins || '*'` (allow all origins - temporarily insecure)
- Infrastructure gets created
- CDK outputs your unique CloudFront and API Gateway URLs

**Phase 2 - Secure Deployment**:
- Update config files with actual URLs from Phase 1
- Redeploy API stack
- CORS now locked to your CloudFront URL only (secure)

This pattern solves the chicken-and-egg problem: you need the CloudFront URL to configure CORS, but CloudFront doesn't exist until you deploy.

---

## Getting Started

### Quick Start Checklist

For a brand new setup from scratch, follow these steps in order:

- [ ] Install prerequisites (Node.js 18+, AWS CLI, AWS CDK CLI)
- [ ] Create AWS account (if you don't have one)
- [ ] Create AWS access keys (see [AWS Profile Configuration](#aws-profile-configuration))
- [ ] Configure AWS CLI profile (`aws configure --profile haul-hub`)
- [ ] Clone repository
- [ ] Run `npm install` from root
- [ ] Create config files from templates
- [ ] Build shared package (`npm run build:shared`)
- [ ] Deploy infrastructure (`cd haulhub-infrastructure && npx cdk bootstrap && npx cdk deploy --all`)
- [ ] Save CDK outputs (User Pool ID, API URL, CloudFront URL, etc.)
- [ ] Update configuration files with actual values
- [ ] Build backend and frontend
- [ ] Deploy backend to Lambda
- [ ] Seed initial data (brokers)
- [ ] Deploy frontend to S3/CloudFront
- [ ] Verify deployment

**Estimated Total Time**: 30-45 minutes for first-time setup

### Prerequisites

- **Node.js 18+** and npm
- **AWS CLI** - [Installation Guide](https://aws.amazon.com/cli/)
- **AWS CDK CLI** - Install globally: `npm install -g aws-cdk`
- **Git** - For version control
- **AWS Account** with appropriate permissions (IAM, Lambda, DynamoDB, S3, CloudFront, Cognito, API Gateway)

### Verify Installation

```bash
node --version    # Should be 18.x or higher
npm --version     # Should be 8.x or higher
aws --version     # Should be 2.x
cdk --version     # Should be 2.x
```

### AWS Profile Configuration

This project uses the `haul-hub` AWS profile to manage AWS credentials locally.

#### Step 1: Create AWS Access Keys

If you have a brand new AWS account, you need to create access keys first:

**Option A: Using Root Account (Quick Start - Not Recommended for Production)**

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Click your account name (top right) → **Security credentials**
3. Scroll to **Access keys** section
4. Click **Create access key**
5. Choose **Command Line Interface (CLI)**
6. Check "I understand..." and click **Next**
7. (Optional) Add description tag: "HaulHub Development"
8. Click **Create access key**
9. **Important**: Download the `.csv` file or copy both keys immediately (you won't see the secret key again!)

**Option B: Using IAM User (Recommended for Production)**

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Go to **IAM** service
3. Click **Users** → **Create user**
4. Username: `haulhub-developer` (or your name)
5. Click **Next**
6. Select **Attach policies directly**
7. Add these policies:
   - `AdministratorAccess` (for full deployment access)
   - Or create custom policy with specific permissions
8. Click **Next** → **Create user**
9. Click on the created user
10. Go to **Security credentials** tab
11. Click **Create access key**
12. Choose **Command Line Interface (CLI)**
13. Check "I understand..." and click **Next**
14. Click **Create access key**
15. **Important**: Download the `.csv` file or copy both keys immediately!

#### Step 2: Configure AWS CLI Profile

Now configure the AWS CLI with your access keys:

```bash
aws configure --profile haul-hub
```

You'll be prompted for:
- **AWS Access Key ID**: Paste your access key (e.g., `AKIAIOSFODNN7EXAMPLE`)
- **AWS Secret Access Key**: Paste your secret key (e.g., `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)
- **Default region**: Enter `us-east-1` (recommended)
- **Default output format**: Enter `json`

#### Step 3: Verify Configuration

Test that your credentials work:

```bash
aws sts get-caller-identity --profile haul-hub
```

Expected output:
```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

If you see your account number, you're all set! ✅

#### Where Credentials Are Stored

Your credentials are stored locally in:
- **macOS/Linux**: `~/.aws/credentials` and `~/.aws/config`
- **Windows**: `C:\Users\USERNAME\.aws\credentials` and `C:\Users\USERNAME\.aws\config`

**Example `~/.aws/credentials`**:
```ini
[haul-hub]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Example `~/.aws/config`**:
```ini
[profile haul-hub]
region = us-east-1
output = json
```

#### Security Best Practices

- ⚠️ **Never commit** these files to git (they're in `.gitignore`)
- ⚠️ **Never share** your secret access key
- ✅ **Use IAM users** instead of root account for production
- ✅ **Enable MFA** (Multi-Factor Authentication) on your AWS account
- ✅ **Rotate keys** regularly (every 90 days)
- ✅ **Use least privilege** - only grant permissions you need

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

#### First Time Setup

Before running the backend locally for the first time, create your `.env` file:

```bash
cd haulhub-backend

# Copy the example file
cp .env.example .env

# Edit .env and fill in your actual values from CDK outputs
# You need: User Pool ID, Client ID, Table Names, S3 Bucket Name
```

**Quick way to get values**:
```bash
# Get Cognito User Pool ID
aws cognito-idp list-user-pools --max-results 10 --profile haul-hub --region us-east-1 --query 'UserPools[?Name==`HaulHub-UserPool-dev`].Id' --output text

# Get Cognito Client ID
aws cognito-idp list-user-pool-clients --user-pool-id YOUR_POOL_ID --profile haul-hub --region us-east-1 --query 'UserPoolClients[0].ClientId' --output text

# Get S3 Bucket Name
aws s3 ls --profile haul-hub | grep haulhub-documents-dev

# Table names are standard: HaulHub-TripsTable-dev, HaulHub-BrokersTable-dev, etc.
```

#### Running the Backend

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

**Important**: The local backend connects to your **actual AWS resources** (DynamoDB, S3, Cognito). Any data you create locally will be stored in your dev environment.

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

### Local vs Production

| Aspect | Local Development | Production |
|--------|------------------|------------|
| **Backend** | Runs on your machine (`localhost:3000`) | Runs on AWS Lambda |
| **Frontend** | Runs on your machine (`localhost:4200`) | Served from CloudFront |
| **Data** | Uses AWS dev environment (DynamoDB, S3) | Uses AWS dev environment |
| **Config** | `.env` file + `environment.ts` | Lambda env vars + `environment.prod.ts` |
| **CORS** | `http://localhost:4200` | Your CloudFront URL |
| **Hot Reload** | ✅ Yes (instant changes) | ❌ No (must redeploy) |
| **Debugging** | ✅ Easy (console, breakpoints) | ⚠️ Harder (CloudWatch logs) |

**Key Point**: Local development still uses your **real AWS resources**. Data created locally appears in your AWS DynamoDB tables.

### Environment Variables

Environment variables are configured differently for local development vs. production deployment.

#### Backend (.env) - Local Development

Create `haulhub-backend/.env` for local development:

```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
TRIPS_TABLE_NAME=HaulHub-TripsTable-dev
BROKERS_TABLE_NAME=HaulHub-BrokersTable-dev
LORRIES_TABLE_NAME=HaulHub-LorriesTable-dev
USERS_TABLE_NAME=HaulHub-UsersTable-dev
S3_DOCUMENTS_BUCKET_NAME=haulhub-documents-dev-XXXXXXXXXX
ALLOWED_ORIGINS=http://localhost:4200
NODE_ENV=development
PORT=3000
```

**Note**: Get these values from CDK deployment outputs (see Step 4 in Initial Deployment).

#### Backend - Production (Lambda)

For production, environment variables are set automatically by CDK in the Lambda function configuration. No `.env` file is needed in Lambda.

#### Frontend (environment.ts) - Local Development

Update `haulhub-frontend/src/environments/environment.ts` for local development:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000'
};
```

#### Frontend (environment.prod.ts) - Production

Create from template and update with actual values:

```bash
cp haulhub-frontend/src/environments/environment.prod.ts.template \
   haulhub-frontend/src/environments/environment.prod.ts
```

Then update with your API Gateway URL:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev',
  apiBaseUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev'
};
```

**Important**: The `environment.prod.ts` file is excluded from git. Each developer/environment needs their own copy.

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

#### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd HaulHub

# Install all dependencies
npm install
```

#### Step 2: Create Configuration Files from Templates

```bash
# Create CDK context file (leave placeholder values for now)
cp haulhub-infrastructure/cdk.context.json.template haulhub-infrastructure/cdk.context.json

# Create production environment file (leave placeholder values for now)
cp haulhub-frontend/src/environments/environment.prod.ts.template \
   haulhub-frontend/src/environments/environment.prod.ts
```

**Important Notes**:
- These files are excluded from git
- You can leave the placeholder values for the initial deployment
- The first deployment will use permissive CORS settings (`allowedOrigins: '*'`)
- After deployment, you'll update these files with actual values and redeploy to secure CORS

#### Step 3: Build Shared Package

The shared package must be built first as other packages depend on it:

```bash
npm run build:shared
```

#### Step 4: Deploy Infrastructure

```bash
cd haulhub-infrastructure
npm run build
npx cdk bootstrap --profile haul-hub
npx cdk deploy --all --profile haul-hub --require-approval never
```

**Expected Duration**: 10-15 minutes

**Important**: After deployment completes, CDK will output critical values. **Save these values**:

```
Outputs:
HaulHub-Auth-dev.UserPoolId = us-east-1_XXXXXXXXX
HaulHub-Auth-dev.UserPoolClientId = XXXXXXXXXXXXXXXXXXXXXXXXXX
HaulHub-Api-dev.ApiEndpoint = https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev
HaulHub-Storage-dev.DocumentsBucketName = haulhub-documents-dev-XXXXXXXXXX
HaulHub-Frontend-dev.CloudFrontURL = https://XXXXXXXXXXXXXX.cloudfront.net
HaulHub-Frontend-dev.FrontendBucketName = haulhub-frontend-dev-XXXXXXXXXX
HaulHub-Database-dev.TripsTableName = HaulHub-TripsTable-dev
HaulHub-Database-dev.BrokersTableName = HaulHub-BrokersTable-dev
HaulHub-Database-dev.LorriesTableName = HaulHub-LorriesTable-dev
HaulHub-Database-dev.UsersTableName = HaulHub-UsersTable-dev
```

#### Step 5: Update Configuration Files and Secure CORS

**Why this step is needed**: The initial deployment used `allowedOrigins: '*'` (allow all origins) because we didn't have the CloudFront URL yet. Now we need to lock down CORS to only allow requests from YOUR CloudFront distribution.

Using the outputs from Step 4, update your configuration files:

**A. Update `haulhub-infrastructure/cdk.context.json`:**
```json
{
  "environment": "dev",
  "awsProfile": "haul-hub",
  "allowedOrigins": "https://XXXXXXXXXXXXXX.cloudfront.net"
}
```

**B. Create `haulhub-backend/.env`:**
```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
TRIPS_TABLE_NAME=HaulHub-TripsTable-dev
BROKERS_TABLE_NAME=HaulHub-BrokersTable-dev
LORRIES_TABLE_NAME=HaulHub-LorriesTable-dev
USERS_TABLE_NAME=HaulHub-UsersTable-dev
S3_DOCUMENTS_BUCKET_NAME=haulhub-documents-dev-XXXXXXXXXX
ALLOWED_ORIGINS=https://XXXXXXXXXXXXXX.cloudfront.net
NODE_ENV=production
```

**C. Update `haulhub-frontend/src/environments/environment.prod.ts`:**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev',
  apiBaseUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev'
};
```

**D. Update `haulhub-frontend/src/environments/environment.ts` (for local development):**
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000'
};
```

#### Step 6: Redeploy API with Secured CORS

Now that you've updated `cdk.context.json` with your actual CloudFront URL, redeploy the API stack to secure CORS:

```bash
cd haulhub-infrastructure
npx cdk deploy HaulHub-Api-dev --profile haul-hub
```

**What this does**:
- Updates API Gateway CORS from `'*'` (allow all) to your specific CloudFront URL
- Updates Lambda environment variable `ALLOWED_ORIGINS`
- Secures your API so only YOUR frontend can call it

**Expected Duration**: 2-3 minutes

#### Step 7: Build Backend and Frontend

```bash
# Build backend
cd ../haulhub-backend
npm run build

# Build frontend
cd ../haulhub-frontend
npm run build
```

#### Step 8: Deploy Backend Code to Lambda

The Lambda function already exists from Step 4, but now we need to update it with the built backend code:

```bash
cd ../haulhub-infrastructure
npx cdk deploy HaulHub-Api-dev --profile haul-hub
```

**Expected Duration**: 2-3 minutes

**Note**: This is the second time deploying the API stack - first time was for CORS, this time is for the backend code.

#### Step 9: Seed Initial Data

Seed the brokers table with initial broker data (20 major US freight brokers):

```bash
cd scripts
./seed-brokers.sh
```

This will populate the `HaulHub-BrokersTable-dev` with 20 brokers including:
- C.H. Robinson
- XPO Logistics
- TQL (Total Quality Logistics)
- J.B. Hunt Transport Services
- And 16 more...

**Expected Duration**: 1-2 minutes

**What it does**:
- Checks if table exists
- Shows current broker count
- Adds 20 major US freight brokers
- Verifies seeded data

**Note**: You can also seed all tables at once with `./seed-all-tables.sh` which includes brokers, test users, lorries, and trips.

#### Step 10: Deploy Frontend to S3 and CloudFront

```bash
cd ../haulhub-frontend

# Sync built files to S3
aws s3 sync dist/haulhub-frontend/ s3://haulhub-frontend-dev-XXXXXXXXXX/ \
  --profile haul-hub \
  --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id XXXXXXXXXXXXXX \
  --paths "/*" \
  --profile haul-hub
```

**Expected Duration**: 5-10 minutes (including CloudFront invalidation)

**Note**: Get the Distribution ID from CloudFront console or from CDK outputs.

#### Step 11: Verify Deployment

1. **Test API Health**: 
   ```bash
   curl https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev/health
   ```
   
   Expected response:
   ```json
   {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
   ```

2. **Test Brokers Endpoint**:
   ```bash
   curl https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev/brokers
   ```
   
   Expected: List of brokers

3. **Access Frontend**: 
   Open `https://XXXXXXXXXXXXXX.cloudfront.net` in a browser

4. **Register Test User**:
   - Navigate to registration page
   - Create a test account (Dispatcher, Driver, or Lorry Owner)
   - Check email for verification link
   - Verify email
   - Log in and test functionality

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

### First-Time Setup Issues

#### Missing Configuration Files

**Error**: `Cannot find module 'environment.prod'` or CDK deployment fails

**Solution**: Create configuration files from templates:
```bash
cp haulhub-infrastructure/cdk.context.json.template haulhub-infrastructure/cdk.context.json
cp haulhub-frontend/src/environments/environment.prod.ts.template \
   haulhub-frontend/src/environments/environment.prod.ts
```

#### Shared Package Not Built

**Error**: `Cannot find module '@haulhub/shared'`

**Solution**: Build shared package first:
```bash
npm run build:shared
```

#### AWS Profile Not Configured

**Error**: `Unable to locate credentials` or `The config profile (haul-hub) could not be found`

**Solution**: Configure AWS profile:
```bash
aws configure --profile haul-hub
```

If you don't have AWS access keys yet, see [AWS Profile Configuration](#aws-profile-configuration) section for detailed instructions on creating them.

#### Invalid AWS Credentials

**Error**: `The security token included in the request is invalid`

**Possible causes**:
1. Access keys are incorrect
2. Access keys have been deleted or deactivated
3. IAM user has been deleted

**Solution**: 
1. Verify your access keys in AWS Console (IAM → Users → Security credentials)
2. If keys are invalid, create new ones and reconfigure:
   ```bash
   aws configure --profile haul-hub
   ```

#### Insufficient Permissions

**Error**: `User: arn:aws:iam::123456789012:user/username is not authorized to perform: [action]`

**Solution**: Your IAM user needs additional permissions. Add these policies in AWS Console:
- `AdministratorAccess` (for full access)
- Or specific policies: `AWSLambdaFullAccess`, `AmazonDynamoDBFullAccess`, `AmazonS3FullAccess`, etc.

#### Wrong AWS Profile

**Error**: Resources deploying to wrong account or region

**Solution**: Verify you're using the correct profile:
```bash
# Check current profile
aws sts get-caller-identity --profile haul-hub

# Ensure CDK uses correct profile
export AWS_PROFILE=haul-hub
cdk deploy --profile haul-hub
```

#### CDK Not Bootstrapped

**Error**: `This stack uses assets, so the toolkit stack must be deployed`

**Solution**: Bootstrap CDK:
```bash
cd haulhub-infrastructure
npx cdk bootstrap --profile haul-hub
```

#### Table Names Not Found

**Error**: `Cannot do operations on a non-existent table`

**Solution**: Ensure you're using the new table names in your `.env`:
```bash
TRIPS_TABLE_NAME=HaulHub-TripsTable-dev
BROKERS_TABLE_NAME=HaulHub-BrokersTable-dev
LORRIES_TABLE_NAME=HaulHub-LorriesTable-dev
USERS_TABLE_NAME=HaulHub-UsersTable-dev
```

Not the old single table name: ~~`DYNAMODB_TABLE_NAME=HaulHub`~~

#### Missing .env File

**Error**: `Cannot find module` or environment variables are undefined when running locally

**Solution**: Create `.env` file from example:
```bash
cd haulhub-backend
cp .env.example .env
# Then edit .env with your actual values
```

#### Local Backend Can't Connect to AWS

**Error**: `CredentialsProviderError` or `Unable to locate credentials`

**Possible causes**:
1. `.env` file doesn't exist
2. AWS credentials not configured
3. Wrong AWS profile

**Solution**:
```bash
# Verify AWS credentials work
aws sts get-caller-identity --profile haul-hub

# Ensure .env file exists
ls -la haulhub-backend/.env

# Check .env has correct values
cat haulhub-backend/.env
```

#### CORS Errors in Local Development

**Error**: `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution**: Ensure your backend `.env` has:
```bash
ALLOWED_ORIGINS=http://localhost:4200
```

And your frontend `environment.ts` points to local backend:
```typescript
apiUrl: 'http://localhost:3000'
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
