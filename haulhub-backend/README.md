# HaulHub Backend

NestJS-based REST API for the HaulHub transportation management system, designed for serverless deployment on AWS Lambda.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your AWS credentials and configuration

# Build shared package (required before running backend)
cd ../haulhub-shared && npm run build && cd ../haulhub-backend

# Run in development mode
npm run start:dev

# Run tests
npm test
```

The API will be available at `http://localhost:3000`.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Module Overview](#module-overview)
- [API Endpoints](#api-endpoints)
- [Authentication & Authorization](#authentication--authorization)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

**Technology Stack:**
- **Framework**: NestJS with TypeScript
- **Deployment**: AWS Lambda with API Gateway (serverless)
- **Authentication**: AWS Cognito with JWT tokens
- **Database**: AWS DynamoDB (single-table design)
- **Storage**: AWS S3 for document uploads
- **Monitoring**: AWS CloudWatch for metrics and logs

**Key Features:**
- JWT-based authentication with AWS Cognito
- Role-based access control (Admin, Dispatcher, LorryOwner, Driver)
- Single-table DynamoDB design with GSI optimization
- Presigned S3 URLs for secure document uploads
- CloudWatch metrics for query performance monitoring
- Comprehensive input validation with class-validator
- Property-based testing for business logic

## Project Structure

```
haulhub-backend/
├── src/
│   ├── admin/                  # Admin operations (user/lorry verification, broker management)
│   │   ├── admin.controller.ts
│   │   ├── admin.service.ts
│   │   ├── brokers.controller.ts
│   │   └── brokers.service.ts
│   ├── analytics/              # Analytics and reporting
│   │   ├── analytics.controller.ts
│   │   └── analytics.service.ts
│   ├── auth/                   # Authentication and authorization
│   │   ├── guards/             # JWT and role-based guards
│   │   ├── decorators/         # Custom decorators (@Public, @Roles, @CurrentUser)
│   │   ├── dto/                # Login, register, refresh DTOs
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── jwt-validator.service.ts
│   ├── config/                 # Configuration and AWS clients
│   │   ├── aws.service.ts      # AWS SDK client initialization
│   │   └── config.service.ts   # Environment variable management
│   ├── documents/              # Document management system
│   │   ├── dto/
│   │   ├── documents.controller.ts
│   │   ├── documents.service.ts
│   │   ├── file-storage.service.ts
│   │   └── document-folders.service.ts
│   ├── fuel/                   # Fuel analytics and efficiency
│   │   └── fuel.service.ts
│   ├── lorries/                # Lorry registration and verification
│   │   ├── lorries.controller.ts
│   │   └── lorries.service.ts
│   ├── trips/                  # Trip management (core business logic)
│   │   ├── trips.controller.ts
│   │   ├── trips.service.ts
│   │   └── index-selector.service.ts  # GSI query optimization
│   ├── app.module.ts           # Root application module
│   ├── main.ts                 # Local development entry point
│   └── lambda.ts               # AWS Lambda handler
├── test/
│   └── unit/                   # Unit tests (mirrors src/ structure)
│       ├── admin/
│       ├── analytics/
│       ├── auth/
│       ├── documents/
│       ├── lorries/
│       └── trips/
├── .env                        # Environment variables (not in git)
├── .env.example                # Environment template
├── jest.config.js              # Jest test configuration
├── nest-cli.json               # NestJS CLI configuration
├── package.json
└── tsconfig.json
```

## Prerequisites

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **AWS CLI**: Configured with appropriate credentials
- **AWS Resources** (created by infrastructure stack):
  - Cognito User Pool
  - DynamoDB table
  - S3 bucket for documents
  - CloudWatch for metrics

## Environment Configuration

Create a `.env` file in the `haulhub-backend` directory:

```bash
# AWS Configuration
AWS_REGION=us-east-1

# Cognito Configuration
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# DynamoDB Configuration
TRIPS_TABLE_NAME=HaulHub-TripsTable-dev
BROKERS_TABLE_NAME=HaulHub-BrokersTable-dev
LORRIES_TABLE_NAME=HaulHub-LorriesTable-dev
USERS_TABLE_NAME=HaulHub-UsersTable-dev

# S3 Configuration
S3_DOCUMENTS_BUCKET_NAME=haulhub-documents-bucket

# CORS Configuration
ALLOWED_ORIGINS=https://your-cloudfront-domain.cloudfront.net,http://localhost:4200

# Application Configuration
NODE_ENV=development
PORT=3000
```

**Important**: The `.env.example` file provides a template. Copy it and fill in your actual AWS resource values.

## Development

### Running Locally

```bash
# Development mode with hot-reload
npm run start:dev

# Standard mode
npm start
```

### Development Workflow

1. **Build shared package first** (critical for monorepo):
   ```bash
   cd ../haulhub-shared && npm run build && cd ../haulhub-backend
   ```

2. **Start the development server**:
   ```bash
   npm run start:dev
   ```

3. **Test your changes**:
   ```bash
   npm test
   ```

### Working with Shared Package

The backend depends on `@haulhub/shared` for types, DTOs, and utilities. When making changes to the shared package:

```bash
# 1. Make changes in haulhub-shared
cd ../haulhub-shared

# 2. Build the shared package
npm run build

# 3. Return to backend and test
cd ../haulhub-backend
npm test
```


## Module Overview

### Auth Module (`src/auth/`)

Handles user authentication and authorization using AWS Cognito.

**Features:**
- User registration with email verification
- Login with JWT token generation
- Token refresh (1-hour access token, 1-year refresh token)
- JWT validation using JWKS (JSON Web Key Set)
- Global authentication guards
- Role-based access control

**Key Components:**
- `AuthService`: Cognito integration, token management
- `JwtValidatorService`: Token validation with public key verification
- `JwtAuthGuard`: Global authentication guard
- `RolesGuard`: Role-based authorization guard
- Custom decorators: `@Public()`, `@Roles()`, `@CurrentUser()`

### Trips Module (`src/trips/`)

Core business logic for managing transportation trips.

**Features:**
- Trip creation with broker, lorry, and driver assignment
- Trip updates and status management
- Role-based trip queries with GSI optimization
- Payment reporting and analytics
- Dashboard summaries (status, payments, timeline)
- Trip deletion

**Key Components:**
- `TripsService`: CRUD operations, payment calculations, reporting
- `IndexSelectorService`: Intelligent GSI selection for optimal query performance
- CloudWatch metrics integration for monitoring

**Access Patterns:**
- Dispatchers: Query by dispatcher ID (primary key)
- Drivers: Query by driver ID (GSI1)
- Lorry Owners: Query by lorry ID (GSI2)

### Lorries Module (`src/lorries/`)

Manages lorry (truck) registration and verification.

**Features:**
- Lorry registration by owners
- Document upload with presigned S3 URLs
- Verification status tracking
- Document viewing with presigned URLs

**Verification Statuses:**
- `Pending`: Initial status after registration
- `Approved`: Admin approved the lorry
- `Rejected`: Admin rejected with reason
- `NeedsMoreEvidence`: Admin requests additional documents

### Admin Module (`src/admin/`)

Administrative functions for system management.

**Features:**
- User verification (approve/reject user accounts)
- Lorry verification (approve/reject lorry registrations)
- Broker management (CRUD operations)
- Pending items dashboard

**Key Components:**
- `AdminService`: User and lorry verification logic
- `BrokersService`: Broker CRUD operations
- GSI3 for efficient pending lorry queries

### Analytics Module (`src/analytics/`)

Provides business intelligence and reporting.

**Features:**
- Fleet overview (drivers, vehicles, trips)
- Trip analytics (revenue, expenses, profit)
- Driver performance metrics
- Vehicle utilization reports
- Revenue analytics
- Broker analytics
- Fuel analytics
- Maintenance alerts

**Access:** Dispatcher and Admin roles only

### Documents Module (`src/documents/`)

Advanced document management system (in development).

**Features:**
- File upload to S3
- Document metadata management
- Folder organization
- Bulk operations (update, delete, move)
- Batch uploads
- Document search and filtering
- Permission management

### Fuel Module (`src/fuel/`)

Fuel cost tracking and efficiency analysis.

**Features:**
- Fuel price tracking by location
- Vehicle fuel efficiency calculations
- Fuel cost analysis with monthly breakdowns
- Optimization suggestions

### Config Module (`src/config/`)

Centralized configuration and AWS client management.

**Features:**
- Environment variable validation
- AWS SDK client initialization (Cognito, DynamoDB, S3, CloudWatch)
- Singleton pattern for client reuse


## API Endpoints

### Authentication (`/auth`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/auth/register` | No | - | Register new user |
| POST | `/auth/login` | No | - | Login and get tokens |
| POST | `/auth/refresh` | No | - | Refresh access token |
| POST | `/auth/logout` | Yes | All | Logout and invalidate tokens |

### Brokers (`/brokers`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/brokers` | No | - | List all brokers (optional: `?activeOnly=true`) |
| GET | `/brokers/:id` | No | - | Get broker by ID |
| POST | `/brokers` | Yes | Admin | Create new broker |
| PATCH | `/brokers/:id` | Yes | Admin | Update broker |
| DELETE | `/brokers/:id` | Yes | Admin | Soft delete broker |

### Lorries (`/lorries`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/lorries` | Yes | LorryOwner | Register new lorry |
| GET | `/lorries` | Yes | LorryOwner | Get all lorries for owner |
| GET | `/lorries/:id` | Yes | LorryOwner, Admin | Get lorry by ID |
| POST | `/lorries/:id/documents` | Yes | LorryOwner | Get presigned URL for document upload |
| GET | `/lorries/:id/documents` | Yes | LorryOwner, Admin | List all documents for lorry |
| GET | `/lorries/:id/documents/:docId` | Yes | LorryOwner, Admin | Get presigned URL to view document |

### Trips (`/trips`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/trips` | Yes | Dispatcher | Create new trip |
| GET | `/trips` | Yes | Dispatcher, Driver, LorryOwner | List trips with filters |
| GET | `/trips/:id` | Yes | Dispatcher, Driver, LorryOwner, Admin | Get trip by ID |
| PATCH | `/trips/:id` | Yes | Dispatcher | Update trip details |
| PATCH | `/trips/:id/status` | Yes | Dispatcher, Driver | Update trip status |
| DELETE | `/trips/:id` | Yes | Dispatcher | Delete trip |
| GET | `/trips/reports/payments` | Yes | Dispatcher, Driver, LorryOwner | Payment reports with aggregation |
| GET | `/trips/dashboard/summary-by-status` | Yes | Dispatcher | Trip counts by status |
| GET | `/trips/dashboard/payment-summary` | Yes | Dispatcher | Aggregated payment metrics |
| GET | `/trips/dashboard/payments-timeline` | Yes | Dispatcher | Time-series payment data |

### Admin (`/admin`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/admin/dashboard` | Yes | Admin | Admin dashboard summary |
| GET | `/admin/lorries/pending` | Yes | Admin | List pending lorry verifications |
| PATCH | `/admin/lorries/:id/verify` | Yes | Admin | Approve/reject lorry |
| GET | `/admin/users/pending` | Yes | Admin | List pending user verifications |
| PATCH | `/admin/users/:id/verify` | Yes | Admin | Approve/reject user |

### Analytics (`/analytics`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/analytics/fleet-overview` | Yes | Dispatcher, Admin | Fleet statistics |
| GET | `/analytics/trip-analytics` | Yes | Dispatcher, Admin | Trip metrics with date filters |
| GET | `/analytics/driver-performance` | Yes | Dispatcher, Admin | Driver performance metrics |
| GET | `/analytics/vehicle-utilization` | Yes | Dispatcher, Admin | Vehicle utilization reports |
| GET | `/analytics/revenue-analytics` | Yes | Dispatcher, Admin | Revenue analysis |
| GET | `/analytics/maintenance-alerts` | Yes | Dispatcher, Admin | Maintenance alerts |
| GET | `/analytics/broker-analytics` | Yes | Dispatcher, Admin | Broker performance metrics |
| GET | `/analytics/fuel-analytics` | Yes | Dispatcher, Admin | Fuel cost and efficiency |

### Documents (`/documents`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/documents` | Yes | All | Upload document with file |
| GET | `/documents` | Yes | All | List documents with filters |
| GET | `/documents/search` | Yes | All | Advanced document search |
| GET | `/documents/stats` | Yes | All | Document statistics |
| GET | `/documents/:id` | Yes | All | Get document by ID |
| PATCH | `/documents/:id` | Yes | All | Update document metadata |
| DELETE | `/documents/:id` | Yes | All | Delete document |
| POST | `/documents/bulk-update` | Yes | All | Bulk update documents |
| POST | `/documents/bulk-delete` | Yes | All | Bulk delete documents |
| POST | `/documents/bulk-move` | Yes | All | Bulk move documents |
| POST | `/documents/batch-upload` | Yes | All | Upload multiple files |
| GET | `/documents/folders` | Yes | All | List folders |
| POST | `/documents/folders` | Yes | All | Create folder |
| DELETE | `/documents/folders/:id` | Yes | All | Delete folder |


## Authentication & Authorization

### How It Works

1. **Registration**: User registers via `/auth/register` → Cognito creates user → Email verification sent
2. **Login**: User logs in via `/auth/login` → Cognito validates credentials → Returns JWT tokens
3. **API Requests**: Client includes `Authorization: Bearer <access-token>` header
4. **Token Validation**: `JwtAuthGuard` validates token using Cognito's public keys (JWKS)
5. **Role Check**: `RolesGuard` verifies user has required role for the endpoint
6. **Request Processing**: User data attached to request, available via `@CurrentUser()` decorator

### Request Flow Diagram

```
Client Request
    ↓
    Authorization: Bearer <jwt-token>
    ↓
┌─────────────────────────────────────┐
│  1. JwtAuthGuard                    │
│  - Extract token from header        │
│  - Validate with Cognito JWKS       │
│  - Decode JWT payload               │
│  - Attach to request.user           │
└─────────────────────────────────────┘
    ↓
    request.user = {
      userId: 'uuid',
      email: 'user@example.com',
      role: 'Dispatcher',
      username: 'john'
    }
    ↓
┌─────────────────────────────────────┐
│  2. RolesGuard                      │
│  - Check request.user.role          │
│  - Verify against @Roles()          │
│  - Allow or deny (403)              │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  3. @CurrentUser() Decorator        │
│  - Read request.user                │
│  - Extract requested property       │
│  - Pass to controller method        │
└─────────────────────────────────────┘
    ↓
Controller Method Executes
    ↓
Response to Client
```

### Token Lifecycle

- **Access Token**: 1 hour expiration, used for API authentication
- **Refresh Token**: 1 year expiration, used to obtain new access tokens
- **Token Refresh**: Call `/auth/refresh` with refresh token before access token expires

### Guards

**JwtAuthGuard** (Applied globally to all routes):
- Validates JWT token signature using Cognito JWKS
- Checks token expiration
- Extracts user information (userId, email, role, username)
- Attaches user to request object

**RolesGuard** (Applied to protected routes):
- Checks if user has required role(s)
- Returns 403 Forbidden if user lacks permission

### Decorators

**@Public()** - Bypass authentication:
```typescript
@Public()
@Post('login')
async login(@Body() loginDto: LoginDto) {
  return this.authService.login(loginDto);
}
```

**@Roles(...roles)** - Require specific roles:
```typescript
@Roles(UserRole.Admin)
@Get('users/pending')
async getPendingUsers() {
  return this.adminService.getPendingUsers();
}
```

**@CurrentUser()** - Extract authenticated user:

This decorator extracts user information that was attached to the request by `JwtAuthGuard`.

**How it works:**

1. `JwtAuthGuard` validates the JWT token and extracts claims
2. Guard attaches user data to `request.user`:
   ```typescript
   request.user = {
     userId: payload.sub,           // From JWT 'sub' claim
     email: payload.email,          // From JWT 'email' claim  
     role: payload['cognito:groups'][0],  // From Cognito groups
     username: payload.username,    // From JWT username claim
   };
   ```
3. `@CurrentUser()` decorator reads `request.user` and passes it to your method

**Usage examples:**

```typescript
// Get entire user object
@Get('profile')
async getProfile(@CurrentUser() user: CurrentUserData) {
  // user = { userId: '123', email: 'user@example.com', role: 'Dispatcher', username: 'john' }
  return { userId: user.userId, email: user.email };
}

// Extract specific property (cleaner when you only need one field)
@Post('trips')
async createTrip(
  @CurrentUser('userId') userId: string,  // Just the userId string
  @Body() dto: CreateTripDto,
) {
  return this.tripsService.createTrip(userId, dto);
}

// Extract multiple properties
@Get('dashboard')
async getDashboard(
  @CurrentUser('userId') userId: string,
  @CurrentUser('role') role: string,
) {
  return this.service.getDashboard(userId, role);
}
```

**Available properties:**
- `userId`: Cognito user ID (UUID)
- `email`: User's email address
- `role`: User's role (Dispatcher, Driver, LorryOwner, Admin)
- `username`: Cognito username

### User Roles

```typescript
enum UserRole {
  Dispatcher = 'Dispatcher',  // Manages trips, assigns drivers
  LorryOwner = 'LorryOwner',  // Owns trucks, views trips for their vehicles
  Driver = 'Driver',          // Drives trucks, updates trip status
  Admin = 'Admin'             // System administration, verifications
}
```

### Making Authenticated Requests

```bash
# 1. Login to get token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# 2. Use token in subsequent requests
curl -X GET http://localhost:3000/trips \
  -H "Authorization: Bearer eyJraWQiOiJ..."
```

### Frontend to API Communication

**How the Angular frontend calls the backend API:**

1. **Frontend Configuration** (`environment.ts`):
   ```typescript
   export const environment = {
     production: false,
     apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/dev'
   };
   ```

2. **HTTP Interceptor** adds Authorization header:
   ```typescript
   // In auth.interceptor.ts
   intercept(req: HttpRequest<any>, next: HttpHandler) {
     const token = this.authService.getAccessToken();
     
     if (token) {
       req = req.clone({
         setHeaders: {
           Authorization: `Bearer ${token}`
         }
       });
     }
     
     return next.handle(req);
   }
   ```

3. **Service makes API call**:
   ```typescript
   // In trip.service.ts
   createTrip(dto: CreateTripDto): Observable<Trip> {
     return this.http.post<Trip>(`${environment.apiUrl}/trips`, dto);
     // Interceptor automatically adds Authorization header
   }
   ```

4. **Request flow**:
   ```
   Browser (Angular)
       ↓
   HTTP Request: POST https://api-gateway-url/dev/trips
   Headers: Authorization: Bearer <token>
       ↓
   API Gateway (checks CORS, forwards to Lambda)
       ↓
   Lambda (NestJS validates token, processes request)
       ↓
   Response with CORS headers
       ↓
   Browser receives response
   ```

### CORS Troubleshooting

**Problem**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution**: Verify both CORS configurations match:

1. **Check API Gateway CORS** (in `api-stack.ts`):
   - Must include CloudFront domain in `allowOrigins`
   - Must include `Authorization` in `allowHeaders`

2. **Check Lambda CORS** (in `lambda.ts`):
   - `ALLOWED_ORIGINS` environment variable must include CloudFront domain
   - Must enable `credentials: true`

3. **Check Frontend makes requests to correct URL**:
   - `environment.apiUrl` should point to API Gateway URL
   - Not CloudFront URL (CloudFront serves frontend, not API)

**Common mistake**: Trying to call API through CloudFront. The frontend is served by CloudFront, but API calls go directly to API Gateway.

```
✅ Correct:
Frontend: https://d123abc.cloudfront.net (or etrucky.com)
API:      https://abc123.execute-api.us-east-1.amazonaws.com/dev

❌ Wrong:
Frontend: https://d123abc.cloudfront.net
API:      https://d123abc.cloudfront.net/api  (CloudFront doesn't route to API)
```


## Testing

### Test Organization

Tests are located in the `test/` directory and mirror the `src/` structure:

```
test/
├── unit/
│   ├── admin/
│   │   ├── admin.service.spec.ts
│   │   ├── brokers.controller.spec.ts
│   │   └── brokers.service.spec.ts
│   ├── analytics/
│   │   ├── analytics.service.spec.ts
│   │   └── analytics-report-completeness.property.spec.ts
│   ├── auth/
│   │   ├── auth.controller.spec.ts
│   │   ├── auth.service.spec.ts
│   │   └── guards/
│   │       ├── jwt-auth.guard.spec.ts
│   │       └── roles.guard.spec.ts
│   ├── documents/
│   │   ├── documents.service.spec.ts
│   │   ├── file-storage.service.spec.ts
│   │   └── enhanced-document-management.spec.ts
│   ├── lorries/
│   │   ├── lorries.controller.spec.ts
│   │   └── lorries.service.spec.ts
│   └── trips/
│       ├── trips.controller.spec.ts
│       ├── trips.service.spec.ts
│       ├── trips.service.gsi-attributes.spec.ts
│       ├── financial-calculation.property.spec.ts
│       ├── mileage-calculation.property.spec.ts
│       └── mileage-validation.property.spec.ts
└── jest-e2e.json
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run specific test file
npm test -- trips.service.spec

# Run tests matching pattern
npm test -- --testPathPattern="guards"
```

### Test Types

**Unit Tests** (`*.spec.ts`):
- Test individual components in isolation
- Mock external dependencies (AWS services, databases)
- Fast execution, comprehensive coverage

**Property-Based Tests** (`*.property.spec.ts`):
- Test business logic with generated data
- Use `fast-check` library for property testing
- Validate calculations, validations, and business rules
- Examples: financial calculations, mileage validation

### Writing Tests

**Basic Test Structure:**
```typescript
describe('ServiceName', () => {
  let service: ServiceType;
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    mockDependency = {
      method: jest.fn(),
    } as any;
    
    service = new ServiceType(mockDependency);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    mockDependency.method.mockResolvedValue('result');
    
    // Act
    const result = await service.doSomething();
    
    // Assert
    expect(result).toBe('result');
    expect(mockDependency.method).toHaveBeenCalledWith(expectedArgs);
  });
});
```

**Property-Based Test Example:**
```typescript
import * as fc from 'fast-check';

describe('Financial Calculations', () => {
  it('should calculate profit correctly for any valid payments', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 10000 }), // brokerPayment
        fc.float({ min: 50, max: 5000 }),   // driverPayment
        fc.float({ min: 50, max: 5000 }),   // lorryOwnerPayment
        (broker, driver, lorry) => {
          const profit = broker - driver - lorry;
          expect(profit).toBe(broker - driver - lorry);
        }
      )
    );
  });
});
```

### Test Coverage

Current test coverage: **123 tests across 13 test suites**

- ✅ Auth Module: 28 tests (service, controller, guards)
- ✅ Admin Module: 33 tests (service, brokers service, brokers controller)
- ✅ Lorries Module: 21 tests (service, controller)
- ✅ Trips Module: 21 tests (service, controller, property tests)
- ✅ Documents Module: 3 tests (service, file storage)
- ✅ Analytics Module: 17 tests (service, property tests)

**Coverage Goals:**
- Unit tests: 80%+ code coverage
- Critical paths: 100% coverage (auth, payments, calculations)

### Mocking Best Practices

**DO Mock:**
- AWS SDK clients (Cognito, DynamoDB, S3, CloudWatch)
- External API calls
- Time-dependent functions

**DON'T Mock:**
- Utility functions from `@haulhub/shared`
- Pure calculation functions
- Business logic that should be tested

**Example - Mock AWS Services:**
```typescript
const mockDynamoDBClient = {
  send: jest.fn(),
};

const mockAwsService = {
  getDynamoDBClient: jest.fn().mockReturnValue(mockDynamoDBClient),
};
```


## Building & Deployment

### Complete Deployment Architecture

HaulHub uses a serverless architecture with separate frontend and backend deployments:

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CloudFront Distribution                       │
│  - Serves static files (HTML, JS, CSS) from S3                 │
│  - Global CDN with edge caching                                 │
│  - Custom domain: etrucky.com                                   │
│  - HTTPS only (redirects HTTP → HTTPS)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Origin Request
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      S3 Bucket (Frontend)                        │
│  - index.html, *.js, *.css, assets                             │
│  - Private bucket (CloudFront access only)                      │
│  - Versioning enabled                                           │
└─────────────────────────────────────────────────────────────────┘

                    Angular App Loads in Browser
                             │
                             │ API Calls (HTTPS)
                             │ Authorization: Bearer <token>
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                       API Gateway (REST)                         │
│  - CORS configured for CloudFront domain                        │
│  - Throttling: 1000 req/sec, burst 2000                        │
│  - CloudWatch logging enabled                                   │
│  - Stage: dev/prod                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Lambda Proxy Integration
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Function (Backend)                     │
│  - NestJS application wrapped with serverless-express           │
│  - Runtime: Node.js 20.x                                        │
│  - Memory: 512MB, Timeout: 30s                                  │
│  - Environment variables injected by CDK                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ AWS SDK Calls
                             ↓
┌──────────────────┬──────────────────┬──────────────────────────┐
│   DynamoDB       │   S3 Bucket      │   Cognito User Pool      │
│   (Database)     │   (Documents)    │   (Authentication)       │
└──────────────────┴──────────────────┴──────────────────────────┘
```

### Local Build

```bash
npm run build
```

Output: `dist/` directory with compiled JavaScript

### Lambda Build

Build for AWS Lambda deployment:

```bash
npm run build:lambda
```

This command:
1. Compiles TypeScript to JavaScript
2. Copies `package.json` and `package-lock.json` to `dist/`
3. Prepares the bundle for Lambda deployment

### Deployment Process

#### Step 1: Build Backend

```bash
cd haulhub-backend
npm run build:lambda
```

This creates `.lambda-package/` directory with:
- Compiled JavaScript files
- `package.json` and `package-lock.json`
- `node_modules/` (production dependencies only)

#### Step 2: Deploy Infrastructure

```bash
cd ../haulhub-infrastructure
npm run deploy
```

The CDK will:
1. **Create/Update Lambda Function**
   - Package code from `.lambda-package/`
   - Set environment variables
   - Configure IAM role with DynamoDB, S3, Cognito permissions
   - Set up CloudWatch logging

2. **Create/Update API Gateway**
   - REST API with Lambda proxy integration
   - CORS configuration for CloudFront domain
   - Throttling and rate limiting
   - Stage deployment (dev/prod)

3. **Output API URL**
   - Example: `https://abc123.execute-api.us-east-1.amazonaws.com/dev/`

#### Step 3: Build Frontend

```bash
cd ../haulhub-frontend
npm run build
```

This creates `dist/` directory with:
- `index.html`
- Compiled JavaScript bundles
- CSS files
- Assets (images, fonts)

#### Step 4: Deploy Frontend to S3

```bash
# Use the command from CDK output
aws s3 sync dist/ s3://haulhub-frontend-dev/ --delete --profile your-profile
```

#### Step 5: Invalidate CloudFront Cache

```bash
# Use the command from CDK output
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" \
  --profile your-profile
```

### CORS Configuration

CORS is configured in **two places** to allow frontend-to-API communication:

#### 1. API Gateway CORS (Infrastructure)

Configured in `api-stack.ts`:

```typescript
defaultCorsPreflightOptions: {
  allowOrigins: [
    'http://localhost:4200',           // Local development
    'https://localhost:4200',
    'https://etrucky.com',             // Production domain
    'https://www.etrucky.com',
    'https://d123abc.cloudfront.net',  // CloudFront domain
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Amz-Date',
    'X-Api-Key',
  ],
  allowCredentials: true,
  maxAge: Duration.hours(1),
}
```

This handles **preflight OPTIONS requests** from the browser.

#### 2. Lambda CORS (Application)

Configured in `src/lambda.ts` and `src/main.ts`:

```typescript
nestApp.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});
```

This adds **CORS headers to actual responses**.

**Environment Variable:**
```bash
ALLOWED_ORIGINS=https://d123abc.cloudfront.net,http://localhost:4200
```

### Why Two CORS Configurations?

1. **API Gateway CORS**: Handles preflight OPTIONS requests before they reach Lambda
2. **Lambda CORS**: Adds CORS headers to actual API responses (GET, POST, etc.)

Both must allow the same origins for CORS to work properly.

### Lambda Handler

The Lambda handler (`src/lambda.ts`) uses `@vendia/serverless-express` to wrap the NestJS application for Lambda execution. It:
- Caches the NestJS application instance for warm starts
- Enables CORS for CloudFront domain
- Configures global validation pipes
- Logs incoming events for debugging

### Environment Variables in Lambda

Environment variables are automatically configured by the CDK stack:
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `TRIPS_TABLE_NAME`
- `BROKERS_TABLE_NAME`
- `LORRIES_TABLE_NAME`
- `USERS_TABLE_NAME`
- `DOCUMENTS_BUCKET_NAME`
- `ALLOWED_ORIGINS`
- `AWS_REGION`
- `NODE_ENV`

## Complete Deployment Guide

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** configured with profile
3. **Node.js 18+** installed
4. **All packages built**:
   ```bash
   cd haulhub-shared && npm run build
   cd ../haulhub-backend && npm run build:lambda
   cd ../haulhub-frontend && npm run build
   ```

### Step-by-Step Deployment

#### 1. Deploy Infrastructure (First Time)

```bash
cd haulhub-infrastructure

# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/REGION --profile your-profile

# Deploy all stacks
npm run deploy
```

This creates:
- **AuthStack**: Cognito User Pool and App Client
- **DatabaseStack**: DynamoDB tables with GSIs
- **StorageStack**: S3 bucket for documents
- **ApiStack**: Lambda function and API Gateway
- **FrontendStack**: S3 bucket and CloudFront distribution

**Important Outputs** (save these):
- `ApiUrl`: API Gateway endpoint (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/dev/`)
- `DistributionDomainName`: CloudFront domain (e.g., `d123abc.cloudfront.net`)
- `FrontendBucketName`: S3 bucket name for frontend
- `UserPoolId`: Cognito User Pool ID
- `UserPoolClientId`: Cognito App Client ID

#### 2. Configure Frontend Environment

Update `haulhub-frontend/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/dev',  // From CDK output
  cognitoUserPoolId: 'us-east-1_xxxxxxxxx',  // From CDK output
  cognitoClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',  // From CDK output
  region: 'us-east-1'
};
```

#### 3. Build and Deploy Frontend

```bash
cd haulhub-frontend

# Build for production
npm run build

# Deploy to S3 (use bucket name from CDK output)
aws s3 sync dist/haulhub-frontend/ s3://haulhub-frontend-dev/ \
  --delete \
  --profile your-profile

# Invalidate CloudFront cache (use distribution ID from CDK output)
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" \
  --profile your-profile
```

#### 4. Verify Deployment

```bash
# Check frontend is accessible
curl https://d123abc.cloudfront.net

# Check API is accessible
curl https://abc123.execute-api.us-east-1.amazonaws.com/dev/brokers

# Test CORS (should return CORS headers)
curl -X OPTIONS https://abc123.execute-api.us-east-1.amazonaws.com/dev/trips \
  -H "Origin: https://d123abc.cloudfront.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \
  -v
```

### Updating the Application

#### Backend Updates

```bash
# 1. Make changes to backend code
cd haulhub-backend

# 2. Build for Lambda
npm run build:lambda

# 3. Deploy (CDK will update Lambda function)
cd ../haulhub-infrastructure
npm run deploy
```

#### Frontend Updates

```bash
# 1. Make changes to frontend code
cd haulhub-frontend

# 2. Build
npm run build

# 3. Deploy to S3
aws s3 sync dist/haulhub-frontend/ s3://haulhub-frontend-dev/ --delete

# 4. Invalidate cache
aws cloudfront create-invalidation --distribution-id E1234567890ABC --paths "/*"
```

### Environment-Specific Deployments

The infrastructure supports multiple environments (dev, staging, prod):

```bash
# Deploy to dev
cdk deploy --context environment=dev --profile dev-profile

# Deploy to production
cdk deploy --context environment=prod --profile prod-profile
```

Each environment gets separate:
- Lambda functions
- API Gateway stages
- S3 buckets
- CloudFront distributions
- DynamoDB tables

### Custom Domain Setup (Production)

For production with custom domain (etrucky.com):

1. **Certificate is created automatically** by CDK in `us-east-1`
2. **Add DNS validation records** from ACM console to your domain registrar
3. **Wait for certificate validation** (can take 30 minutes)
4. **Add DNS records** to point to CloudFront:
   ```
   etrucky.com     → CNAME → d123abc.cloudfront.net
   www.etrucky.com → CNAME → d123abc.cloudfront.net
   ```
5. **Access via custom domain**: `https://etrucky.com`

### Deployment Scripts

Use the convenience scripts in `scripts/` directory:

```bash
# Deploy backend only
./scripts/deploy-backend.sh

# Deploy frontend only
./scripts/deploy-frontend.sh

# Deploy infrastructure
./scripts/deploy-infrastructure.sh
```

### Complete Request Flow Example

Here's what happens when a user creates a trip:

```
1. User clicks "Create Trip" in Angular app
   ↓
2. Angular service calls:
   this.http.post('https://api-gateway-url/dev/trips', tripData)
   ↓
3. HTTP Interceptor adds Authorization header:
   Authorization: Bearer eyJraWQiOiJ...
   ↓
4. Browser sends preflight OPTIONS request (CORS check):
   OPTIONS https://api-gateway-url/dev/trips
   Origin: https://d123abc.cloudfront.net
   ↓
5. API Gateway responds with CORS headers:
   Access-Control-Allow-Origin: https://d123abc.cloudfront.net
   Access-Control-Allow-Methods: POST, GET, ...
   Access-Control-Allow-Headers: Authorization, Content-Type
   ↓
6. Browser sends actual POST request:
   POST https://api-gateway-url/dev/trips
   Authorization: Bearer eyJraWQiOiJ...
   Content-Type: application/json
   ↓
7. API Gateway forwards to Lambda
   ↓
8. Lambda (NestJS):
   - JwtAuthGuard validates token with Cognito
   - RolesGuard checks user role (Dispatcher)
   - @CurrentUser() extracts user data
   - TripsController.createTrip() executes
   - TripsService saves to DynamoDB
   ↓
9. Lambda returns response with CORS headers:
   Access-Control-Allow-Origin: https://d123abc.cloudfront.net
   Access-Control-Allow-Credentials: true
   ↓
10. API Gateway forwards response to browser
    ↓
11. Angular receives response and updates UI
```

### CloudFront Caching Strategy

**Static Assets** (JS, CSS, images):
- **Dev**: 5 minutes cache
- **Prod**: 7 days cache
- Compressed with Gzip and Brotli

**index.html**:
- **Dev**: No cache (0 seconds)
- **Prod**: 5 minutes cache
- Ensures users get latest app version

**SPA Routing**:
- 404 errors redirect to `index.html`
- Allows Angular router to handle all routes
- TTL: 5 minutes

**Cache Invalidation**:
```bash
# After deploying new frontend version
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

This forces CloudFront to fetch fresh files from S3.

## DynamoDB Schema

### Single-Table Design

HaulHub uses a single DynamoDB table with multiple entity types and access patterns.

**Table Name**: `HaulHub`

**Primary Key:**
- `PK` (Partition Key): String
- `SK` (Sort Key): String

**Global Secondary Indexes:**
- **GSI1**: `GSI1PK` (PK), `GSI1SK` (SK) - Driver queries
- **GSI2**: `GSI2PK` (PK), `GSI2SK` (SK) - Lorry queries
- **GSI3**: `GSI3PK` (PK), `GSI3SK` (SK) - Verification status queries

### Entity Patterns

**User:**
```
PK: USER#<userId>
SK: PROFILE
```

**Broker:**
```
PK: BROKER#<brokerId>
SK: METADATA
```

**Lorry:**
```
PK: LORRY_OWNER#<ownerId>
SK: LORRY#<lorryId>
GSI3PK: LORRY_STATUS#<verificationStatus>
GSI3SK: LORRY#<lorryId>
```

**Trip:**
```
PK: DISPATCHER#<dispatcherId>
SK: TRIP#<scheduledDate>#<tripId>
GSI1PK: DRIVER#<driverId>
GSI1SK: TRIP#<scheduledDate>#<tripId>
GSI2PK: LORRY#<lorryId>
GSI2SK: TRIP#<scheduledDate>#<tripId>
```

**Document Metadata:**
```
PK: LORRY#<lorryId>
SK: DOCUMENT#<documentId>
```

### Query Optimization

The `IndexSelectorService` intelligently selects the optimal GSI based on query filters:
- Analyzes filter combinations
- Selects most efficient index
- Emits CloudWatch metrics for monitoring
- Supports query performance optimization


## Common Workflows

### Creating a Trip (Dispatcher)

```bash
# 1. Login as dispatcher
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@example.com",
    "password": "password"
  }'

# 2. Create trip
curl -X POST http://localhost:3000/trips \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": "Los Angeles, CA",
    "dropoffLocation": "San Francisco, CA",
    "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
    "brokerId": "<broker-uuid>",
    "lorryId": "ABC-1234",
    "driverId": "DRV-001",
    "driverName": "John Doe",
    "brokerPayment": 2500.00,
    "lorryOwnerPayment": 1500.00,
    "driverPayment": 800.00,
    "distance": 380
  }'
