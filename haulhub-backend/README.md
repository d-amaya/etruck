# HaulHub Backend

NestJS-based backend API for HaulHub transportation management system, designed for AWS Lambda deployment.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Authentication System](#authentication-system)
- [Module Overview](#module-overview)
- [Building](#building)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)

## Overview

The HaulHub backend is a serverless NestJS application that provides REST APIs for managing transportation logistics. It handles user authentication via AWS Cognito, stores data in DynamoDB, and manages documents in S3.

**Key Features:**
- JWT-based authentication with Cognito
- Role-based access control (Admin, Dispatcher, LorryOwner, Driver)
- Serverless architecture (AWS Lambda)
- Single-table DynamoDB design
- Presigned S3 URLs for document uploads
- Comprehensive input validation
- Type-safe with TypeScript

## Project Structure

```
src/
├── admin/              # Admin module (user/lorry verification, broker management)
├── auth/               # Authentication module (login, register, token management)
│   ├── guards/         # JWT and role-based guards
│   ├── decorators/     # Custom decorators (@Public, @Roles, @CurrentUser)
│   ├── dto/            # Data transfer objects
│   └── interfaces/     # TypeScript interfaces
├── config/             # Configuration module (environment variables, AWS clients)
├── lorries/            # Lorries module (registration, document management)
├── trips/              # Trips module (CRUD, status updates, reporting)
├── users/              # Users module (profile management)
├── app.module.ts       # Root application module
├── main.ts             # Standard NestJS entry point (for local development)
└── lambda.ts           # AWS Lambda handler entry point
```

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- AWS CLI configured with appropriate credentials
- AWS Cognito User Pool (created by infrastructure stack)
- DynamoDB table (created by infrastructure stack)
- S3 bucket for documents (created by infrastructure stack)

## Installation

```bash
npm install
```

## Environment Configuration

Create a `.env` file in the `haulhub-backend` directory:

```bash
# AWS Configuration
AWS_REGION=us-east-1

# Cognito Configuration
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_CLIENT_ID=your-client-id

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=HaulHub

# S3 Configuration
S3_DOCUMENTS_BUCKET_NAME=your-documents-bucket-name

# CORS Configuration
ALLOWED_ORIGINS=https://your-cloudfront-domain.cloudfront.net

# Application Configuration
NODE_ENV=development
PORT=3000
```

## Development

Run the application in development mode with hot-reload:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`.

## Authentication System

### Overview

The authentication system uses AWS Cognito for user management and JWT tokens for API authentication. All routes are protected by default using global guards.

### Components

#### Guards

**JwtAuthGuard**
- Validates Cognito JWT tokens using JWKS
- Verifies token signature with Cognito's public keys
- Checks token expiration
- Extracts user information (userId, email, role, username)
- Attaches user data to request object

**RolesGuard**
- Enforces role-based access control
- Checks if user has required role(s)
- Supports multiple roles per route
- Returns 403 Forbidden when user lacks required role

#### Decorators

**@Public()**
- Marks routes as public (bypasses JWT authentication)
- Use for login, register, and other unauthenticated endpoints

```typescript
@Public()
@Post('login')
async login(@Body() loginDto: LoginDto) {
  return this.authService.login(loginDto);
}
```

**@Roles(...roles)**
- Specifies which roles can access a route
- Accepts one or more UserRole values

```typescript
@Roles(UserRole.Admin)
@Get('users/pending')
async getPendingUsers() {
  return this.adminService.getPendingUsers();
}
```

**@CurrentUser()**
- Extracts authenticated user from request
- Can return entire user object or specific property

```typescript
@Get('profile')
async getProfile(@CurrentUser() user: CurrentUserData) {
  return this.usersService.getProfile(user.userId);
}

// Extract specific property
@Post('trips')
async createTrip(
  @CurrentUser('userId') userId: string,
  @Body() createTripDto: CreateTripDto,
) {
  return this.tripsService.createTrip(userId, createTripDto);
}
```

### Authentication Endpoints

#### POST /auth/register

Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "role": "Dispatcher"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully. Please check your email for verification.",
  "userId": "uuid-here"
}
```

#### POST /auth/login

Authenticate user and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "userId": "uuid-here",
  "role": "Dispatcher",
  "email": "user@example.com",
  "fullName": "John Doe"
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "userId": "uuid-here",
  "role": "Dispatcher",
  "email": "user@example.com",
  "fullName": "John Doe"
}
```

#### POST /auth/logout

Invalidate user session and tokens.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

### Token Validation Process

1. Extract token from `Authorization: Bearer <token>` header
2. Decode token header to get Key ID (kid)
3. Retrieve public key from Cognito JWKS endpoint
4. Verify token signature using RS256 algorithm
5. Check token expiration timestamp
6. Validate token type (must be access token)
7. Extract user claims and attach to request

### Error Responses

**401 Unauthorized**
- Missing authorization header
- Invalid token format
- Expired access token
- Invalid token signature

**403 Forbidden**
- User lacks required role
- Insufficient permissions

**Example:**
```json
{
  "statusCode": 401,
  "message": "Access token has expired",
  "error": "Unauthorized"
}
```

## Module Overview

### Auth Module
- User registration with Cognito
- Login and token generation
- Token refresh (1-year refresh token, 1-hour access token)
- JWT validation with JWKS
- Global authentication guards
- Role-based access control

### Trips Module
- Trip creation and management
- Role-based trip queries
- Status updates
- Payment reporting

### Lorries Module
- Lorry registration
- Document upload with presigned URLs
- Verification status tracking

### Users Module
- User profile management
- Profile updates

### Admin Module
- User verification
- Lorry verification
- Broker management

### Config Module
- Environment variable management
- AWS SDK client initialization (Cognito, DynamoDB, S3)

## Building

### Standard Build

```bash
npm run build
```

### Lambda Build

Build for AWS Lambda deployment:

```bash
npm run build:lambda
```

This creates a `dist/` directory with compiled code and package files ready for Lambda deployment.

## Testing

Tests are organized in a separate `test/` directory that mirrors the `src/` structure:

```
test/
├── unit/                    # Unit tests (mirrors src/ structure)
│   └── auth/
│       └── guards/
├── e2e/                     # End-to-end tests
└── README.md                # Test documentation
```

### Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# E2E tests
npm run test:e2e

# Watch mode
npm run test:watch

# Run specific test pattern
npm test -- --testPathPattern="guards"
```

### Test Coverage

Current test coverage includes:
- ✅ JwtAuthGuard (8 test cases)
- ✅ RolesGuard (6 test cases)
- ✅ BrokersService (10 test cases)
- ✅ TripsService (15 test cases)
- ✅ TripsController (6 test cases)
- **Total: 45 tests passing**
- Additional tests will be added as modules are implemented

**Coverage Goals:**
- Unit tests: 80%+ code coverage
- Critical paths: 100% coverage (authentication, authorization, payment calculations)

## Deployment

The backend is designed to run as an AWS Lambda function behind API Gateway. Deployment is handled by the CDK infrastructure in `haulhub-infrastructure`.

### Lambda Handler

The Lambda handler is located at `src/lambda.ts` and uses `@vendia/serverless-express` to wrap the NestJS application for Lambda execution.

### Deployment Steps

1. Build the backend: `npm run build:lambda`
2. Deploy infrastructure: `cd ../haulhub-infrastructure && npm run deploy`
3. The CDK will package and deploy the Lambda function automatically

## API Documentation

### Testing Protected Routes

When testing protected routes, include the JWT token in the Authorization header:

```bash
curl -X GET http://localhost:3000/users/me \
  -H "Authorization: Bearer eyJraWQiOiJ..."
```

### Available User Roles

```typescript
enum UserRole {
  Dispatcher = 'Dispatcher',
  LorryOwner = 'LorryOwner',
  Driver = 'Driver',
  Admin = 'Admin'
}
```

### CurrentUserData Interface

```typescript
interface CurrentUserData {
  userId: string;        // Cognito user ID (sub claim)
  email: string;         // User's email address
  role: string;          // User's role
  username: string;      // Cognito username
}
```

## Architecture

- **Framework**: NestJS with TypeScript
- **Deployment**: AWS Lambda with serverless-express
- **Authentication**: AWS Cognito with JWT tokens (JWKS validation)
- **Database**: AWS DynamoDB (single table design)
- **Storage**: AWS S3 for documents
- **Validation**: class-validator and class-transformer
- **Security**: Global guards, role-based access control, token validation

## Security Features

1. **Token Validation**: Proper JWT verification with Cognito public keys
2. **Key Caching**: Public keys cached for 10 minutes to reduce latency
3. **Global Protection**: All routes protected by default (opt-out with @Public)
4. **Type Safety**: TypeScript interfaces ensure type-safe user data access
5. **Error Handling**: Appropriate HTTP status codes for different scenarios
6. **No Token Storage**: Stateless authentication (tokens not stored server-side)
7. **CORS**: Configured to allow only CloudFront domain
8. **Input Validation**: Comprehensive validation using class-validator

## Best Practices

1. **Always use @Public() for public routes**: Explicitly mark public routes
2. **Use specific roles**: Be explicit about which roles can access each route
3. **Extract only what you need**: Use `@CurrentUser('userId')` when you only need the user ID
4. **Validate ownership**: Even with authentication, validate that users can only access their own resources
5. **Log authorization failures**: Monitor 403 errors to detect potential security issues

## Troubleshooting

### "Authorization header is missing"
- Ensure you're sending the `Authorization` header
- Format: `Authorization: Bearer <token>`

### "Access token has expired"
- Use the refresh token to obtain a new access token
- Access tokens expire after 1 hour

### "Invalid access token"
- Ensure you're using an access token, not a refresh token
- Verify the token hasn't been tampered with

### "Access denied. Required roles: ..."
- Check that your user has the required role
- Verify the role was correctly assigned during registration

---

# Brokers API

## Overview

The Brokers API provides endpoints for managing broker companies in the HaulHub system. Brokers are companies that advertise transportation deals, and dispatchers select from this list when creating trips.

## Endpoints

### GET /brokers

Retrieve all brokers in the system. Optionally filter to show only active brokers.

**Authentication:** Not required (public endpoint)

**Query Parameters:**
- `activeOnly` (optional): Set to `"true"` to filter only active brokers

**Response:**
```json
[
  {
    "brokerId": "uuid",
    "brokerName": "TQL (Total Quality Logistics)",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Example:**
```bash
# Get all brokers
curl http://localhost:3000/brokers

# Get only active brokers
curl http://localhost:3000/brokers?activeOnly=true
```

### GET /brokers/:id

Retrieve a specific broker by ID.

**Authentication:** Not required (public endpoint)

**Path Parameters:**
- `id`: Broker ID (UUID)

**Response:**
```json
{
  "brokerId": "uuid",
  "brokerName": "TQL (Total Quality Logistics)",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### POST /brokers

Create a new broker. Admin only.

**Authentication:** Required (Admin role)

**Request Body:**
```json
{
  "brokerName": "New Broker Company"
}
```

**Validation:**
- `brokerName`: Required, string, minimum 2 characters

**Response:** `201 Created`
```json
{
  "brokerId": "uuid",
  "brokerName": "New Broker Company",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### PATCH /brokers/:id

Update an existing broker. Admin only.

**Authentication:** Required (Admin role)

**Path Parameters:**
- `id`: Broker ID (UUID)

**Request Body:**
```json
{
  "brokerName": "Updated Broker Name",
  "isActive": false
}
```

**Validation:**
- `brokerName`: Optional, string, minimum 2 characters
- `isActive`: Optional, boolean

### DELETE /brokers/:id

Soft delete a broker by setting `isActive` to `false`. Admin only. Historical trip data referencing this broker is preserved.

**Authentication:** Required (Admin role)

**Path Parameters:**
- `id`: Broker ID (UUID)

**Response:** `204 No Content`

## Seeding Initial Brokers

To seed the database with initial broker data, run:

```bash
npm run seed:brokers
```

This will create the following brokers if none exist:
- TQL (Total Quality Logistics)
- C.H. Robinson
- XPO Logistics
- Coyote Logistics
- Echo Global Logistics

## Broker DynamoDB Schema

Brokers are stored in DynamoDB with the following structure:

**Primary Key:**
- `PK`: `BROKER#<brokerId>`
- `SK`: `METADATA`

**Attributes:**
- `brokerId`: UUID
- `brokerName`: String
- `isActive`: Boolean
- `createdAt`: ISO 8601 timestamp
- `updatedAt`: ISO 8601 timestamp

**Access Pattern:**
- Query all brokers: Query with `PK` begins with `BROKER#`
- Get specific broker: Get item with `PK=BROKER#<id>` and `SK=METADATA`

## Integration with Trips

When dispatchers create trips, they select a broker from the list of active brokers. The trip stores:
- `brokerId`: Reference to the broker
- `brokerName`: Denormalized broker name for display

This design allows:
1. Fast trip creation without additional lookups
2. Historical trip data remains intact even if broker is deleted
3. Broker name updates don't affect existing trips

---

# Lorries API

## Overview

The Lorries API provides endpoints for lorry owners to register their vehicles and upload verification documents. Admins can review and approve/reject lorry registrations. Documents are stored securely in S3 with presigned URLs for upload and viewing.

## Endpoints

### POST /lorries

Register a new lorry. Lorry Owner only.

**Authentication:** Required (LorryOwner role)

**Request Body:**
```json
{
  "lorryId": "ABC-1234",
  "make": "Freightliner",
  "model": "Cascadia",
  "year": 2020
}
```

**Validation:**
- `lorryId`: Required, string (license plate)
- `make`: Required, string
- `model`: Required, string
- `year`: Required, number, between 1900 and current year + 1

**Response:** `201 Created`
```json
{
  "lorryId": "ABC-1234",
  "ownerId": "uuid",
  "make": "Freightliner",
  "model": "Cascadia",
  "year": 2020,
  "verificationStatus": "Pending",
  "verificationDocuments": [],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `409 Conflict`: Lorry with this ID already registered for this owner
- `400 Bad Request`: Invalid year or missing required fields

### GET /lorries

Get all lorries for the current owner.

**Authentication:** Required (LorryOwner role)

**Response:** `200 OK`
```json
[
  {
    "lorryId": "ABC-1234",
    "ownerId": "uuid",
    "make": "Freightliner",
    "model": "Cascadia",
    "year": 2020,
    "verificationStatus": "Approved",
    "verificationDocuments": [
      {
        "documentId": "uuid",
        "fileName": "registration.pdf",
        "fileSize": 1024000,
        "contentType": "application/pdf",
        "uploadedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET /lorries/:id

Get a specific lorry by ID. Lorry Owner and Admin only.

**Authentication:** Required (LorryOwner or Admin role)

**Path Parameters:**
- `id`: Lorry ID (license plate)

**Authorization:**
- Lorry owners can only access their own lorries
- Admins can access any lorry (to be implemented in task 13)

**Response:** `200 OK`
```json
{
  "lorryId": "ABC-1234",
  "ownerId": "uuid",
  "make": "Freightliner",
  "model": "Cascadia",
  "year": 2020,
  "verificationStatus": "Approved",
  "verificationDocuments": [...],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `403 Forbidden`: User does not own this lorry
- `404 Not Found`: Lorry not found

### POST /lorries/:id/documents

Generate a presigned S3 URL for uploading a verification document. Lorry Owner only.

**Authentication:** Required (LorryOwner role)

**Path Parameters:**
- `id`: Lorry ID (license plate)

**Request Body:**
```json
{
  "fileName": "registration.pdf",
  "fileSize": 1024000,
  "contentType": "application/pdf"
}
```

**Validation:**
- `fileName`: Required, string
- `fileSize`: Required, number, maximum 10MB (10485760 bytes)
- `contentType`: Required, string

**Response:** `201 Created`
```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/lorries/ABC-1234/documents/uuid?X-Amz-Algorithm=...",
  "documentId": "uuid",
  "expiresIn": 900
}
```

**Usage:**
1. Call this endpoint to get a presigned URL
2. Use the `uploadUrl` to upload the file directly to S3 via PUT request
3. The document metadata is automatically stored in DynamoDB
4. The lorry's `verificationDocuments` array is updated

**Example Upload:**
```bash
# Step 1: Get presigned URL
curl -X POST http://localhost:3000/lorries/ABC-1234/documents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "registration.pdf",
    "fileSize": 1024000,
    "contentType": "application/pdf"
  }'

# Step 2: Upload file to S3 using presigned URL
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @registration.pdf
```

**Error Responses:**
- `400 Bad Request`: File size exceeds 10MB limit
- `403 Forbidden`: User does not own this lorry
- `404 Not Found`: Lorry not found

### GET /lorries/:id/documents

Get all documents for a lorry. Lorry Owner and Admin only.

**Authentication:** Required (LorryOwner or Admin role)

**Path Parameters:**
- `id`: Lorry ID (license plate)

**Authorization:**
- Lorry owners can only access documents for their own lorries
- Admins can access documents for any lorry

**Response:** `200 OK`
```json
[
  {
    "documentId": "uuid",
    "fileName": "registration.pdf",
    "fileSize": 1024000,
    "contentType": "application/pdf",
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Error Responses:**
- `403 Forbidden`: User does not have permission to access these documents

### GET /lorries/:id/documents/:docId

Generate a presigned S3 URL for viewing a verification document. Lorry Owner and Admin only.

**Authentication:** Required (LorryOwner or Admin role)

**Path Parameters:**
- `id`: Lorry ID (license plate)
- `docId`: Document ID (UUID)

**Authorization:**
- Lorry owners can only view documents for their own lorries
- Admins can view documents for any lorry

**Response:** `200 OK`
```json
{
  "viewUrl": "https://bucket.s3.amazonaws.com/lorries/ABC-1234/documents/uuid?X-Amz-Algorithm=..."
}
```

**Usage:**
1. Call this endpoint to get a presigned URL
2. Use the `viewUrl` to download/view the file directly from S3
3. The URL expires after 15 minutes

**Example:**
```bash
# Get presigned URL for viewing
curl -X GET http://localhost:3000/lorries/ABC-1234/documents/uuid \
  -H "Authorization: Bearer <token>"

# Download the file using the presigned URL
curl "<viewUrl>" -o document.pdf
```

**Error Responses:**
- `403 Forbidden`: User does not have permission to access this document
- `404 Not Found`: Document not found

## Lorry Verification Status

Lorries can have the following verification statuses:

```typescript
enum LorryVerificationStatus {
  Pending = 'Pending',              // Initial status after registration
  Approved = 'Approved',            // Admin approved the lorry
  Rejected = 'Rejected',            // Admin rejected the lorry
  NeedsMoreEvidence = 'NeedsMoreEvidence'  // Admin needs more documents
}
```

## DynamoDB Schema

### Lorry Entity

**Primary Key:**
- `PK`: `LORRY_OWNER#<ownerId>`
- `SK`: `LORRY#<lorryId>`

**GSI3 (Verification Status Index):**
- `GSI3PK`: `LORRY_STATUS#<verificationStatus>`
- `GSI3SK`: `LORRY#<lorryId>`

**Attributes:**
- `lorryId`: String (license plate)
- `ownerId`: String (UUID)
- `make`: String
- `model`: String
- `year`: Number
- `verificationStatus`: Enum
- `verificationDocuments`: Array of DocumentMetadata
- `rejectionReason`: String (optional)
- `createdAt`: ISO 8601 timestamp
- `updatedAt`: ISO 8601 timestamp

### Document Metadata Entity

**Primary Key:**
- `PK`: `LORRY#<lorryId>`
- `SK`: `DOCUMENT#<documentId>`

**Attributes:**
- `documentId`: String (UUID)
- `lorryId`: String (license plate)
- `ownerId`: String (UUID)
- `s3Key`: String (S3 object key)
- `fileName`: String
- `fileSize`: Number (bytes)
- `contentType`: String (MIME type)
- `uploadedAt`: ISO 8601 timestamp

## S3 Document Storage

Documents are stored in S3 with the following structure:

```
s3://documents-bucket/
  lorries/
    ABC-1234/
      documents/
        uuid-1/
        uuid-2/
```

**Security:**
- Bucket has public access blocked
- All access via presigned URLs only
- Upload URLs expire after 15 minutes
- View URLs expire after 15 minutes
- Encryption at rest enabled

## Access Patterns

1. **Register lorry**: Insert into DynamoDB with PK and GSI3
2. **Get lorries by owner**: Query by PK `LORRY_OWNER#<ownerId>`
3. **Get lorry by ID and owner**: Get item with PK and SK
4. **Get pending lorries (Admin)**: Query GSI3 with `GSI3PK=LORRY_STATUS#Pending`
5. **Upload document**: Generate presigned URL, store metadata in DynamoDB
6. **Get documents for lorry**: Query by PK `LORRY#<lorryId>` with SK begins with `DOCUMENT#`
7. **View document**: Get document metadata, generate presigned URL for S3 object

---

# Trips API

## Overview

The Trips API provides endpoints for managing transportation trips. Dispatchers can create and manage trips, while drivers and lorry owners can view trips relevant to them. The API supports trip creation, updates, status management, and payment reporting.

## Endpoints

### POST /trips

Create a new trip. Dispatcher only.

**Authentication:** Required (Dispatcher role)

**Request Body:**
```json
{
  "pickupLocation": "123 Main St, Los Angeles, CA",
  "dropoffLocation": "456 Oak Ave, San Francisco, CA",
  "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
  "brokerId": "uuid",
  "lorryId": "ABC-1234",
  "driverId": "DRV-001",
  "driverName": "John Doe",
  "brokerPayment": 2500.00,
  "lorryOwnerPayment": 1500.00,
  "driverPayment": 800.00,
  "distance": 380
}
```

**Validation:**
- `pickupLocation`: Required, string
- `dropoffLocation`: Required, string
- `scheduledPickupDatetime`: Required, ISO 8601 datetime string
- `brokerId`: Required, string (must be a valid broker ID)
- `lorryId`: Required, string (license plate)
- `driverId`: Required, string (driver identifier)
- `driverName`: Required, string
- `brokerPayment`: Required, positive number
- `lorryOwnerPayment`: Required, positive number
- `driverPayment`: Required, positive number
- `distance`: Optional, number (miles)

**Response:** `201 Created`
```json
{
  "tripId": "uuid",
  "dispatcherId": "uuid",
  "pickupLocation": "123 Main St, Los Angeles, CA",
  "dropoffLocation": "456 Oak Ave, San Francisco, CA",
  "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
  "brokerId": "uuid",
  "brokerName": "TQL (Total Quality Logistics)",
  "lorryId": "ABC-1234",
  "driverId": "DRV-001",
  "driverName": "John Doe",
  "brokerPayment": 2500.00,
  "lorryOwnerPayment": 1500.00,
  "driverPayment": 800.00,
  "status": "Scheduled",
  "distance": 380,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing required fields, invalid datetime format, or negative payment amounts
- `400 Bad Request`: Broker ID not found

**Example:**
```bash
curl -X POST http://localhost:3000/trips \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": "123 Main St, Los Angeles, CA",
    "dropoffLocation": "456 Oak Ave, San Francisco, CA",
    "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
    "brokerId": "uuid",
    "lorryId": "ABC-1234",
    "driverId": "DRV-001",
    "driverName": "John Doe",
    "brokerPayment": 2500.00,
    "lorryOwnerPayment": 1500.00,
    "driverPayment": 800.00,
    "distance": 380
  }'
```

### GET /trips/:id

Get a specific trip by ID.

**Authentication:** Required (Dispatcher, Driver, LorryOwner, or Admin role)

**Path Parameters:**
- `id`: Trip ID (UUID)

**Authorization:**
- Dispatchers can only access trips they created
- Drivers can access trips assigned to them (to be implemented in task 17)
- Lorry owners can access trips involving their lorries (to be implemented in task 17)
- Admins can access any trip

**Response:** `200 OK`
```json
{
  "tripId": "uuid",
  "dispatcherId": "uuid",
  "pickupLocation": "123 Main St, Los Angeles, CA",
  "dropoffLocation": "456 Oak Ave, San Francisco, CA",
  "scheduledPickupDatetime": "2024-02-15T08:00:00.000Z",
  "brokerId": "uuid",
  "brokerName": "TQL (Total Quality Logistics)",
  "lorryId": "ABC-1234",
  "driverId": "DRV-001",
  "driverName": "John Doe",
  "brokerPayment": 2500.00,
  "lorryOwnerPayment": 1500.00,
  "driverPayment": 800.00,
  "status": "Scheduled",
  "distance": 380,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Trip not found
- `400 Bad Request`: Getting trip by ID for non-dispatcher roles requires using GET /trips with filters (to be implemented in task 17)

**Note:** Currently, only dispatchers can retrieve trips by ID directly. Other roles should use the GET /trips endpoint with filters (to be implemented in task 17).

### PATCH /trips/:id

Update trip details. Dispatcher only.

**Authentication:** Required (Dispatcher role)

**Path Parameters:**
- `id`: Trip ID (UUID)

**Request Body:** (all fields optional)
```json
{
  "pickupLocation": "Updated pickup location",
  "dropoffLocation": "Updated dropoff location",
  "scheduledPickupDatetime": "2024-02-16T09:00:00.000Z",
  "brokerId": "new-broker-uuid",
  "lorryId": "XYZ-5678",
  "driverId": "DRV-002",
  "driverName": "Jane Smith",
  "brokerPayment": 2600.00,
  "lorryOwnerPayment": 1600.00,
  "driverPayment": 850.00,
  "distance": 400
}
```

**Validation:**
- All fields are optional
- If provided, `scheduledPickupDatetime` must be valid ISO 8601 format
- If provided, payment amounts must be positive numbers
- If `brokerId` is provided, it must be a valid broker ID

**Authorization:**
- Only the dispatcher who created the trip can update it

**Response:** `200 OK`
```json
{
  "tripId": "uuid",
  "dispatcherId": "uuid",
  "pickupLocation": "Updated pickup location",
  "dropoffLocation": "Updated dropoff location",
  ...
  "updatedAt": "2024-01-02T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Trip not found or user is not the dispatcher who created it
- `400 Bad Request`: Invalid datetime format or negative payment amounts

**Example:**
```bash
curl -X PATCH http://localhost:3000/trips/uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": "Updated pickup location",
    "brokerPayment": 2600.00
  }'
```

## Trip Status Values

Trips can have the following status values:

```typescript
enum TripStatus {
  Scheduled = 'Scheduled',      // Initial status after creation
  PickedUp = 'PickedUp',        // Driver picked up the load
  InTransit = 'InTransit',      // Load is in transit
  Delivered = 'Delivered',      // Load delivered to destination
  Paid = 'Paid'                 // Payment completed
}
```

**Status Updates:** To be implemented in task 16 (PATCH /trips/:id/status)

## DynamoDB Schema

### Trip Entity

**Primary Key:**
- `PK`: `DISPATCHER#<dispatcherId>`
- `SK`: `TRIP#<scheduledDate>#<tripId>`

**GSI1 (Driver Index):**
- `GSI1PK`: `DRIVER#<driverId>`
- `GSI1SK`: `TRIP#<scheduledDate>#<tripId>`

**GSI2 (Lorry Index):**
- `GSI2PK`: `LORRY#<lorryId>`
- `GSI2SK`: `TRIP#<scheduledDate>#<tripId>`

**Attributes:**
- `tripId`: String (UUID)
- `dispatcherId`: String (UUID)
- `pickupLocation`: String
- `dropoffLocation`: String
- `scheduledPickupDatetime`: ISO 8601 timestamp
- `brokerId`: String (UUID)
- `brokerName`: String (fetched from broker record)
- `lorryId`: String (license plate)
- `driverId`: String (driver identifier)
- `driverName`: String
- `brokerPayment`: Number (amount broker pays dispatcher)
- `lorryOwnerPayment`: Number (amount dispatcher pays lorry owner)
- `driverPayment`: Number (amount dispatcher pays driver)
- `status`: Enum (TripStatus)
- `distance`: Number (optional, miles)
- `deliveredAt`: ISO 8601 timestamp (optional, set when status changes to Delivered)
- `createdAt`: ISO 8601 timestamp
- `updatedAt`: ISO 8601 timestamp

## Access Patterns

1. **Create trip**: Insert into DynamoDB with PK, SK, GSI1, and GSI2
2. **Get trip by ID (dispatcher)**: Query by PK `DISPATCHER#<dispatcherId>` with SK contains tripId
3. **Get trips by dispatcher**: Query by PK `DISPATCHER#<dispatcherId>` (to be implemented in task 17)
4. **Get trips by driver**: Query GSI1 by `GSI1PK=DRIVER#<driverId>` (to be implemented in task 17)
5. **Get trips by lorry**: Query GSI2 by `GSI2PK=LORRY#<lorryId>` (to be implemented in task 17)
6. **Update trip**: Update item with PK and SK
7. **Update trip status**: Update status attribute (to be implemented in task 16)

## Future Endpoints

The following endpoints will be implemented in upcoming tasks:

- **PATCH /trips/:id/status** (Task 16): Update trip status with validation
- **GET /trips** (Task 17): Get trips with role-based filtering and pagination
- **GET /trips/reports/payments** (Task 18): Generate payment reports for all roles

---

# Admin API

## Overview

The Admin API provides endpoints for system administrators to manage user verifications, lorry verifications, and broker lists. All admin endpoints require the Admin role.

## Endpoints

### GET /admin/dashboard

Get admin dashboard summary.

**Authentication:** Required (Admin role)

**Response:** `200 OK`
```json
{
  "message": "Admin dashboard",
  "adminUser": {
    "userId": "uuid",
    "email": "admin@example.com",
    "role": "Admin"
  }
}
```

### GET /admin/lorries/pending

Get all lorries with pending verification status (Pending or NeedsMoreEvidence).

**Authentication:** Required (Admin role)

**Response:** `200 OK`
```json
[
  {
    "lorryId": "ABC-1234",
    "ownerId": "uuid",
    "make": "Freightliner",
    "model": "Cascadia",
    "year": 2020,
    "verificationStatus": "Pending",
    "verificationDocuments": [
      {
        "documentId": "uuid",
        "fileName": "registration.pdf",
        "fileSize": 1024000,
        "contentType": "application/pdf",
        "uploadedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Query Details:**
- Uses GSI3 (Verification Status Index) for efficient querying
- Queries both `LORRY_STATUS#Pending` and `LORRY_STATUS#NeedsMoreEvidence`
- Returns combined results

### PATCH /admin/lorries/:id/verify

Approve, reject, or request more evidence for a lorry registration.

**Authentication:** Required (Admin role)

**Path Parameters:**
- `id`: Lorry ID (license plate)

**Request Body:**
```json
{
  "decision": "Approved",
  "reason": "Optional rejection reason"
}
```

**Validation:**
- `decision`: Required, must be one of: `"Approved"`, `"Rejected"`, `"NeedsMoreEvidence"`
- `reason`: Required when decision is `"Rejected"` or `"NeedsMoreEvidence"`

**Response:** `200 OK`
```json
{
  "lorryId": "ABC-1234",
  "ownerId": "uuid",
  "make": "Freightliner",
  "model": "Cascadia",
  "year": 2020,
  "verificationStatus": "Approved",
  "verificationDocuments": [...],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Example - Approve:**
```bash
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Approved"
  }'
```

**Example - Reject:**
```bash
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Rejected",
    "reason": "Registration document is not clear enough"
  }'
```

**Example - Request More Evidence:**
```bash
curl -X PATCH http://localhost:3000/admin/lorries/ABC-1234/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "NeedsMoreEvidence",
    "reason": "Please provide proof of insurance"
  }'
```

**Error Responses:**
- `400 Bad Request`: Invalid decision or missing reason when required
- `404 Not Found`: Lorry not found
- `403 Forbidden`: User does not have Admin role

**Behavior:**
- Updates lorry verification status in DynamoDB
- Updates GSI3 index to reflect new status
- Stores rejection reason if provided
- Removes rejection reason when approved
- Updates `updatedAt` timestamp

## Lorry Verification Workflow

1. **Lorry Owner registers lorry**: Status set to `Pending`
2. **Lorry Owner uploads documents**: Documents stored in S3, metadata in DynamoDB
3. **Admin queries pending lorries**: Uses GSI3 to find all pending lorries
4. **Admin views documents**: Generates presigned URLs to view documents in S3
5. **Admin makes decision**:
   - **Approve**: Status changes to `Approved`, lorry can be used in trips
   - **Reject**: Status changes to `Rejected`, reason stored
   - **Request More Evidence**: Status changes to `NeedsMoreEvidence`, reason stored
6. **Lorry Owner sees status**: Can view status and reason in their lorry list
7. **If more evidence needed**: Lorry Owner uploads additional documents, status remains `NeedsMoreEvidence` until admin reviews again

## DynamoDB Access Patterns

### Query Pending Lorries

Uses GSI3 (Verification Status Index):

```
GSI3PK = LORRY_STATUS#Pending
GSI3PK = LORRY_STATUS#NeedsMoreEvidence
```

This allows efficient querying without scanning the entire table.

### Update Lorry Status

Updates both the main table and GSI3:

```
PK: LORRY_OWNER#<ownerId>
SK: LORRY#<lorryId>
GSI3PK: LORRY_STATUS#<newStatus>
GSI3SK: LORRY#<lorryId>
```

The GSI3PK is updated to reflect the new status, allowing the lorry to appear in the correct admin queries.

## Requirements Mapping

This implementation satisfies the following requirements:

- **12.1**: Admin can view pending lorry registrations (GET /admin/lorries/pending)
- **12.2**: Admin can view lorry details and documents (uses existing GET /lorries/:id/documents/:docId)
- **12.3**: Admin can approve lorry registration (PATCH with decision="Approved")
- **12.4**: Admin can reject lorry registration with reason (PATCH with decision="Rejected")
- **12.5**: Admin can request more evidence (PATCH with decision="NeedsMoreEvidence")

## User Verification

### GET /admin/users/pending

Get all users with pending verification status.

**Authentication:** Required (Admin role)

**Response:** `200 OK`
```json
[
  {
    "userId": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "phoneNumber": "+12345678901",
    "role": "Dispatcher",
    "verificationStatus": "Pending",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Query Details:**
- Scans the table for users with `verificationStatus = Pending`
- Filters for items where `PK` begins with `USER#` and `SK = PROFILE`
- Note: For production with large datasets, consider adding GSI4 for user status queries

**Example:**
```bash
curl -X GET http://localhost:3000/admin/users/pending \
  -H "Authorization: Bearer <admin-token>"
```

### PATCH /admin/users/:id/verify

Verify or reject a user identity.

**Authentication:** Required (Admin role)

**Path Parameters:**
- `id`: User ID (UUID)

**Request Body:**
```json
{
  "decision": "Verified",
  "reason": "Optional rejection reason"
}
```

**Validation:**
- `decision`: Required, must be one of: `"Verified"`, `"Rejected"`
- `reason`: Required when decision is `"Rejected"`

**Response:** `200 OK`
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "fullName": "John Doe",
  "phoneNumber": "+12345678901",
  "role": "Dispatcher",
  "verificationStatus": "Verified",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Example - Verify:**
```bash
curl -X PATCH http://localhost:3000/admin/users/uuid/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Verified"
  }'
```

**Example - Reject:**
```bash
curl -X PATCH http://localhost:3000/admin/users/uuid/verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Rejected",
    "reason": "Unable to verify identity with provided information"
  }'
```

**Error Responses:**
- `400 Bad Request`: Invalid decision or missing reason when required
- `404 Not Found`: User not found
- `403 Forbidden`: User does not have Admin role

**Behavior:**
- Updates user verification status in DynamoDB
- Stores rejection reason if provided
- Removes rejection reason when verified
- Updates `updatedAt` timestamp

## User Verification Workflow

1. **User registers**: Status set to `Pending`
2. **Admin queries pending users**: Scans table to find all pending users
3. **Admin reviews user profile**: Views user information (name, email, phone, role)
4. **Admin makes decision**:
   - **Verify**: Status changes to `Verified`, user can access protected features
   - **Reject**: Status changes to `Rejected`, reason stored
5. **User sees status**: Rejected users see message indicating verification is required

## User Verification Status

Users can have the following verification statuses:

```typescript
enum VerificationStatus {
  Pending = 'Pending',      // Initial status after registration
  Verified = 'Verified',    // Admin verified the user
  Rejected = 'Rejected'     // Admin rejected the user
}
```

## DynamoDB Schema for Users

**Primary Key:**
- `PK`: `USER#<userId>`
- `SK`: `PROFILE`

**Attributes:**
- `userId`: String (UUID)
- `email`: String
- `fullName`: String
- `phoneNumber`: String
- `role`: Enum (Dispatcher, LorryOwner, Driver, Admin)
- `verificationStatus`: Enum (Pending, Verified, Rejected)
- `rejectionReason`: String (optional)
- `createdAt`: ISO 8601 timestamp
- `updatedAt`: ISO 8601 timestamp

## Requirements Mapping

This implementation satisfies the following requirements:

- **13.1**: Admin can view pending user verifications (GET /admin/users/pending)
- **13.2**: Admin can view user profile information (included in pending users response)
- **13.3**: Admin can verify a user (PATCH with decision="Verified")
- **13.4**: Admin can reject a user with reason (PATCH with decision="Rejected")
- **13.5**: Rejected users see verification required message (enforced at application level)

---

# Testing

Tests are organized in a separate `test/` directory that mirrors the `src/` structure:

```
test/
├── unit/                    # Unit tests (mirrors src/ structure)
│   ├── auth/
│   │   └── guards/
│   └── admin/
├── e2e/                     # End-to-end tests
└── README.md                # Test documentation
```

## Test Organization

### Unit Tests (`test/unit/`)

Unit tests mirror the `src/` directory structure exactly. For example:

- Source: `src/auth/guards/jwt-auth.guard.ts`
- Test: `test/unit/auth/guards/jwt-auth.guard.spec.ts`

This makes it easy to:
- Find tests for any source file
- Maintain parallel structures
- Keep source directories clean

### E2E Tests (`test/e2e/`)

End-to-end tests will be added here for testing complete user flows and API integration.

## Writing Tests

### Import Paths

When importing source files in tests, use relative paths from the test file to the source file:

```typescript
// test/unit/auth/guards/jwt-auth.guard.spec.ts
import { JwtAuthGuard } from '../../../../src/auth/guards/jwt-auth.guard';
import { AuthService } from '../../../../src/auth/auth.service';
```

### Test File Naming

- Unit tests: `*.spec.ts`
- E2E tests: `*.e2e-spec.ts`

### Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
describe('ComponentName', () => {
  let component: ComponentType;
  
  beforeEach(() => {
    // Arrange: Set up test dependencies
  });

  it('should do something', () => {
    // Arrange: Set up test data
    const input = 'test';
    
    // Act: Execute the code under test
    const result = component.doSomething(input);
    
    // Assert: Verify the result
    expect(result).toBe('expected');
  });
});
```

## Test Coverage Goals

- **Unit Tests**: 80%+ code coverage
- **Critical Paths**: 100% coverage (authentication, authorization, payment calculations)
- **Edge Cases**: Test error handling and boundary conditions

## Current Test Coverage

- ✅ AuthService: 10 test cases
- ✅ AuthController: 10 test cases
- ✅ JwtAuthGuard: 8 test cases
- ✅ RolesGuard: 6 test cases
- ✅ BrokersService: 10 test cases
- ✅ BrokersController: 7 test cases
- ✅ UsersService: 10 test cases
- ✅ UsersController: 4 test cases
- ✅ LorriesService: 14 test cases
- ✅ LorriesController: 7 test cases
- ✅ TripsService: 15 test cases
- ✅ TripsController: 6 test cases
- ✅ AdminService: 16 test cases
- **Total: 123 tests passing across 13 test suites**
- All completed backend modules have comprehensive test coverage

## Best Practices

1. **One test file per source file**: Keep tests focused and organized
2. **Descriptive test names**: Use clear, descriptive test names that explain what is being tested
3. **Mock external dependencies**: Use mocks for AWS services, databases, etc.
4. **Test behavior, not implementation**: Focus on what the code does, not how it does it
5. **Keep tests independent**: Each test should be able to run in isolation
6. **Clean up after tests**: Use `afterEach` to reset mocks and clean up state

## Mocking

### Mock Services

```typescript
const mockAuthService = {
  validateToken: jest.fn(),
  login: jest.fn(),
};
```

### Mock AWS SDK

```typescript
const mockCognitoClient = {
  send: jest.fn(),
};
```

### Mock Request/Response

```typescript
const mockRequest = {
  headers: { authorization: 'Bearer token' },
  user: undefined,
};
```

## Debugging Tests

### Run Tests in Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach your debugger (VS Code, Chrome DevTools, etc.)

### Verbose Output

```bash
npm test -- --verbose
```

### Only Run Failed Tests

```bash
npm test -- --onlyFailures
```

---

## License

ISC
