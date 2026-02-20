# eTrucky Hierarchy Redesign — Implementation Plan

**Date**: 2026-02-20
**Design Document**: `planning/2026-02-20-hierarchy-redesign/design.md`
**Git Baseline**: commit `0b0a30c` on `main`

---

## Overview

Redesign eTrucky from a carrier-centric hierarchy (Carrier → Dispatcher/Driver/TruckOwner) to an admin-centric hierarchy (Admin → Dispatcher → Carrier → Driver). This involves changes across all layers: shared types, infrastructure (new DynamoDB tables), backend (NestJS services/controllers), frontend (Angular dashboards), and seed data.

## Current State Analysis

- 5 DynamoDB tables with old schema (`eTrucky-Trips`, `eTrucky-Users`, `eTrucky-Trucks`, `eTrucky-Trailers`, `eTrucky-Brokers`)
- `UserRole` enum includes `TruckOwner` and `LorryOwner` (to be removed)
- `TripStatus` enum has old statuses (`PickedUp`, `InTransit`, `Paid`)
- `Trip` interface has ~15 waste fields (`truckOwnerId`, factory fields, etc.)
- Financial model uses `brokerPayment` as the order rate with no Admin/Carrier payment split
- Frontend has `features/truck-owner/` module (to be deleted entirely)
- Admin module has verification workflows and broker CRUD (to be removed)
- All services reference `truckOwnerId` throughout

### Key Discoveries:
- `database-stack.ts:1-353` — All 5 old table definitions with GSIs
- `trip.interface.ts:3-85` — Full old Trip interface with waste fields
- `user-role.enum.ts:1-8` — Has TruckOwner, LorryOwner
- `trip-status.enum.ts:1-8` — Has PickedUp, InTransit, Paid
- `trips.service.ts` — Largest file, ~364 score, contains `filterTripForTruckOwner`, old financial logic
- `users.service.ts:22-27` — Duplicated UserRole enum (CARRIER, DISPATCHER, DRIVER, TRUCK_OWNER)
- `workflow-rules.interface.ts` — Old status transitions referencing `admin` as system admin role
- `payment-report.interface.ts` — Has `TruckOwnerPaymentReport`, old groupBy options
- `config.service.ts` — Has `tripsTableName`, `lorriesTableName` getters (need new table name getters)
- Frontend `features/truck-owner/` — 7 sub-components to delete
- Frontend `features/admin/` — 3 sub-modules to delete (lorry-verification, user-verification, broker-management)

## Desired End State

- 5 new DynamoDB tables (`eTruckyOrders`, `eTruckyUsers`, `eTruckyTrucks`, `eTruckyTrailers`, `eTruckyBrokers`) with correct GSIs
- 4 roles only: Admin, Dispatcher, Carrier, Driver
- New financial model: Admin+Dispatcher=10%, Carrier=90%, complementary rate editing
- New order statuses: Scheduled, Picking Up, Transit, Delivered, Waiting RC, Ready To Pay, Canceled
- Role-based field visibility and editing permissions
- Placeholder/claim registration flow
- Client-side asset caching with entity resolution endpoint
- Per-role dashboards with correct columns, filters, and profit metrics
- Seed data with new hierarchy (2 Admins, 3 Dispatchers, 3 Carriers, 6-8 Drivers, etc.)

### Verification:
- All shared types compile with no TruckOwner/LorryOwner references
- CDK deploys 5 new tables alongside old ones
- Backend starts locally, connects to new tables
- Seed script populates new tables with correct hierarchy
- Each role's dashboard shows correct columns, filters, and financial data
- Create Order form works with Carrier-first cascading dropdowns
- Registration/claim flow works for placeholder accounts
- Entity resolution endpoint resolves any UUID to display info

## What We're NOT Doing

- Email change after registration (deferred to post-launch)
- Driver transfer between Carriers UI (deferred — `pendingCarrierId` field added but no UI)
- Mobile app changes
- Old table migration (old tables remain untouched for rollback)
- Document management changes (documents module stays as-is)
- Fuel service changes (fuel module stays as-is)

## Implementation Approach

Incremental, bottom-up: shared types first (foundation), then infrastructure (tables), then backend (services/controllers), then frontend (dashboards), then seed data. Each phase produces a compilable, testable increment.

---

## Checklist

- [x] Phase 1: Shared Types
- [x] Phase 2: Infrastructure (CDK + Config)
- [x] Phase 3: Backend — Auth & Users
- [x] Phase 4: Backend — Orders Service
- [x] Phase 5: Backend — Carrier, Admin, Brokers Controllers
- [x] Phase 6: Backend — Analytics
- [x] Phase 7: Frontend — Core, Auth, Routes
- [x] Phase 8: Frontend — Dashboards & Forms
- [x] Phase 9 (partial): Seed Script Written

---

## Phase 1: Shared Types

### Overview
Update all enums, interfaces, and DTOs in `haulhub-shared/`. This is the foundation — everything else depends on these types compiling correctly.

### Changes Required:

#### 1. UserRole Enum
**File**: `haulhub-shared/src/enums/user-role.enum.ts`
**Changes**: Remove `TruckOwner`, `LorryOwner`. Keep `Admin`, `Dispatcher`, `Carrier`, `Driver`.

```typescript
export enum UserRole {
  Admin = 'Admin',
  Dispatcher = 'Dispatcher',
  Carrier = 'Carrier',
  Driver = 'Driver',
}
```

#### 2. OrderStatus Enum (rename from TripStatus)
**File**: `haulhub-shared/src/enums/trip-status.enum.ts` → rename to `order-status.enum.ts`
**Changes**: Replace all old statuses with new ones.

```typescript
export enum OrderStatus {
  Scheduled = 'Scheduled',
  PickingUp = 'Picking Up',
  Transit = 'Transit',
  Delivered = 'Delivered',
  WaitingRC = 'Waiting RC',
  ReadyToPay = 'Ready To Pay',
  Canceled = 'Canceled',
}
```

#### 3. Order Interface (rename from Trip)
**File**: `haulhub-shared/src/interfaces/trip.interface.ts` → rename to `order.interface.ts`
**Changes**: New interface per design document Section 6. Remove all waste fields. Add `adminId`, `invoiceNumber`, `brokerLoad`, `adminRate`, `adminPayment`, `carrierRate`, `carrierPayment`, `lastModifiedBy`. Remove `truckOwnerId`, `truckOwnerPayment`, `truckOwnerRate`, `orderConfirmation`, `brokerPayment`, `brokerRate`, `factoryRate`, `factoryAdvance`, `factoryCost`, `brokerCost`, `brokerAdvance`, `driverAdvance`, `orderAverage`, `orderExpenses`, `orderRevenue`.