```

### Registering a Lorry (Lorry Owner)

```bash
# 1. Register lorry
curl -X POST http://localhost:3000/lorries \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "lorryId": "ABC-1234",
    "make": "Freightliner",
    "model": "Cascadia",
    "year": 2020
  }'

# 2. Get presigned URL for document upload
curl -X POST http://localhost:3000/lorries/ABC-1234/documents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "registration.pdf",
    "fileSize": 1024000,
    "contentType": "application/pdf"
  }'

# 3. Upload document to S3 using presigned URL
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @registration.pdf
```

### Verifying a Lorry (Admin)

```bash
# 1. Get pending lorries
curl -X GET http://localhost:3000/admin/lorries/pending \
  -H "Authorization: Bearer <admin-token>"

# 2. View lorry documents
curl -X GET http://localhost:3000/lorries/ABC-1234/documents/uuid \
  -H "Authorization: Bearer <admin-token>"

# 3. Approve lorry
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"decision": "Approved"}'
```

### Viewing Trips (Driver)

```bash
# Get all trips assigned to driver
curl -X GET "http://localhost:3000/trips?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer <driver-token>"

# Get payment report
curl -X GET "http://localhost:3000/trips/reports/payments?startDate=2024-01-01" \
  -H "Authorization: Bearer <driver-token>"
