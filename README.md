# eTrucky Transportation Management System

A serverless web application for managing transportation logistics between Dispatchers, Truck Owners, and Drivers.

## Table of Contents

- [Overview](#overview)
- [eTrucky Migration (January 2026)](#etrucky-migration-january-2026)
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

eTrucky is a transportation management system designed for the US logistics industry. The system facilitates coordination between:

- **Dispatchers**: Manage transportation deals from brokers, assign drivers and trucks
- **Truck Owners**: Register vehicles, track trips involving their trucks
- **Drivers**: View assigned trips and track earnings
- **Admins**: Verify users, approve lorry registrations, manage broker lists

The application is built using AWS serverless architecture to minimize operational overhead while maintaining scalability.

---

## eTrucky Migration (January 2026)

### Migration Overview

The HaulHub application has been successfully migrated to the new **eTrucky carrier-centric architecture**. This migration introduces a hierarchical organizational structure where Carriers own and manage all assets (Users, Trucks, Trailers, Trips).

**Migration Status:** ✅ **COMPLETE** (All modules updated, all tests passing)

### Key Changes

#### 1. New Data Model
- **5 DynamoDB Tables**: eTrucky-Users, eTrucky-Trucks, eTrucky-Trailers, eTrucky-Trips, eTrucky-Brokers
- **Unified User Model**: All users (including carriers) stored in single eTrucky-Users table
- **UserId-Based Relationships**: Trips use userId references for all actors (dispatcher, driver, truck owner)
- **Carrier Hierarchy**: Carriers own and manage all assets within their organization

#### 2. Field Name Changes

**Trips:**
- `lorryId` → `truckId` (UUID)
- Added: `trailerId`, `truckOwnerId`, `carrierId`
- `pickupDate` + `pickupTime` → `scheduledTimestamp` (ISO 8601)
- Added: `pickupTimestamp`, `deliveryTimestamp` (ISO 8601)
- `distance` → `mileageOrder`
- Added: `mileageEmpty`, `mileageTotal`
- `lorryOwnerPayment` → `truckOwnerPayment`
- `status` → `orderStatus`

**Trucks (formerly Lorries):**
- `lorryId` → `truckId` (UUID)
- `licensePlate` → `plate`
- `make` → `brand`
- Added: `color`, `truckOwnerId`, `carrierId`

**Users:**
- Unified table for all user types (Carrier, Dispatcher, Driver, Truck Owner)
- Added: `carrierId`, `role` fields
- Carriers have self-reference: `carrierId = userId`

#### 3. Enhanced Features

**Backend:**
- ✅ Role-based data filtering (drivers and truck owners see limited financial data)
- ✅ Carrier membership validation (all assets must belong to same carrier)
- ✅ ISO 8601 timestamp handling throughout
- ✅ 5 GSI patterns for efficient querying by role
- ✅ Automatic timestamp setting on status changes

**Frontend:**
- ✅ Asset dropdowns (drivers, trucks, trailers, brokers) - no free-text input
- ✅ Single datetime picker for trip scheduling
- ✅ Role-based UI filtering (sensitive fields hidden by role)
- ✅ "Truck Owner" terminology (renamed from "Lorry Owner")
- ✅ Timestamp formatting for user-friendly display

#### 4. Testing & Verification

**Test Coverage:**
- ✅ 100+ unit tests (all passing)
- ✅ Property-based tests (field mapping, timestamps, filtering, GSI patterns)
- ✅ Integration tests (trip lifecycle, role-based access, carrier validation)
- ✅ Frontend component tests (all dashboards updated)

**Test Data:**
- 1 Carrier (Swift Logistics)
- 13 Users (2 dispatchers, 8 drivers, 3 truck owners)
- 15 Trucks (5 per owner)
- 18 Trailers
- 300 Trips (Jan 2025 - Feb 2026, various statuses)

### Migration Resources

- **Backend Migration**: See `haulhub-backend/README.md` for API changes and field mappings
- **Frontend Migration**: See `haulhub-frontend/README.md` for component updates
- **Detailed Guide**: See `ETRUCKY-MIGRATION.md` for complete migration documentation
- **Integration Tests**: See `haulhub-backend/test/integration/INTEGRATION-TEST-RESULTS.md`
- **Manual Testing**: See `haulhub-backend/test/integration/MANUAL-TESTING-GUIDE.md`

### Breaking Changes

**API Changes:**
- All trip endpoints use new field names (see backend README)
- Timestamps in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
- UUIDs for all entity IDs (no more sequential IDs)
- Role-based response filtering (drivers/truck owners get filtered data)

**Environment Variables:**
```bash
# New eTrucky tables (add to .env)
ETRUCKY_USERS_TABLE=eTrucky-Users
ETRUCKY_TRUCKS_TABLE=eTrucky-Trucks
ETRUCKY_TRAILERS_TABLE=eTrucky-Trailers
ETRUCKY_TRIPS_TABLE=eTrucky-Trips
ETRUCKY_BROKERS_TABLE=eTrucky-Brokers
```

**No Backward Compatibility:**
- Old HaulHub tables remain in AWS (for currently deployed app)
- New code uses only eTrucky schema (no compatibility layer)
- Clean migration strategy - no deprecated field handling

### Rollback Plan

If issues are discovered:
1. Revert to previous commit (pre-migration)
2. Old HaulHub tables remain untouched in AWS
3. Switch environment variables back to old table names
4. No data loss - both table sets exist independently

### Quick Start After Migration

```bash
# 1. Update environment variables
cp haulhub-backend/.env.example haulhub-backend/.env
# Edit .env with eTrucky table names

# 2. Build shared package
cd haulhub-shared && npm run build

# 3. Run tests to verify
cd ../haulhub-backend && npm test
cd ../haulhub-frontend && npm test

# 4. Start development servers
./scripts/dev-backend.sh   # Terminal 1
./scripts/dev-frontend.sh  # Terminal 2
```

---

---

## Project Structure

This is a monorepo containing four main packages:

```
etrucky/
├── etrucky-shared/           # Shared TypeScript types, interfaces, and DTOs
├── etrucky-backend/          # NestJS backend API (AWS Lambda)
├── etrucky-frontend/         # Angular frontend application
├── etrucky-infrastructure/   # AWS CDK infrastructure code
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
import { UserRole, Trip, CreateTripDto } from '@etrucky/shared';
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

eTrucky uses environment-specific configuration files that are excluded from git. These files contain your unique AWS resource URLs.

### `cdk.context.json` - Infrastructure Configuration

**Location**: `etrucky-infrastructure/cdk.context.json`

**Purpose**: Provides runtime configuration to CDK when deploying infrastructure.

**Contents**:
```json
{
  "environment": "dev",
  "awsProfile": "etrucky",
  "allowedOrigins": "https://YOUR_CLOUDFRONT_URL.cloudfront.net"
}
```

**How it's used**: CDK reads this file and configures API Gateway CORS to only accept requests from your CloudFront distribution.

**Why excluded from git**: Each deployment has a unique CloudFront URL. Your URL: `d23ld7dtwui8dz.cloudfront.net`, someone else's: `abc123xyz.cloudfront.net`.

### `environment.prod.ts` - Frontend Configuration

**Location**: `etrucky-frontend/src/environments/environment.prod.ts`

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
- [ ] Configure AWS CLI profile (`aws configure --profile etrucky`)
- [ ] Clone repository
- [ ] Run `npm install` from root
- [ ] Create config files from templates
- [ ] Build shared package (`npm run build:shared`)
- [ ] Deploy infrastructure (`cd etrucky-infrastructure && npx cdk bootstrap && npx cdk deploy --all`)
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

This project uses the `etrucky` AWS profile to manage AWS credentials locally.

#### Step 1: Create AWS Access Keys

If you have a brand new AWS account, you need to create access keys first:

**Option A: Using Root Account (Quick Start - Not Recommended for Production)**

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Click your account name (top right) → **Security credentials**
3. Scroll to **Access keys** section
4. Click **Create access key**
5. Choose **Command Line Interface (CLI)**
6. Check "I understand..." and click **Next**
7. (Optional) Add description tag: "eTrucky Development"
8. Click **Create access key**
9. **Important**: Download the `.csv` file or copy both keys immediately (you won't see the secret key again!)

**Option B: Using IAM User (Recommended for Production)**

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Go to **IAM** service
3. Click **Users** → **Create user**
4. Username: `etrucky-developer` (or your name)
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
aws configure --profile etrucky
```

You'll be prompted for:
- **AWS Access Key ID**: Paste your access key (e.g., `AKIAIOSFODNN7EXAMPLE`)
- **AWS Secret Access Key**: Paste your secret key (e.g., `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)
- **Default region**: Enter `us-east-1` (recommended)
- **Default output format**: Enter `json`

#### Step 3: Verify Configuration

Test that your credentials work:

```bash
aws sts get-caller-identity --profile etrucky
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
[etrucky]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Example `~/.aws/config`**:
```ini
[profile etrucky]
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
npm install <package> --workspace=etrucky-backend

# Or from within the workspace directory
cd etrucky-backend
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
1. **etrucky-shared** - Must be built first as other packages depend on it
2. **etrucky-backend** - Backend API
3. **etrucky-frontend** - Angular application
4. **etrucky-infrastructure** - AWS CDK stacks

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

### First Time Setup

Before running the application locally for the first time, you need to configure environment variables.

#### Backend Environment Setup

Create your `.env` file in the backend directory:

```bash
cd etrucky-backend

# Copy the example file
cp .env.example .env

# Edit .env and fill in your actual values from CDK outputs
# You need: User Pool ID, Client ID, Table Names, S3 Bucket Name
```

**Quick way to get values**:
```bash
# Get Cognito User Pool ID
aws cognito-idp list-user-pools --max-results 10 --profile etrucky --region us-east-1 --query 'UserPools[?Name==`eTrucky-UserPool-dev`].Id' --output text

# Get Cognito Client ID
aws cognito-idp list-user-pool-clients --user-pool-id YOUR_POOL_ID --profile etrucky --region us-east-1 --query 'UserPoolClients[0].ClientId' --output text

# Get S3 Bucket Name
aws s3 ls --profile etrucky | grep etrucky-documents-dev

# Table names are standard: eTrucky-TripsTable-dev, eTrucky-BrokersTable-dev, etc.
```

#### Frontend Environment Setup

Update `etrucky-frontend/src/environments/environment.ts` for local development:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000'
};
```

This file should already exist with these values, but verify it's correct.

### Running the Application

Once environment variables are configured, start both servers:

#### Option 1: Using Scripts (Recommended)

**Terminal 1 - Backend:**
```bash
./scripts/dev-backend.sh
```

**Terminal 2 - Frontend:**
```bash
./scripts/dev-frontend.sh
```

**Note**: The dev scripts automatically rebuild the shared package before starting.

#### Option 2: Manual Start

**Backend:**

```bash
cd etrucky-backend
npm run start:dev
# Runs on http://localhost:3000
```

**Frontend:**
```bash
cd etrucky-frontend
npm start
# Runs on http://localhost:4200
```

### Accessing the Application

Once both servers are running:
- **Frontend**: http://localhost:4200
- **Backend API**: http://localhost:3000

**Important**: The local backend connects to your **actual AWS resources** (DynamoDB, S3, Cognito). Any data you create locally will be stored in your dev environment.

### Working with the Shared Package

The `etrucky-shared` package contains TypeScript types, interfaces, and DTOs used by both backend and frontend. When you modify files in `etrucky-shared/src/`:

1. **Rebuild the shared package and update dependencies**:
   ```bash
   ./scripts/rebuild-shared.sh
   ```

2. **Restart your dev servers** (Ctrl+C and run the dev scripts again)

**Why is this needed?** The shared package is compiled and cached in `node_modules/@etrucky`. Changes require rebuilding and clearing the cache.

**Common issue**: If you see validation errors like `"property X should not exist"`, it means the backend/frontend is using an old cached version of the shared package. Run `./scripts/rebuild-shared.sh` to fix it.

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

### Development Workflow

#### Making Changes to Backend

1. Edit files in `etrucky-backend/src/`
2. The dev server will auto-reload (hot reload enabled)
3. No need to restart unless you modify `package.json` or `.env`

#### Making Changes to Frontend

1. Edit files in `etrucky-frontend/src/`
2. The dev server will auto-reload (hot reload enabled)
3. No need to restart unless you modify `package.json`

#### Making Changes to Shared Package

When you modify files in `etrucky-shared/src/` (DTOs, interfaces, enums):

1. **Rebuild and update dependencies**:
   ```bash
   ./scripts/rebuild-shared.sh
   ```

2. **Restart both dev servers** (Ctrl+C and run the dev scripts again)

**Why?** The shared package is compiled and cached in `node_modules/@etrucky`. Changes require:
- Recompiling TypeScript (`npm run build` in etrucky-shared)
- Clearing cached versions in backend and frontend
- Restarting dev servers to pick up changes

#### Common Development Tasks

**After pulling from git:**
```bash
npm install
npm run build:all
```

**After modifying shared package:**
```bash
./scripts/rebuild-shared.sh
# Then restart dev servers
```

**Clean rebuild everything:**
```bash
npm run clean
npm install
npm run build:all
```

**Rebuild only (keep dependencies):**
```bash
npm run rebuild
```

### Production Environment Configuration

For production deployment, you need to configure environment files with your actual AWS resource URLs.

#### Frontend Production Environment

Create `etrucky-frontend/src/environments/environment.prod.ts`:

```bash
cp etrucky-frontend/src/environments/environment.prod.ts.template \
   etrucky-frontend/src/environments/environment.prod.ts
```

Then update with your API Gateway URL (from CDK outputs):

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev',
  apiBaseUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev'
};
```

**Note**: This file is excluded from git. Each deployment environment needs its own copy.

#### Backend Production Environment

For Lambda deployment, environment variables are set automatically by CDK. No `.env` file is needed in the Lambda function - CDK configures all environment variables during deployment.

---

## Testing

### Run All Tests

```bash
# Backend tests
cd etrucky-backend
npm test

# Frontend tests
cd etrucky-frontend
npm test

# Infrastructure tests
cd etrucky-infrastructure
npm test
```

### Test Coverage

```bash
# Backend coverage
cd etrucky-backend
npm run test:cov

# Frontend coverage
cd etrucky-frontend
npm run test:coverage
```

---

## Deployment

eTrucky provides automated deployment scripts for easy deployment to AWS.

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
cd eTrucky

# Install all dependencies
npm install
```

#### Step 2: Create Configuration Files from Templates

```bash
# Create CDK context file (leave placeholder values for now)
cp etrucky-infrastructure/cdk.context.json.template etrucky-infrastructure/cdk.context.json

# Create production environment file (leave placeholder values for now)
cp etrucky-frontend/src/environments/environment.prod.ts.template \
   etrucky-frontend/src/environments/environment.prod.ts
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
cd etrucky-infrastructure
npm run build
npx cdk bootstrap --profile etrucky
npx cdk deploy --all --profile etrucky --require-approval never
```

**Expected Duration**: 10-15 minutes

**Important**: After deployment completes, CDK will output critical values. **Save these values**:

```
Outputs:
eTrucky-Auth-dev.UserPoolId = us-east-1_XXXXXXXXX
eTrucky-Auth-dev.UserPoolClientId = XXXXXXXXXXXXXXXXXXXXXXXXXX
eTrucky-Api-dev.ApiEndpoint = https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev
eTrucky-Storage-dev.DocumentsBucketName = etrucky-documents-dev-XXXXXXXXXX
eTrucky-Frontend-dev.CloudFrontURL = https://XXXXXXXXXXXXXX.cloudfront.net
eTrucky-Frontend-dev.FrontendBucketName = etrucky-frontend-dev-XXXXXXXXXX
eTrucky-Database-dev.TripsTableName = eTrucky-TripsTable-dev
eTrucky-Database-dev.BrokersTableName = eTrucky-BrokersTable-dev
eTrucky-Database-dev.LorriesTableName = eTrucky-LorriesTable-dev
eTrucky-Database-dev.UsersTableName = eTrucky-UsersTable-dev
```

#### Step 5: Update Configuration Files and Secure CORS

**Why this step is needed**: The initial deployment used `allowedOrigins: '*'` (allow all origins) because we didn't have the CloudFront URL yet. Now we need to lock down CORS to only allow requests from YOUR CloudFront distribution.

Using the outputs from Step 4, update your configuration files:

**A. Update `etrucky-infrastructure/cdk.context.json`:**
```json
{
  "environment": "dev",
  "awsProfile": "etrucky",
  "allowedOrigins": "https://XXXXXXXXXXXXXX.cloudfront.net"
}
```

**B. Create `etrucky-backend/.env`:**
```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
TRIPS_TABLE_NAME=eTrucky-TripsTable-dev
BROKERS_TABLE_NAME=eTrucky-BrokersTable-dev
LORRIES_TABLE_NAME=eTrucky-LorriesTable-dev
USERS_TABLE_NAME=eTrucky-UsersTable-dev
S3_DOCUMENTS_BUCKET_NAME=etrucky-documents-dev-XXXXXXXXXX
ALLOWED_ORIGINS=https://XXXXXXXXXXXXXX.cloudfront.net
NODE_ENV=production
```

**C. Update `etrucky-frontend/src/environments/environment.prod.ts`:**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev',
  apiBaseUrl: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev'
};
```

**D. Update `etrucky-frontend/src/environments/environment.ts` (for local development):**
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
cd etrucky-infrastructure
npx cdk deploy eTrucky-Api-dev --profile etrucky
```

**What this does**:
- Updates API Gateway CORS from `'*'` (allow all) to your specific CloudFront URL
- Updates Lambda environment variable `ALLOWED_ORIGINS`
- Secures your API so only YOUR frontend can call it

**Expected Duration**: 2-3 minutes

#### Step 7: Build Backend and Frontend

```bash
# Build backend
cd ../etrucky-backend
npm run build

# Build frontend
cd ../etrucky-frontend
npm run build
```

#### Step 8: Deploy Backend Code to Lambda

The Lambda function already exists from Step 4, but now we need to update it with the built backend code:

```bash
cd ../etrucky-infrastructure
npx cdk deploy eTrucky-Api-dev --profile etrucky
```

**Expected Duration**: 2-3 minutes

**Note**: This is the second time deploying the API stack - first time was for CORS, this time is for the backend code.

#### Step 9: Seed Initial Data

Seed the brokers table with initial broker data (20 major US freight brokers):

```bash
cd scripts
./seed-brokers.sh
```

This will populate the `eTrucky-BrokersTable-dev` with 20 brokers including:
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

**Note**: You can also seed all tables at once with `./seed-all-tables.sh` which includes brokers, test users, trucks, and trips.

#### Step 10: Deploy Frontend to S3 and CloudFront

```bash
cd ../etrucky-frontend

# Sync built files to S3
aws s3 sync dist/etrucky-frontend/ s3://etrucky-frontend-dev-XXXXXXXXXX/ \
  --profile etrucky \
  --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id XXXXXXXXXXXXXX \
  --paths "/*" \
  --profile etrucky
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
cd etrucky-infrastructure
npx cdk deploy --all --profile etrucky
```

### Deployment Scripts

#### Infrastructure Deployment

```bash
./scripts/deploy-infrastructure.sh
```

**Environment Variables**:
- `AWS_PROFILE`: AWS profile to use (default: `etrucky`)
- `ENVIRONMENT`: Deployment environment (default: `dev`)

**Example**:
```bash
AWS_PROFILE=etrucky ENVIRONMENT=staging ./scripts/deploy-infrastructure.sh
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
  --function-name eTrucky-Lambda-dev \
  --profile etrucky

# Update alias to previous version
aws lambda update-alias \
  --function-name eTrucky-Lambda-dev \
  --name live \
  --function-version <previous-version> \
  --profile etrucky
```

#### Rollback Frontend (S3)

```bash
# List object versions
aws s3api list-object-versions \
  --bucket your-bucket-name \
  --prefix index.html \
  --profile etrucky

# Restore previous version
aws s3api copy-object \
  --bucket your-bucket-name \
  --copy-source your-bucket-name/index.html?versionId=<version-id> \
  --key index.html \
  --profile etrucky

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*" \
  --profile etrucky
```

### Monitoring and Logs

#### CloudWatch Logs

```bash
# Backend logs
aws logs tail /aws/lambda/eTrucky-Lambda-dev \
  --follow \
  --profile etrucky

# API Gateway logs
aws logs tail /aws/apigateway/eTrucky-Api-dev \
  --follow \
  --profile etrucky
```

---

## API Documentation

### Authentication

eTrucky uses JWT (JSON Web Token) authentication via AWS Cognito.

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

**POST /trucks** - Register lorry (Lorry Owner only)
**GET /trucks** - Get trucks
**POST /trucks/:id/documents** - Upload document
**GET /trucks/:id/documents/:docId** - View document

#### Users Endpoints

**GET /users/profile** - Get current user profile
**PATCH /users/profile** - Update user profile

#### Admin Endpoints

**GET /admin/trucks/pending** - Get pending trucks
**PATCH /admin/trucks/:id/verify** - Verify lorry
**GET /admin/users/pending** - Get pending users
**PATCH /admin/users/:id/verify** - Verify user

#### Brokers Endpoints

**GET /brokers** - Get all brokers
**POST /brokers** - Create broker (Admin only)
**PATCH /brokers/:id** - Update broker (Admin only)
**DELETE /brokers/:id** - Delete broker (Admin only)

For complete API documentation with request/response examples, see [etrucky-backend/README.md](./etrucky-backend/README.md).

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
cd etrucky-infrastructure
npx cdk bootstrap --profile etrucky
```

### Lambda Deployment Failed

**Error**: `Code size exceeds maximum allowed`

**Solution**: Optimize dependencies
```bash
cd etrucky-backend
npm prune --production
npm run build
```

### CloudFront Invalidation Timeout

Invalidation can take 10-15 minutes. Check status:
```bash
aws cloudfront get-invalidation \
  --distribution-id YOUR_DIST_ID \
  --id INVALIDATION_ID \
  --profile etrucky
```

### CORS Errors

**Error**: `Access-Control-Allow-Origin` header missing

**Solution**: Update API Gateway CORS configuration:
```bash
cd etrucky-infrastructure
# Update CORS settings in api-stack.ts
npx cdk deploy eTrucky-Api-dev --profile etrucky
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
cp etrucky-infrastructure/cdk.context.json.template etrucky-infrastructure/cdk.context.json
cp etrucky-frontend/src/environments/environment.prod.ts.template \
   etrucky-frontend/src/environments/environment.prod.ts
```

#### Shared Package Not Built

**Error**: `Cannot find module '@etrucky/shared'`

**Solution**: Build shared package first:
```bash
npm run build:shared
```

#### Validation Errors After Modifying Shared Package

**Error**: `"property X should not exist"` or validation errors in API requests

**Cause**: The backend/frontend is using a cached version of the shared package from `node_modules/@etrucky`.

**Solution**: Rebuild shared package and clear cache:
```bash
./scripts/rebuild-shared.sh
```

Then restart your dev servers (Ctrl+C and run `./scripts/dev-backend.sh` and `./scripts/dev-frontend.sh` again).

**Prevention**: The dev scripts now automatically rebuild the shared package when starting, but if you modify the shared package while the servers are running, you need to manually rebuild and restart.

#### AWS Profile Not Configured

**Error**: `Unable to locate credentials` or `The config profile (etrucky) could not be found`

**Solution**: Configure AWS profile:
```bash
aws configure --profile etrucky
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
   aws configure --profile etrucky
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
aws sts get-caller-identity --profile etrucky

# Ensure CDK uses correct profile
export AWS_PROFILE=etrucky
cdk deploy --profile etrucky
```

#### CDK Not Bootstrapped

**Error**: `This stack uses assets, so the toolkit stack must be deployed`

**Solution**: Bootstrap CDK:
```bash
cd etrucky-infrastructure
npx cdk bootstrap --profile etrucky
```

#### Table Names Not Found

**Error**: `Cannot do operations on a non-existent table`

**Solution**: Ensure you're using the new table names in your `.env`:
```bash
TRIPS_TABLE_NAME=eTrucky-TripsTable-dev
BROKERS_TABLE_NAME=eTrucky-BrokersTable-dev
LORRIES_TABLE_NAME=eTrucky-LorriesTable-dev
USERS_TABLE_NAME=eTrucky-UsersTable-dev
```

Not the old single table name: ~~`DYNAMODB_TABLE_NAME=eTrucky`~~

#### Missing .env File

**Error**: `Cannot find module` or environment variables are undefined when running locally

**Solution**: Create `.env` file from example:
```bash
cd etrucky-backend
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
aws sts get-caller-identity --profile etrucky

# Ensure .env file exists
ls -la etrucky-backend/.env

# Check .env has correct values
cat etrucky-backend/.env
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
- [eTrucky Design Document](.kiro/specs/etrucky-transportation-management/design.md)

---

## License

ISC

---

**Last Updated**: 2024-01-01
**Version**: 1.0.0