#### 4. User Interface
**File**: `haulhub-shared/src/interfaces/user.interface.ts`
**Changes**: Add `accountStatus`, `company`, `ein`, `subscribedDispatcherIds`, `subscribedCarrierIds`, `createdBy`, `lastModifiedBy`, `claimedAt`, `pendingCarrierId`, `carrierId` (for Drivers). Remove `verificationStatus`, `driverLicenseNumber`. Remove import of `VerificationStatus`.

#### 5. Truck Interface
**File**: `haulhub-shared/src/interfaces/truck.interface.ts`
**Changes**: Remove `truckOwnerId`. Add `createdBy`, `lastModifiedBy`.

#### 6. Trailer Interface
**File**: `haulhub-shared/src/interfaces/trailer.interface.ts`
**Changes**: Add `createdBy`, `lastModifiedBy`.

#### 7. CreateOrderDto (rename from CreateTripDto)
**File**: `haulhub-shared/src/dtos/trip.dto.ts` → rename to `order.dto.ts`
**Changes**: New DTO matching the Order interface. Required fields: `adminId`, `carrierId`, `dispatcherId`, `driverId`, `truckId`, `trailerId`, `brokerId`, `invoiceNumber`, `brokerLoad`, `scheduledTimestamp`, `orderRate`, `mileageOrder`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`. Remove `orderConfirmation`, `truckOwnerId`, `brokerPayment`, `truckOwnerPayment`. Add `adminRate`, `dispatcherRate` (optional, defaults applied server-side).

#### 8. UpdateOrderDto (rename from UpdateTripDto)
**Changes**: All fields optional. Role-based validation happens server-side (not in DTO). Remove all waste fields. Add new fields as optional.

#### 9. Workflow Rules
**File**: `haulhub-shared/src/interfaces/workflow-rules.interface.ts`
**Changes**: Replace `TripStatus` → `OrderStatus`. Update `DEFAULT_WORKFLOW_RULES` with new transitions per design Section 17. Add `Carrier` to `allowedRoles` where appropriate. Remove `admin` (old system admin) from roles. Add `ANY → Canceled` for Dispatcher.

#### 10. Payment Report Interfaces
**File**: `haulhub-shared/src/interfaces/payment-report.interface.ts`
**Changes**: Replace `DispatcherPaymentReport`, `DriverPaymentReport`, `TruckOwnerPaymentReport` with per-role report types: `AdminPaymentReport`, `DispatcherPaymentReport` (revised), `CarrierPaymentReport`, `DriverPaymentReport` (revised). Remove `TruckOwnerPaymentReport`. Update `PaymentReportFilters` to remove `truckOwner` groupBy, add `admin` groupBy.

#### 11. Remove Dead Files
- Delete `haulhub-shared/src/enums/lorry-verification-status.enum.ts`
- Delete `haulhub-shared/src/enums/verification-status.enum.ts`
- Delete `haulhub-shared/src/interfaces/lorry.interface.ts`
- Delete `haulhub-shared/src/dtos/lorry.dto.ts`
- Update `haulhub-shared/src/enums/index.ts` — remove dead exports, add `OrderStatus`
- Update `haulhub-shared/src/interfaces/index.ts` — remove dead exports, add `Order`
- Update `haulhub-shared/src/dtos/index.ts` — remove dead exports, add `CreateOrderDto`, `UpdateOrderDto`
- Update `haulhub-shared/src/index.ts` — ensure all new exports are re-exported

#### 12. Trip Calculations Utility
**File**: `haulhub-shared/src/utils/trip-calculations.util.ts`
**Changes**: Update to use new financial model. Key function: given `orderRate`, `dispatcherRate`, `mileageOrder`, `mileageTotal`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`, `lumper`, `detention` → calculate all derived fields (`adminRate`, `adminPayment`, `dispatcherPayment`, `carrierPayment`, `driverPayment`, `fuelCost`). Enforce `adminRate + dispatcherRate = 10%`, `carrierPayment = orderRate × 90%`.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-shared && npm run build` compiles with zero errors
- [x] No references to `TruckOwner`, `LorryOwner`, `TripStatus`, `Trip` (as type name) remain in shared package
- [x] `trip-calculations.util.spec.ts` updated and passing

### Success Criteria:
- Shared package builds cleanly
- All new types/enums/DTOs are exported from package index
- No dead code remains (lorry interfaces, verification enums, TruckOwner types)

**Demo**: `npm run build` in `haulhub-shared` succeeds. Importing `{ UserRole, OrderStatus, Order, CreateOrderDto }` from `@haulhub/shared` works.

**Implementation Note**: After completing this phase, the backend and frontend will NOT compile (they still reference old types). That's expected — they'll be updated in subsequent phases.

---

## Phase 2: Infrastructure (CDK + Config)

### Overview
Add 5 new DynamoDB table definitions in CDK alongside the old ones. Update backend config service to support new table names. Deploy tables to AWS.

### Changes Required:

#### 1. Database Stack — New Tables
**File**: `haulhub-infrastructure/lib/stacks/database-stack.ts`
**Changes**: Add 5 new table definitions BELOW the existing ones. Do NOT modify or delete old tables.

New tables and their GSIs:

**eTruckyOrders** (PK: `PK`, SK: `SK`):
- GSI1: `GSI1PK` (`CARRIER#<carrierId>`) + `GSI1SK` (`<timestamp>#<orderId>`)
- GSI2: `GSI2PK` (`DISPATCHER#<dispatcherId>`) + `GSI2SK`
- GSI3: `GSI3PK` (`DRIVER#<driverId>`) + `GSI3SK`
- GSI4: `GSI4PK` (`ADMIN#<adminId>`) + `GSI4SK`
- GSI5: `GSI5PK` (`BROKER#<brokerId>`) + `GSI5SK`
- Stream: `NEW_AND_OLD_IMAGES`

**eTruckyUsers** (PK: `PK`, SK: `SK`):
- GSI1: `GSI1PK` (`CARRIER#<carrierId>`) + `GSI1SK` (`ROLE#<role>#USER#<userId>`)
- GSI2: `GSI2PK` (`EMAIL#<email>`) + `GSI2SK` (`USER#<userId>`)

**eTruckyTrucks** (PK: `PK`, SK: `SK`):
- GSI1: `GSI1PK` (`CARRIER#<carrierId>`) + `GSI1SK` (`TRUCK#<truckId>`)
- NO GSI2 (removed — no TruckOwner)