```

## Troubleshooting

### "Authorization header is missing"

**Cause**: Request doesn't include JWT token

**Solution**: Add `Authorization: Bearer <token>` header to request

### "Access token has expired"

**Cause**: Access token expired (1-hour lifetime)

**Solution**: Use refresh token to get new access token:
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh-token>"}'
```

### "Access denied. Required roles: ..."

**Cause**: User doesn't have required role for endpoint

**Solution**: Verify user role in Cognito or use account with appropriate role

### "Module not found: @haulhub/shared"

**Cause**: Shared package not built or not installed

**Solution**:
```bash
cd ../haulhub-shared
npm run build
cd ../haulhub-backend
npm install
```

### Tests failing with "X is not a function"

**Cause**: Jest can't resolve shared package imports

**Solution**:
1. Build shared package: `cd ../haulhub-shared && npm run build`
2. Verify Jest config points to `dist/`: Check `jest.config.js`
3. Run tests again: `npm test`

### DynamoDB connection errors

**Cause**: AWS credentials not configured or invalid table names

**Solution**:
1. Configure AWS CLI: `aws configure`
2. Verify tables exist: `aws dynamodb list-tables`
3. Check `.env` file has correct table names (TRIPS_TABLE_NAME, BROKERS_TABLE_NAME, LORRIES_TABLE_NAME, USERS_TABLE_NAME)

