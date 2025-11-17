# HaulHub Shared

Shared TypeScript interfaces, types, enums, and DTOs for the HaulHub transportation management system.

## Overview

This package contains all shared type definitions used across the HaulHub ecosystem (backend, frontend, and infrastructure). It ensures type consistency and reduces code duplication.

## Installation

This package is used internally within the HaulHub monorepo:

```bash
npm install
```

## Usage

### In Backend (NestJS)

```typescript
import { UserRole, TripStatus, CreateTripDto, User } from '@haulhub/shared';

@Controller('trips')
export class TripsController {
  @Roles(UserRole.Dispatcher)
  @Post()
  async createTrip(@Body() createTripDto: CreateTripDto) {
    // ...
  }
}
```

### In Frontend (Angular)

```typescript
import { User, UserRole, Trip, TripStatus } from '@haulhub/shared';

export class UserProfileComponent {
  user: User;
  
  isDispatcher(): boolean {
    return this.user.role === UserRole.Dispatcher;
  }
}
```

## Package Structure

```
src/
├── enums/                          # Enumeration types
│   ├── user-role.enum.ts           # User roles (Admin, Dispatcher, etc.)
│   ├── verification-status.enum.ts # User verification statuses
│   ├── lorry-verification-status.enum.ts
│   ├── trip-status.enum.ts         # Trip statuses
│   └── index.ts
├── interfaces/                     # TypeScript interfaces
│   ├── user.interface.ts           # User entity
│   ├── trip.interface.ts           # Trip entity
│   ├── lorry.interface.ts          # Lorry entity
│   ├── broker.interface.ts         # Broker entity
│   └── index.ts
├── dtos/                           # Data Transfer Objects
│   ├── auth.dto.ts                 # Authentication DTOs
│   ├── user.dto.ts                 # User DTOs
│   ├── trip.dto.ts                 # Trip DTOs
│   ├── lorry.dto.ts                # Lorry DTOs
│   ├── broker.dto.ts               # Broker DTOs
│   └── index.ts
└── index.ts                        # Main export file
```

## Enums

### UserRole

```typescript
enum UserRole {
  Dispatcher = 'Dispatcher',
  LorryOwner = 'LorryOwner',
  Driver = 'Driver',
  Admin = 'Admin'
}
```

### VerificationStatus

```typescript
enum VerificationStatus {
  Pending = 'Pending',
  Verified = 'Verified',
  Rejected = 'Rejected'
}
```

### LorryVerificationStatus

```typescript
enum LorryVerificationStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
  NeedsMoreEvidence = 'NeedsMoreEvidence'
}
```

### TripStatus

```typescript
enum TripStatus {
  Scheduled = 'Scheduled',
  PickedUp = 'PickedUp',
  InTransit = 'InTransit',
  Delivered = 'Delivered',
  Paid = 'Paid'
}
```

## Interfaces

### User

```typescript
interface User {
  userId: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}
```

### Trip

```typescript
interface Trip {
  tripId: string;
  dispatcherId: string;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledPickupDatetime: string;
  brokerId: string;
  brokerName: string;
  lorryId: string;
  driverId: string;
  driverName: string;
  brokerPayment: number;
  lorryOwnerPayment: number;
  driverPayment: number;
  status: TripStatus;
  distance?: number;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Lorry

```typescript
interface Lorry {
  lorryId: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  verificationStatus: LorryVerificationStatus;
  verificationDocuments: DocumentMetadata[];
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentMetadata {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
}
```

### Broker

```typescript
interface Broker {
  brokerId: string;
  brokerName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## DTOs (Data Transfer Objects)

### Authentication DTOs

```typescript
class RegisterDto {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
}

class LoginDto {
  email: string;
  password: string;
}

class RefreshTokenDto {
  refreshToken: string;
}
```

### Trip DTOs

```typescript
class CreateTripDto {
  pickupLocation: string;
  dropoffLocation: string;
  scheduledPickupDatetime: string;
  brokerId: string;
  lorryId: string;
  driverId: string;
  driverName: string;
  brokerPayment: number;
  lorryOwnerPayment: number;
  driverPayment: number;
  distance?: number;
}

class UpdateTripStatusDto {
  status: TripStatus;
}

class TripFilters {
  startDate?: string;
  endDate?: string;
  brokerId?: string;
  lorryId?: string;
  driverId?: string;
  status?: TripStatus;
}
```

### Lorry DTOs

```typescript
class RegisterLorryDto {
  lorryId: string; // license plate
  make: string;
  model: string;
  year: number;
}

class VerifyLorryDto {
  decision: 'Approved' | 'Rejected' | 'NeedsMoreEvidence';
  reason?: string;
}
```

### User DTOs

```typescript
class UpdateUserProfileDto {
  fullName?: string;
  phoneNumber?: string;
}

class VerifyUserDto {
  decision: 'Verified' | 'Rejected';
  reason?: string;
}
```

### Broker DTOs

```typescript
class CreateBrokerDto {
  brokerName: string;
}

class UpdateBrokerDto {
  brokerName?: string;
  isActive?: boolean;
}
```

## Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

This generates the `dist/` directory with compiled JavaScript and type definitions.

## Watch Mode

Auto-rebuild on file changes:

```bash
npm run watch
```

## Clean Build

Remove compiled files:

```bash
npm run clean
```

## Type Safety

All types are exported from the main index file for easy importing:

```typescript
// Import everything
import * as HaulHub from '@haulhub/shared';

// Import specific types
import { User, UserRole, Trip, TripStatus } from '@haulhub/shared';

// Import DTOs
import { CreateTripDto, RegisterDto } from '@haulhub/shared';
```

## Validation

DTOs are designed to work with `class-validator` in the backend:

```typescript
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsNotEmpty()
  fullName: string;

  // ...
}
```

## Best Practices

1. **Always use enums for fixed values**: Use `UserRole`, `TripStatus`, etc. instead of string literals
2. **Keep interfaces in sync**: Update interfaces when database schema changes
3. **Use DTOs for API requests**: Separate DTOs from domain interfaces
4. **Export from index files**: Use barrel exports for clean imports
5. **Document complex types**: Add JSDoc comments for clarity

## Versioning

This package follows semantic versioning:
- **Major**: Breaking changes to interfaces or enums
- **Minor**: New interfaces, enums, or DTOs
- **Patch**: Bug fixes or documentation updates

## Dependencies

This package has minimal dependencies:
- `typescript`: TypeScript compiler (dev dependency only)

No runtime dependencies to keep the package lightweight.

## License

ISC