**eTruckyTrailers** (PK: `PK`, SK: `SK`):
- GSI1: `GSI1PK` (`CARRIER#<carrierId>`) + `GSI1SK` (`TRAILER#<trailerId>`)

**eTruckyBrokers** (PK: `PK`, SK: `SK`):
- No GSIs

All tables: PAY_PER_REQUEST billing, AWS_MANAGED encryption, PITR per config, DESTROY removal policy for dev.

Add new public properties and CfnOutputs for each new table.

#### 2. Config Service — New Table Names
**File**: `haulhub-backend/src/config/config.service.ts`
**Changes**: Add new getters for v2 table names:

```typescript
get ordersTableName(): string { return process.env.ETRUCKY_ORDERS_TABLE || 'eTruckyOrders'; }
get v2UsersTableName(): string { return process.env.ETRUCKY_USERS_TABLE || 'eTruckyUsers'; }
get v2TrucksTableName(): string { return process.env.ETRUCKY_TRUCKS_TABLE || 'eTruckyTrucks'; }
get v2TrailersTableName(): string { return process.env.ETRUCKY_TRAILERS_TABLE || 'eTruckyTrailers'; }
get v2BrokersTableName(): string { return process.env.ETRUCKY_BROKERS_TABLE || 'eTruckyBrokers'; }
```

Keep old getters for backward compatibility (old code still references them until fully migrated).

#### 3. Environment Files
**File**: `haulhub-backend/.env.example`
**Changes**: Add new env vars:

```bash
ETRUCKY_ORDERS_TABLE=eTruckyOrders
ETRUCKY_USERS_TABLE=eTruckyUsers
ETRUCKY_TRUCKS_TABLE=eTruckyTrucks
ETRUCKY_TRAILERS_TABLE=eTruckyTrailers
ETRUCKY_BROKERS_TABLE=eTruckyBrokers
```

#### 4. CDK API Stack — Lambda Environment
**File**: `haulhub-infrastructure/lib/stacks/api-stack.ts`
**Changes**: Add new table name env vars to Lambda function environment. Grant read/write permissions on new tables to Lambda.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-infrastructure && npm run build` compiles
- [x] `npx cdk synth --all` generates CloudFormation templates with both old and new tables
- [x] New tables appear in synth output with correct GSIs

#### Manual Verification:
- [ ] `npx cdk deploy --all --profile etrucky` creates new tables in AWS
- [ ] Verify tables exist: `aws dynamodb list-tables --profile etrucky | grep eTrucky`
- [ ] Old tables still exist and are untouched

### Success Criteria:
- 10 DynamoDB tables in AWS (5 old + 5 new)
- Backend config service can resolve new table names
- Lambda has permissions on new tables

**Demo**: `cdk deploy` succeeds. `aws dynamodb describe-table --table-name eTruckyOrders` shows correct GSIs (5 GSIs, GSI4 uses `ADMIN#` prefix). Old tables still accessible.

**Implementation Note**: After this phase, pause for manual verification that tables deployed correctly before proceeding.

---

## Phase 3: Backend — Auth & Users

### Overview
Rewrite auth service (claim flow, placeholder creation), users service (new user model, subscription management), and the CurrentUser decorator. This unlocks registration, user management, and the placeholder/claim pattern.

### Changes Required:

#### 1. CurrentUser Decorator
**File**: `haulhub-backend/src/auth/decorators/current-user.decorator.ts`
**Changes**: Update `CurrentUserData` interface. Remove `carrierId` as a universal field (only Drivers have it). Add `role`, `accountStatus`.

```typescript
export interface CurrentUserData {
  userId: string;
  email: string;
  role: UserRole;
  accountStatus: string;
  carrierId?: string;  // Only for Drivers
}
```

#### 2. Register DTO
**File**: `haulhub-backend/src/auth/dto/register.dto.ts`
**Changes**: Update to match new roles. Remove `carrierId` requirement for Dispatchers. Add `role` validation (must be one of Admin, Dispatcher, Carrier, Driver).

#### 3. Auth Service — Registration & Claim Flow
**File**: `haulhub-backend/src/auth/auth.service.ts`
**Changes**: Major rewrite of `register()` method:
- Check if Cognito user exists with email (placeholder detection)
- If exists: set password, send verification code (claim flow)
- If not: create Cognito user, send verification code (new registration)
- Response is identical in both cases (no information leak)
- On verification: update DDB `accountStatus` to `active`, set `claimedAt`
- Remove carrier membership validation from registration (many-to-many world)
- Remove `custom:carrierId` from Cognito attributes for non-Driver roles

#### 4. Auth Service — Placeholder Creation
**File**: `haulhub-backend/src/auth/auth.service.ts`
**Changes**: New method `createPlaceholder(dto)`:
- Create Cognito user with `MessageAction: 'SUPPRESS'`
- Create DDB record with `accountStatus: 'unclaimed'`
- Return `userId` (Cognito sub)
- Used by users service when Dispatcher creates Carrier, Carrier creates Driver, etc.

#### 5. Users Service — Full Rewrite
**File**: `haulhub-backend/src/users/users.service.ts`
**Changes**:
- Remove duplicated `UserRole` enum (use shared package)
- `createUser()`: calls auth service `createPlaceholder()`, handles auto-subscription (if Dispatcher creates Carrier → add to `subscribedCarrierIds`)
- `getUsersByCarrier()`: keep for querying Drivers by Carrier (GSI1)
- New: `getSubscribedEntities(userId, role)`: fetch user record, return subscription list IDs, batch-fetch those user records
- New: `updateSubscription(userId, targetId, action: 'subscribe' | 'unsubscribe')`: add/remove ID from subscription list
- `updateUser()`: support email correction on unclaimed accounts (update Cognito + DDB + GSI2PK)
- All methods use new table name (`v2UsersTableName`)
- Remove `generateTemporaryPassword()` (not needed — placeholder accounts have no password until claimed)

#### 6. Roles Guard
**File**: `haulhub-backend/src/auth/guards/roles.guard.ts`
**Changes**: Ensure it checks `accountStatus === 'active'` in addition to role. Unclaimed/pending accounts get 403.

#### 7. JWT Auth Guard
**File**: `haulhub-backend/src/auth/guards/jwt-auth.guard.ts`
**Changes**: Extract `accountStatus` from user record and attach to request (so roles guard can check it).

#### 8. Entity Resolution Endpoint
**File**: New file `haulhub-backend/src/users/entities.controller.ts`
**Changes**: New controller with single endpoint:

```typescript
@Post('entities/resolve')
async resolveEntities(@Body() body: { ids: string[] }): Promise<Record<string, any>>
```