### CORS errors in browser

**Cause**: Frontend origin not in `ALLOWED_ORIGINS`

**Solution**: Add frontend URL to `.env`:
```bash
ALLOWED_ORIGINS=http://localhost:4200,https://your-cloudfront-domain.cloudfront.net
```


## API Examples

### Authentication Flow

```bash
# Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@example.com",
    "password": "SecurePass123!",
    "fullName": "John Dispatcher",
    "phoneNumber": "+12345678901",
    "role": "Dispatcher"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@example.com",
    "password": "SecurePass123!"
  }'

# Response:
{
  "accessToken": "eyJraWQiOiJ...",
  "refreshToken": "eyJraWQiOiJ...",
  "expiresIn": 3600,
  "userId": "uuid",
  "role": "Dispatcher",
  "email": "dispatcher@example.com",
  "fullName": "John Dispatcher"
}
```

### Trip Management

```bash
# Create trip
curl -X POST http://localhost:3000/trips \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": "Los Angeles, CA",
    "dropoffLocation": "San Francisco, CA",
    "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
    "brokerId": "broker-uuid",
    "lorryId": "ABC-1234",
    "driverId": "DRV-001",
    "driverName": "John Doe",
    "brokerPayment": 2500,
    "lorryOwnerPayment": 1500,
    "driverPayment": 800,
    "distance": 380
  }'

# Update trip status (Driver or Dispatcher)
curl -X PATCH http://localhost:3000/trips/<trip-id>/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "PickedUp"}'

# Get trips with filters
curl -X GET "http://localhost:3000/trips?startDate=2024-01-01&endDate=2024-12-31&status=Delivered" \
  -H "Authorization: Bearer <token>"

# Get payment report
curl -X GET "http://localhost:3000/trips/reports/payments?startDate=2024-01-01&groupBy=broker" \
  -H "Authorization: Bearer <token>"
```

### Analytics

```bash
# Fleet overview
curl -X GET http://localhost:3000/analytics/fleet-overview \
  -H "Authorization: Bearer <dispatcher-token>"

# Trip analytics with date range
curl -X GET "http://localhost:3000/analytics/trip-analytics?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer <dispatcher-token>"

# Driver performance
curl -X GET "http://localhost:3000/analytics/driver-performance?startDate=2024-01-01" \
  -H "Authorization: Bearer <dispatcher-token>"

# Fuel analytics
curl -X GET "http://localhost:3000/analytics/fuel-analytics?startDate=2024-01-01" \
  -H "Authorization: Bearer <dispatcher-token>"
```

### Admin Operations

```bash
# Get pending lorry verifications
curl -X GET http://localhost:3000/admin/lorries/pending \
  -H "Authorization: Bearer <admin-token>"

# Approve lorry
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"decision": "Approved"}'

# Reject lorry with reason
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Rejected",
    "reason": "Registration document is not clear"
  }'

# Get pending user verifications
curl -X GET http://localhost:3000/admin/users/pending \
  -H "Authorization: Bearer <admin-token>"

# Verify user
curl -X PATCH http://localhost:3000/admin/users/<user-id>/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"decision": "Verified"}'
```


## Development Best Practices

### 1. Monorepo Workflow