- Accepts array of UUIDs
- Batch-fetches from eTruckyUsers, eTruckyTrucks, eTruckyTrailers, eTruckyBrokers
- Returns minimal display info: `{ name, type, plate?, brand? }`
- Works regardless of subscription status
- Max 50 IDs per request

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-backend && npm run build` compiles
- [ ] Auth service placeholder creation works (unit test)
- [ ] Registration claim flow works for both new and placeholder accounts (unit test)
- [ ] Subscription management add/remove works (unit test)
- [ ] Entity resolution returns correct display info (unit test)
- [ ] Roles guard rejects unclaimed accounts (unit test)

#### Manual Verification:
- [ ] Register a new user via API → receives verification code
- [ ] Create a placeholder via API → no email sent
- [ ] Register with placeholder email → claims account successfully
- [ ] Entity resolution endpoint returns correct data for mixed entity types

### Success Criteria:
- Backend compiles and starts locally
- Placeholder creation + claim flow works end-to-end
- Subscription lists can be managed
- Entity resolution endpoint works for all entity types

**Demo**: Start backend locally. Create a Carrier placeholder via API. Register with that email. Account becomes active. Query `POST /entities/resolve` with the userId → returns name and type.

**Implementation Note**: After this phase, pause for manual testing of the auth flow before proceeding.

---

## Phase 4: Backend — Orders Service

### Overview
Rewrite the trips service → orders service. This is the largest and most complex phase. New financial model, role-based field filtering, new status transitions, role-based editing permissions, and the index selector.

### Changes Required:

#### 1. Orders Service (rename from TripsService)
**File**: `haulhub-backend/src/trips/trips.service.ts` → rename to `orders/orders.service.ts`
**Changes**: Major rewrite. Key methods:

**`createOrder(dto, dispatcherId)`**:
- Validate: only Dispatchers can create
- Fetch Admin's default rate, Driver's default rate from user records
- Calculate all financial fields:
  - `adminRate` = from Admin's user record (default 5%)
  - `dispatcherRate` = 10% - adminRate
  - `adminPayment` = orderRate × adminRate
  - `dispatcherPayment` = orderRate × dispatcherRate
  - `carrierPayment` = orderRate × 90%
  - `driverPayment` = driverRate × mileageOrder
  - `fuelCost` = mileageTotal × fuelGasAvgGallxMil × fuelGasAvgCost
- Populate all 5 GSI key pairs (CARRIER#, DISPATCHER#, DRIVER#, ADMIN#, BROKER#)
- Set `orderStatus = 'Scheduled'`, `createdAt`, `updatedAt`, `lastModifiedBy`
- Write to `eTruckyOrders` table

**`updateOrder(orderId, dto, userId, userRole)`**:
- Role-based field validation:
  - Dispatcher: can update all fields except `dispatcherRate` and `adminRate`
  - Admin: can ONLY update `dispatcherRate` (adminRate auto-adjusts to 10% - dispatcherRate). Recalculate `adminPayment`, `dispatcherPayment`. `carrierPayment` stays at 90%.
  - Carrier: can update `driverId`, `truckId`, `trailerId`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`. Recalculate `driverPayment`, `fuelCost`.
  - Driver: can only update `notes`
- Recalculate derived fields when inputs change
- Update GSI keys if entity references change (e.g., Carrier reassigns driver → GSI3PK changes)
- Set `updatedAt`, `lastModifiedBy`

**`updateOrderStatus(orderId, newStatus, userId, userRole)`**:
- Validate transition per design Section 17 status matrix
- ANY → Canceled: Dispatcher only
- Set timestamp fields: `pickupTimestamp` on Picking Up, `deliveryTimestamp` on Delivered
- Set `updatedAt`, `lastModifiedBy`

**`getOrders(userId, userRole, filters)`**:
- Select GSI based on role:
  - Admin → GSI4 (`ADMIN#<userId>`)
  - Dispatcher → GSI2 (`DISPATCHER#<userId>`)
  - Carrier → GSI1 (`CARRIER#<userId>`)
  - Driver → GSI3 (`DRIVER#<userId>`)
- Apply date range filter on sort key
- Apply additional filters (status, brokerId, etc.) post-query
- Apply role-based field filtering before returning

**`filterOrderByRole(order, role)`**:
- Admin: strip `driverRate`, `driverPayment`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`, `fuelCost`
- Dispatcher: strip same as Admin
- Carrier: strip `orderRate`, `adminRate`, `adminPayment`, `dispatcherRate`, `dispatcherPayment`, `brokerId`, `brokerLoad`
- Driver: strip everything financial except `driverPayment`, `mileageOrder`, `mileageTotal`

**`deleteOrder(orderId, dispatcherId)`**: Dispatcher only. Verify ownership via GSI2.

#### 2. Index Selector Service
**File**: `haulhub-backend/src/trips/index-selector.service.ts` → rename to `orders/index-selector.service.ts`
**Changes**: Update GSI selection logic. Replace `OWNER#` (GSI4) with `ADMIN#` (GSI4). Remove TruckOwner index selection. Update `TripFilters` → `OrderFilters`.

#### 3. Orders Controller (rename from TripsController)
**File**: `haulhub-backend/src/trips/trips.controller.ts` → rename to `orders/orders.controller.ts`
**Changes**:
- Rename all routes from `/trips` to `/orders`
- Update role decorators: `@Roles(UserRole.Dispatcher)` for create/delete, all roles for read
- Pass `userRole` to service methods for role-based filtering
- Update DTOs to `CreateOrderDto`, `UpdateOrderDto`

#### 4. Orders Module
**File**: `haulhub-backend/src/trips/trips.module.ts` → rename to `orders/orders.module.ts`
**Changes**: Update imports, providers, controller references.