Always build the shared package before working on the backend:

```bash
# When starting work
cd haulhub-shared && npm run build && cd ../haulhub-backend

# When shared package changes
cd ../haulhub-shared && npm run build && cd ../haulhub-backend && npm test
```

### 2. Adding New Endpoints

```typescript
// 1. Define DTO in shared package or local dto/ folder
export class CreateEntityDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

// 2. Add controller method
@Post()
@Roles(UserRole.Dispatcher)
async create(
  @CurrentUser('userId') userId: string,
  @Body() dto: CreateEntityDto,
) {
  return this.service.create(userId, dto);
}

// 3. Implement service method
async create(userId: string, dto: CreateEntityDto) {
  // Business logic here
}

// 4. Write tests
describe('create', () => {
  it('should create entity', async () => {
    // Test implementation
  });
});
```

### 3. Error Handling

Use NestJS built-in exceptions:

```typescript
import { 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException,
  UnauthorizedException 
} from '@nestjs/common';

// Not found
throw new NotFoundException('Trip not found');

// Invalid input
throw new BadRequestException('Invalid date format');

// Permission denied
throw new ForbiddenException('You do not own this lorry');

// Authentication failed
throw new UnauthorizedException('Invalid credentials');
```

### 4. Validation

Use class-validator decorators in DTOs:

```typescript
import { IsString, IsNumber, IsPositive, IsDateString, IsOptional } from 'class-validator';

export class CreateTripDto {
  @IsString()
  pickupLocation: string;

  @IsDateString()
  scheduledPickupDatetime: string;

  @IsNumber()
  @IsPositive()
  brokerPayment: number;

  @IsNumber()
  @IsOptional()
  distance?: number;
}
```

### 5. AWS Service Usage

Access AWS clients through `AwsService`:

```typescript
constructor(private readonly awsService: AwsService) {}

async someMethod() {
  const dynamoClient = this.awsService.getDynamoDBClient();
  const s3Client = this.awsService.getS3Client();
  const cognitoClient = this.awsService.getCognitoClient();
  const cloudWatchClient = this.awsService.getCloudWatchClient();
}
```

### 6. CloudWatch Metrics

Emit custom metrics for monitoring:

```typescript
const metricData: MetricDatum[] = [{
  MetricName: 'QueryResponseTime',
  Value: responseTimeMs,
  Unit: 'Milliseconds',
  Timestamp: new Date(),
  Dimensions: [
    { Name: 'IndexName', Value: indexName },
    { Name: 'Service', Value: 'TripsService' },
  ],
}];

await cloudWatchClient.send(new PutMetricDataCommand({
  Namespace: 'HaulHub/Trips',
  MetricData: metricData,
}));
```