#### 5. App Module
**File**: `haulhub-backend/src/app.module.ts`
**Changes**: Replace `TripsModule` with `OrdersModule`. Update imports.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-backend && npm run build` compiles
- [ ] Create order calculates all financial fields correctly (unit test)
- [ ] Admin rate edit: dispatcherRate change → adminRate auto-adjusts, carrierPayment unchanged (unit test)
- [ ] Carrier edit: can change assignment + driver rate + fuel, cannot change other fields (unit test)
- [ ] Driver edit: can only update notes (unit test)
- [ ] Status transitions: valid transitions succeed, invalid ones throw 400 (unit test)
- [ ] ANY → Canceled works for Dispatcher, rejected for other roles (unit test)
- [ ] Role-based field filtering strips correct fields per role (unit test)
- [ ] GSI selection picks correct index per role (unit test)

#### Manual Verification:
- [ ] Create order via API as Dispatcher → all financial fields calculated
- [ ] Get orders as each role → correct fields visible/hidden
- [ ] Update dispatcher rate as Admin → adminRate auto-adjusts
- [ ] Update assignment as Carrier → GSI keys updated correctly
- [ ] Status progression Scheduled → Ready To Pay works
- [ ] Cancel from any status as Dispatcher works

### Success Criteria:
- Full order CRUD works with role-based permissions
- Financial calculations are correct (adminRate + dispatcherRate = 10%, carrierPayment = 90%)
- Field filtering hides correct fields per role
- Status transitions enforce the permission matrix

**Demo**: Create an order as Dispatcher. View it as Admin (no fuel/driver fields). Edit dispatcher rate as Admin (admin rate auto-adjusts). View as Carrier (sees carrierPayment as revenue, no order rate). Progress status to Ready To Pay. Cancel an order.

**Implementation Note**: This is the largest phase. After completing, pause for thorough manual testing of all role-based behaviors before proceeding.

---

## Phase 5: Backend — Carrier, Admin, Brokers Controllers

### Overview
Restructure the Carrier controller (asset owner who can manage trucks/trailers/drivers and edit assignments). Restructure the Admin controller (business owner dashboard, read-only + dispatcher rate editing). Simplify Brokers controller (read-only). Remove all TruckOwner logic and verification workflows. Add Assets module for read-only dropdown population.

### Design Decisions
- **Ownership enforcement**: All update/delete operations verify the requesting user is associated with the target record. Trucks/trailers check `carrierId`, drivers check `carrierId`, orders check role-specific ID (adminId/dispatcherId/carrierId/driverId). Requests to records the user doesn't own throw 403 Forbidden.
- **Field whitelisting on user updates**: When a Carrier updates a Driver, only safe fields are allowed (`name`, `phone`, `rate`, `company`). Prevents modification of `accountStatus`, `carrierId`, or subscription arrays.
- **No `GET /admin/orders`**: Deferred to `GET /orders` (orders controller) which already routes Admin to GSI4. No duplicate endpoint needed.
- **Assets module**: Read-only lookup endpoints (`/assets/carriers/:carrierId/trucks|trailers|drivers|dispatchers`) accessible to Dispatchers and Carriers for form dropdown population. Replaces old lorries controller.

### Changes Required:

#### 1. Carrier Controller — Restructure
**File**: `haulhub-backend/src/carrier/carrier.controller.ts`
**Changes**:
- Keep: `getTrucks`, `createTruck`, `updateTruck`, `getTrailers`, `createTrailer`, `updateTrailer`, `getUsers` (Drivers only), `createUser` (Driver placeholders), `updateUser`
- Remove: TruckOwner-specific logic, `updateTruckStatus`/`updateTrailerStatus` (use `updateTruck`/`updateTrailer` with `isActive` field)
- Add: `getDashboard` using Carrier-specific profit metric (carrierPayment - fuelCost - driverPayment)
- All asset queries use new table names (`v2TrucksTableName`, etc.)
- `createUser` calls auth service `createPlaceholder()` for Driver creation
- `getUsers` queries GSI1 on eTruckyUsers (`CARRIER#<carrierId>`)
- `updateDriver` whitelists fields: only `name`, `phone`, `rate`, `company`
- All update operations verify ownership (carrierId match) before proceeding

#### 2. Carrier Service
**File**: `haulhub-backend/src/carrier/carrier.service.ts`
**Changes**: Update dashboard calculations to use Carrier profit metric. Remove TruckOwner references.

#### 3. Admin Controller — Restructure
**File**: `haulhub-backend/src/admin/admin.controller.ts`
**Changes**: Complete rewrite. Remove verification endpoints. New endpoints:
- `GET /admin/dashboard` — Admin's business overview (orders across all their Dispatchers)
- ~~`GET /admin/orders`~~ — **DEFERRED**: Use `GET /orders` (orders controller) which already routes Admin to GSI4. No duplicate endpoint.
- `PATCH /admin/orders/:id/rate` — edit dispatcher rate on an order (adminRate auto-adjusts)
- `GET /admin/dispatchers` — list subscribed Dispatchers
- `POST /admin/dispatchers` — create Dispatcher placeholder + auto-subscribe

#### 4. Admin Service — Rewrite
**File**: `haulhub-backend/src/admin/admin.service.ts`
**Changes**: Remove `getPendingLorries`, `verifyLorry`, `getPendingUsers`, `verifyUser`. Add:
- `getDashboard(adminId)` — query orders via GSI4, calculate Admin profit metrics
- `getSubscribedDispatchers(adminId)` — fetch Admin record, batch-get Dispatcher records by `subscribedDispatcherIds`
- `updateDispatcherRate(orderId, newRate, adminId)` — validate 10% cap, recalculate, delegate to orders service

#### 5. Brokers Controller — Simplify
**File**: `haulhub-backend/src/admin/brokers.controller.ts`
**Changes**: Remove `@Roles(UserRole.Admin)` from create/update/delete. Keep only `GET /brokers` (read-only, no auth required for dropdown population). Remove `POST`, `PATCH`, `DELETE` endpoints.

#### 6. Brokers Service — Simplify
**File**: `haulhub-backend/src/admin/brokers.service.ts`
**Changes**: Remove `createBroker`, `updateBroker`, `deleteBroker`. Keep `getAllBrokers`, `getBrokerById`. Update to use `v2BrokersTableName`.

#### 7. Lorries Service — Migrate to Asset Service
**File**: `haulhub-backend/src/lorries/lorries.service.ts` → refactor
**Changes**: Remove all TruckOwner-specific methods (`getLorriesByOwner`, `getLorryByIdAndOwner`, `getTruckOwnersByCarrier`). Remove `registerLorry` (legacy). Keep truck/trailer CRUD methods. Update all table references to new table names. Add `createdBy`, `lastModifiedBy` to all write operations. Remove `truckOwnerId` from truck creation/updates. Remove GSI2 queries on trucks table.