## Security Considerations

### Current Implementation

- **Authentication**: JWT tokens validated with Cognito JWKS
- **Authorization**: Role-based access control on all protected routes
- **Data Access**: Users can only access their own data (enforced in service layer)
- **Document Storage**: Presigned URLs with 15-minute expiration
- **CORS**: Restricted to CloudFront domain in production
- **Input Validation**: All DTOs validated with class-validator

### Future Enhancements

- Encryption at rest for sensitive data (banking info, SSN)
- Rate limiting for API endpoints
- Request logging and audit trails
- IP whitelisting for admin operations
- Multi-factor authentication

## Performance Optimization

### DynamoDB Query Optimization

- **Use GSIs for access patterns**: Avoid table scans
- **Composite sort keys**: Enable range queries (e.g., `TRIP#<date>#<id>`)
- **Index selection**: `IndexSelectorService` chooses optimal GSI
- **Batch operations**: Use BatchGetItem and BatchWriteItem when possible

### Lambda Cold Start Optimization

- **Connection reuse**: AWS clients initialized once and cached
- **Minimal dependencies**: Keep Lambda package size small
- **Lazy loading**: Load heavy modules only when needed

### Caching Strategy

- **JWKS caching**: Public keys cached for 10 minutes
- **Lambda instance reuse**: NestJS app cached between invocations
- **Future**: Consider ElastiCache for frequently accessed data


## Useful Scripts

```bash
# Development
npm run start:dev          # Run with hot-reload
npm start                  # Run without hot-reload

# Building
npm run build              # Standard build
npm run build:lambda       # Build for Lambda deployment

# Testing
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage report
npm test -- <pattern>      # Run tests matching pattern

# Data Management (from scripts/ directory)
../scripts/seed-brokers.sh              # Seed initial broker data
../scripts/seed-complete-database.sh    # Seed all tables with test data
../scripts/create-cognito-users.sh      # Create test users in Cognito
```

## Project Dependencies

### Core Dependencies

- `@nestjs/core`, `@nestjs/common`: NestJS framework
- `@nestjs/platform-express`: Express adapter for NestJS
- `@vendia/serverless-express`: Lambda wrapper for Express apps
- `@haulhub/shared`: Shared types, DTOs, and utilities

### AWS SDK

- `@aws-sdk/client-cognito-identity-provider`: Cognito operations
- `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`: DynamoDB operations
- `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`: S3 operations
- `@aws-sdk/client-cloudwatch`: CloudWatch metrics

### Validation & Transformation

- `class-validator`: DTO validation decorators
- `class-transformer`: Object transformation

### Authentication

- `jsonwebtoken`: JWT token handling
- `jwks-rsa`: JWKS client for Cognito public keys

### Testing

- `jest`: Test framework
- `ts-jest`: TypeScript support for Jest
- `fast-check`: Property-based testing
- `@nestjs/testing`: NestJS testing utilities

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow NestJS conventions (modules, controllers, services)
- Use dependency injection
- Write tests for all new features
- Document complex business logic

### Commit Guidelines

1. Build shared package if modified
2. Run tests and ensure they pass
3. Check TypeScript compilation
4. Write descriptive commit messages

### Pull Request Checklist

- [ ] Shared package built and tests pass
- [ ] Backend tests pass with coverage
- [ ] No TypeScript errors
- [ ] Environment variables documented
- [ ] API endpoints documented
- [ ] Error handling implemented
- [ ] Authorization checks in place

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [DynamoDB Single-Table Design](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Property-Based Testing with fast-check](https://github.com/dubzzz/fast-check)

## License

ISC

---

## Quick Reference

### User Roles
- `Admin`: System administration
- `Dispatcher`: Trip management
- `LorryOwner`: Vehicle ownership
- `Driver`: Trip execution

### Trip Statuses
- `Scheduled` → `PickedUp` → `InTransit` → `Delivered` → `Paid`

### Verification Statuses
- `Pending` → `Approved` / `Rejected` / `NeedsMoreEvidence`

### Common HTTP Status Codes
- `200 OK`: Successful GET/PATCH
- `201 Created`: Successful POST
- `204 No Content`: Successful DELETE
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing/invalid token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists

### Environment Variables
```bash
AWS_REGION                    # AWS region (e.g., us-east-1)
COGNITO_USER_POOL_ID         # Cognito User Pool ID
COGNITO_CLIENT_ID            # Cognito App Client ID
TRIPS_TABLE_NAME             # DynamoDB Trips table name
BROKERS_TABLE_NAME           # DynamoDB Brokers table name
LORRIES_TABLE_NAME           # DynamoDB Lorries table name
USERS_TABLE_NAME             # DynamoDB Users table name
S3_DOCUMENTS_BUCKET_NAME     # S3 bucket for documents
ALLOWED_ORIGINS              # CORS allowed origins (comma-separated)
NODE_ENV                     # Environment (development/production)
PORT                         # Local server port (default: 3000)
```

### Key Commands
```bash
# Setup
npm install
cd ../haulhub-shared && npm run build && cd ../haulhub-backend

# Development
npm run start:dev

# Testing
npm test
npm run test:cov

# Building
npm run build:lambda

# Deployment
cd ../haulhub-infrastructure && npm run deploy
```