#### 8. Lorries Controller — Simplify
**File**: `haulhub-backend/src/lorries/lorries.controller.ts`
**Changes**: Remove `registerLorry`, `getTruckOwners`. Keep `getLorries` (trucks), `getTrailers`, `getDrivers`, `getDispatchers`. These are used by the Carrier controller and Dispatcher forms. Update to use new table names.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-backend && npm run build` compiles
- [x] No references to `TruckOwner`, `truckOwnerId`, `verifyLorry`, `verifyUser` remain in backend
- [ ] Admin dashboard endpoint returns correct profit metrics (unit test)
- [ ] Dispatcher rate update enforces 10% cap (unit test)
- [ ] Carrier can create Driver placeholder (unit test)
- [x] Broker endpoints are read-only (POST/PATCH/DELETE return 404 or removed)

#### Manual Verification:
- [ ] Admin dashboard shows orders across subscribed Dispatchers
- [ ] Admin can edit dispatcher rate, admin rate auto-adjusts
- [ ] Carrier can create trucks, trailers, driver placeholders
- [ ] Carrier dashboard shows correct profit metric
- [ ] `GET /brokers` returns broker list without auth

### Success Criteria:
- All TruckOwner code removed from backend
- Admin controller serves business owner role (not system admin)
- Carrier controller manages assets and views orders
- Brokers are read-only

**Demo**: As Admin, view dashboard showing orders from subscribed Dispatchers. Edit dispatcher rate on an order. As Carrier, create a truck and a Driver placeholder. View Carrier dashboard with correct profit.

**Implementation Note**: After this phase, the backend is functionally complete for the new model. Pause for manual testing.

---

## Phase 6: Backend — Analytics

### Overview
Update analytics service to use per-role profit metrics. Each role's charts use their own profit formula.

### Changes Required:

#### 1. Analytics Service
**File**: `haulhub-backend/src/analytics/analytics.service.ts`
**Changes**:
- `getUnifiedAnalytics(userId, userRole)` — route to role-specific analytics
- Admin analytics: profit = adminPayment - lumper - detention. Charts show revenue (orderRate), profit, order count over time.
- Dispatcher analytics: profit = dispatcherPayment. Charts show profit, order count over time.
- Carrier analytics: profit = carrierPayment - fuelCost - driverPayment. Charts show revenue (carrierPayment), costs (fuel + driver), profit over time.
- Driver analytics: profit = driverPayment. Charts show earnings, mileage over time.
- Remove `getFleetOverview` (was Carrier-as-top-level concept)
- Remove `getDispatcherPerformance` (was Carrier viewing their Dispatchers)
- Update all queries to use new table names and GSIs

#### 2. Analytics Controller
**File**: `haulhub-backend/src/analytics/analytics.controller.ts`
**Changes**: Simplify to role-based routing. Remove fleet-specific endpoints. Keep `getUnifiedAnalytics`, `getTripAnalytics` (rename to `getOrderAnalytics`), `getDriverPerformance`, `getBrokerAnalytics`, `getFuelAnalytics`.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-backend && npm run build` compiles
- [x] Admin analytics uses correct profit formula (unit test)
- [x] Carrier analytics uses correct profit formula (unit test)

#### Manual Verification:
- [ ] Each role's analytics endpoint returns correct profit metrics
- [ ] Charts data makes sense with seed data

### Success Criteria:
- Analytics endpoints return role-appropriate profit metrics
- No TruckOwner analytics remain

**Demo**: Query analytics as each role. Admin sees adminPayment-based profit. Carrier sees carrierPayment-based profit. Driver sees driverPayment.

---

## Phase 7: Frontend — Core, Auth, Routes

### Overview
Update Angular shared services, auth module (claim flow UI), route guards, and remove truck-owner routes. This phase makes the frontend compilable and navigable with the new role structure.

### Changes Required:

#### 1. Delete Truck Owner Module
**Path**: `haulhub-frontend/src/app/features/truck-owner/`
**Changes**: Delete entire directory (dashboard, truck-list, truck-registration, trailer-list, trailer-registration, vehicle-trip-list, truck-owner.routes.ts).

#### 2. Delete Admin Sub-Modules
**Paths**:
- Delete `haulhub-frontend/src/app/features/admin/lorry-verification/`
- Delete `haulhub-frontend/src/app/features/admin/user-verification/`
- Delete `haulhub-frontend/src/app/features/admin/broker-management/`

#### 3. App Routes
**File**: `haulhub-frontend/src/app/app.routes.ts`
**Changes**:
- Remove `truck-owner` route entirely
- Update Admin route guard to allow `UserRole.Admin` (business owner, not system admin)
- Update Carrier route guard to allow `UserRole.Carrier`
- Keep Dispatcher and Driver routes
- Update lazy-loaded module paths if modules are renamed

#### 4. Auth Module — Claim Flow UI
**File**: `haulhub-frontend/src/app/features/auth/register/`
**Changes**: Update registration form:
- Fields: email, name, password, role (dropdown: Admin, Dispatcher, Carrier, Driver)
- Remove `carrierId` field (not needed at registration — many-to-many)
- On submit: call `/auth/register` → show verification code input
- On verify: call `/auth/verify` → redirect to dashboard
- Flow is identical for new users and placeholder claims (no UI difference)

#### 5. Asset Cache Service
**File**: New file `haulhub-frontend/src/app/core/services/asset-cache.service.ts`
**Changes**: Implement the two-tier cache per design Section 10:
- `subscribed` bucket: populated from full refresh of subscribed entities
- `resolved` bucket: populated from cache-miss fetches
- `refreshSubscribed()`: fetch all subscribed assets, store in localStorage with 5-min TTL
- `resolveIds(ids: string[])`: check cache, batch-fetch misses via `POST /entities/resolve`
- `forceRefresh()`: clear cache, re-fetch everything (called on Create Order navigation)
- `getName(id: string)`: synchronous lookup from cache, returns name or 'Loading...'

#### 6. API Service Updates
**File**: `haulhub-frontend/src/app/core/services/api.service.ts` (or equivalent)
**Changes**: Update endpoint URLs from `/trips` to `/orders`. Add `POST /entities/resolve` method. Add subscription management methods.

#### 7. Route Guards
**File**: `haulhub-frontend/src/app/guards/`
**Changes**: Update role checks. Remove TruckOwner guard. Add check for `accountStatus === 'active'` — redirect unclaimed accounts to a profile completion page.

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-frontend && npm run build` compiles (may have component errors — that's OK, routes and core services should work)
- [x] No references to `TruckOwner`, `LorryOwner`, `truck-owner` in route files
- [x] Asset cache service compiles

#### Manual Verification:
- [ ] App loads in browser without route errors
- [ ] Login redirects to correct dashboard per role
- [ ] Registration form shows new role options
- [ ] Truck-owner route returns 404

### Success Criteria:
- Frontend compiles and loads
- Routes work for all 4 roles
- Truck-owner module fully removed
- Asset cache service is available for dashboard components

**Demo**: Start frontend locally. Navigate to login. Register as Dispatcher. Get redirected to Dispatcher dashboard (may be empty/broken — that's OK, it loads). Truck-owner route returns 404.

---

## Phase 8: Frontend — Dashboards & Forms

### Overview
Build the per-role dashboards with correct columns, filters, financial visibility, and the Dispatcher's Create Order form with Carrier-first cascading dropdowns.

### Changes Required:

#### 1. Dispatcher Dashboard
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/`
**Changes**:
- Order table columns: Status, Invoice #, Broker Load, Scheduled Date, Pickup City, Delivery City, Broker, Carrier, Order Rate, Dispatcher Profit (dispatcherPayment)
- Filters: Date Range, Status, Broker, Carrier
- Charts: profit = dispatcherPayment over time, order count
- Title: "Dispatcher Dashboard"

#### 2. Dispatcher Create Order Form
**File**: `haulhub-frontend/src/app/features/dispatcher/trip-create/` → rename to `order-create/`
**Changes**: Major rewrite:
- Step 1: Select Admin (from subscribed Admins — but wait, Dispatcher doesn't have subscribedAdminIds. The Dispatcher selects from Admins who have subscribed to them. This needs a backend endpoint: `GET /dispatchers/my-admins` that returns Admins whose `subscribedDispatcherIds` includes this Dispatcher's ID. OR: the Dispatcher just types/selects the Admin. Let me think... Actually, the design says the Dispatcher selects which Admin the order belongs to. The Dispatcher needs to know which Admins they work for. Since the subscription is on the Admin's record (`subscribedDispatcherIds`), the Dispatcher doesn't have a local list. We need a backend query: "find all Admins whose subscribedDispatcherIds contains my userId". This is a scan — not ideal. Alternative: also store `subscribedAdminIds` on the Dispatcher's record (bidirectional). For now, use the asset cache — on dashboard load, fetch "my Admins" and cache them.)
- Step 2: Select Carrier (from `subscribedCarrierIds` on Dispatcher's record → force cache refresh)
- Step 3: Cascading dropdowns — select Carrier first, then Truck/Trailer/Driver filter to that Carrier's assets
- Step 4: Order details (invoice #, broker load, broker, pickup/delivery locations, mileage, scheduled date)
- Step 5: Financial section (orderRate input, rates auto-calculated, preview of all payments)
- On submit: `POST /orders`

**Important design note**: The Dispatcher needs to know which Admins they work for. Since `subscribedDispatcherIds` lives on the Admin's record, we need either:
- A backend endpoint that scans for Admins containing this Dispatcher's ID (expensive)
- A bidirectional field: `subscribedAdminIds: string[]` on the Dispatcher's record (maintained in sync)

Recommend: add `subscribedAdminIds` to Dispatcher's record. When an Admin subscribes a Dispatcher, update both records. This avoids scans.

#### 3. Dispatcher Edit Order Form
**File**: `haulhub-frontend/src/app/features/dispatcher/trip-edit/` → rename to `order-edit/`
**Changes**: Same as create form but pre-populated. Dispatcher can edit all fields except their own rate.

#### 4. Admin Dashboard
**File**: `haulhub-frontend/src/app/features/admin/dashboard/`
**Changes**: Complete rewrite:
- Order table columns: Status, Invoice #, Broker Load, Scheduled Date, Pickup City, Delivery City, Broker, Dispatcher, Order Rate, Admin Profit (adminPayment - lumper - detention)
- Filters: Date Range, Status, Broker, Dispatcher
- Charts: profit = adminPayment - lumper - detention over time
- Title: "Admin Dashboard"
- Click order → view detail (read-only except dispatcher rate)

#### 5. Admin Order Detail / Rate Edit
**File**: New component in `haulhub-frontend/src/app/features/admin/order-detail/`
**Changes**: Read-only order view with editable dispatcher rate field. Shows:
- Admin rate (read-only, auto-calculated as 10% - dispatcherRate)
- Dispatcher rate (editable input)
- Live preview: as dispatcherRate changes, show updated adminPayment, dispatcherPayment
- carrierPayment shown as read-only (always 90%)
- Save button calls `PATCH /admin/orders/:id/rate`

#### 6. Carrier Dashboard
**File**: `haulhub-frontend/src/app/features/carrier/dashboard/`
**Changes**: Restructure:
- Order table columns: Status, Invoice #, Scheduled Date, Pickup City, Delivery City, Dispatcher, Truck, Driver, Trailer, Carrier Profit (carrierPayment - fuelCost - driverPayment)
- Filters: Date Range, Status, Dispatcher, Truck, Driver
- Charts: revenue (carrierPayment), costs (fuel + driver), profit over time
- Title: "Carrier Dashboard" (fix from "Admin Dashboard")
- Asset management tabs: Trucks, Trailers, Drivers (existing components, updated)

#### 7. Carrier Order Detail / Edit
**File**: Update `haulhub-frontend/src/app/features/carrier/` components
**Changes**: Carrier can edit:
- Assignment: Truck, Trailer, Driver dropdowns (filtered to their own assets)
- Financial: Driver rate, fuel inputs (fuelGasAvgCost, fuelGasAvgGallxMil)
- Live preview: recalculated driverPayment, fuelCost, carrierProfit
- Cannot see: orderRate, adminRate, adminPayment, dispatcherRate, dispatcherPayment

#### 8. Driver Dashboard
**File**: `haulhub-frontend/src/app/features/driver/dashboard/`
**Changes**: Simplify:
- Order table columns: Status, Invoice #, Scheduled Date, Pickup City, Delivery City, Truck, Driver Payment
- Filters: Date Range, Status, Truck
- Charts: earnings (driverPayment) over time, mileage over time
- Title: "Driver Dashboard"
- Show Carrier name (resolved from carrierId via asset cache)
- Status update buttons (Scheduled → Picking Up → Transit → Delivered)

#### 9. All Order Tables — Asset Name Resolution
**Changes across all dashboards**: Order table cells that show entity names (Carrier, Dispatcher, Driver, Truck, Broker) use the asset cache service:
- Call `assetCache.getName(uuid)` for each cell
- If cache miss, collect UUIDs and batch-resolve after table render
- Filter dropdowns populated from `subscribed` cache

### Tests for This Phase:

#### Automated Verification:
- [x] `cd haulhub-frontend && npm run build` compiles with zero errors
- [x] No references to `TruckOwner`, `truck-owner`, `lorry-verification`, `user-verification`, `broker-management` remain

#### Manual Verification:
- [ ] Dispatcher: create order with Carrier-first cascading dropdowns
- [ ] Dispatcher: edit order, all fields editable except own rate
- [ ] Admin: view dashboard, see orders across Dispatchers
- [ ] Admin: edit dispatcher rate, see admin rate auto-adjust
- [ ] Carrier: view dashboard with correct profit metric
- [ ] Carrier: edit assignment (truck/trailer/driver) and fuel inputs
- [ ] Driver: view dashboard, update status, see Carrier name
- [ ] All dashboards: entity names resolve correctly from cache

### Success Criteria:
- All 4 role dashboards render correctly with role-appropriate data
- Create/Edit Order form works with cascading dropdowns
- Financial visibility matches the design matrices
- Asset cache resolves names correctly

**Demo**: Full walkthrough: Dispatcher creates an order (selects Admin, Carrier, cascading assets). Admin views it (sees their profit, edits dispatcher rate). Carrier views it (sees carrierPayment as revenue, edits driver rate). Driver views it (sees driverPayment, updates status to Picking Up).

**Implementation Note**: This is the second-largest phase. Consider splitting into sub-phases (Dispatcher first, then Admin, then Carrier, then Driver) if needed. Pause for manual testing after each dashboard.

---

## Phase 9: Seed Data & End-to-End Validation

### Overview
Write a new seed script that populates the v2 tables with the new hierarchy. Run end-to-end validation across all roles.

### Changes Required:

#### 1. New Seed Script
**File**: `scripts/seed-v2.ts`
**Changes**: Complete rewrite targeting new tables. Creates:

**Users (Cognito + eTruckyUsers):**
- 2 Admins: "Maria Rodriguez" (Admin, company: "Rodriguez Logistics"), "James Chen" (Admin, company: "Chen Transport Group")
- 3 Dispatchers: "Carlos Mendez", "Sarah Johnson", "Mike Williams" — each subscribed to 1-2 Admins, each with 1-2 subscribed Carriers
- 3 Carriers: "Swift Transport LLC", "Eagle Freight Inc", "Pacific Haulers" — each with trucks, trailers, drivers
- 8 Drivers: distributed across Carriers (2-3 per Carrier), each with CDL info and default rate
- All accounts created as `accountStatus: 'active'` (seed data = already claimed)
- Cognito users created with known passwords for testing

**Subscription wiring:**
- Admin "Maria" subscribes Dispatchers "Carlos" and "Sarah"
- Admin "James" subscribes Dispatchers "Sarah" and "Mike"
- Dispatcher "Carlos" subscribes Carriers "Swift" and "Eagle"
- Dispatcher "Sarah" subscribes Carriers "Eagle" and "Pacific"
- Dispatcher "Mike" subscribes Carrier "Pacific"
- Bidirectional: Dispatchers also have `subscribedAdminIds`

**Assets (eTruckyTrucks, eTruckyTrailers):**
- 12 Trucks: 4 per Carrier, various brands/years
- 12 Trailers: 4 per Carrier
- All with `createdBy`, `lastModifiedBy` set to Carrier's userId

**Brokers (eTruckyBrokers):**
- 20 brokers (same list as current seed data)

**Orders (eTruckyOrders):**
- 200+ orders spanning Jan 2025 – Feb 2026
- Distributed across Dispatchers, Carriers, Drivers
- All new statuses represented (Scheduled, Picking Up, Transit, Delivered, Waiting RC, Ready To Pay, Canceled)
- Financial model: orderRate varies $2,000-$8,000, default 5%/5% split, lumper $0-$100, detention $0-$50
- All 5 GSI key pairs populated correctly
- `createdAt`, `updatedAt`, `lastModifiedBy` set

#### 2. Seed Wipe Script
**File**: `scripts/wipe-v2.ts`
**Changes**: Scan and delete all items from v2 tables. Wipe Cognito users. Used before re-seeding.

#### 3. Seed Runner
**File**: `scripts/seed-v2.sh`
**Changes**: Shell script that runs wipe then seed. Uses `--profile etrucky`.

### Tests for This Phase:

#### Automated Verification:
- [ ] Seed script runs without errors
- [ ] All 5 v2 tables have expected item counts
- [ ] GSI queries return correct results (spot-check: query GSI4 for Admin's orders)

#### Manual Verification:
- [ ] Login as each seeded user → correct dashboard loads
- [ ] Dispatcher sees orders they created, with correct Carriers/Drivers
- [ ] Admin sees orders across their subscribed Dispatchers
- [ ] Carrier sees orders assigned to them, with correct profit
- [ ] Driver sees their assigned orders with driverPayment
- [ ] Create a new order as Dispatcher → all financial fields calculated correctly
- [ ] Edit dispatcher rate as Admin → admin rate auto-adjusts, carrier payment unchanged
- [ ] Edit assignment as Carrier → driver/truck/trailer updated
- [ ] Progress order through all statuses → timestamps set correctly
- [ ] Cancel an order from Delivered status → works (Dispatcher only)
- [ ] Entity resolution: unsubscribe a Carrier, old orders still show Carrier name

### Success Criteria:
- Seed data represents realistic multi-tenant hierarchy
- All role dashboards show meaningful data
- Full order lifecycle works end-to-end
- Financial calculations are correct across all roles
- Cache miss resolution works for unsubscribed entities

**Demo**: Full end-to-end walkthrough with seed data. Login as each role, verify dashboard, create/edit/progress orders, verify financial visibility.

---

## Performance Considerations

- **GSI queries**: All role-based order queries use GSIs (no table scans). Sort key enables efficient date-range filtering.
- **Entity resolution**: Batch endpoint (max 50 IDs) with BatchGetItem (DynamoDB native batch). Client-side caching reduces calls.
- **Subscription lists**: Stored as string arrays on user records. For typical usage (5-20 subscriptions), this is efficient. If a Dispatcher has 100+ Carriers, consider a separate subscription table.
- **Asset cache**: 5-min TTL prevents excessive API calls. Forced refresh on Create Order ensures freshness when it matters.

## Migration Notes

- Old tables (`eTrucky-Trips`, etc.) remain untouched throughout development
- Deployed app continues using old tables until cutover
- Cutover: update Lambda env vars to point to v2 tables, deploy new code
- Rollback: revert Lambda env vars + code, old tables are intact
- Post-cutover cleanup: delete old tables after validation period (1-2 weeks)

## References

- Design document: `planning/2026-02-20-hierarchy-redesign/design.md`
- Current database schema: `haulhub-infrastructure/lib/stacks/database-stack.ts`
- Current trip interface: `haulhub-shared/src/interfaces/trip.interface.ts`
- Current trips service: `haulhub-backend/src/trips/trips.service.ts`
- Current seed script: `scripts/seed-etrucky-clean.ts`
