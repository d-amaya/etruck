# eTrucky Hierarchy Redesign — Implementation Plan

## Overview

Redesign eTrucky from a carrier-centric model (Carrier owns everything) to an admin-centric model (Admin is the business owner, Dispatcher is the intermediary, Carrier is the asset executor). This touches all 4 packages: shared types, backend API, frontend dashboards, and infrastructure. The v2 DynamoDB tables and seed data are already deployed.

## Current State Analysis

- **Old model**: Carrier → Dispatchers, Drivers, TruckOwners. Single Carrier owns all assets. Admin is a system administrator who verifies users/trucks.
- **Deployed v2 tables**: `eTruckyOrders`, `eTruckyUsers`, `eTruckyTrucks`, `eTruckyTrailers`, `eTruckyBrokers` — all seeded with 1,400 orders, 2 Admins, 3 Dispatchers, 3 Carriers, 8 Drivers, 12 Trucks, 12 Trailers, 20 Brokers.
- **Backend**: NestJS with `trips/` module (143KB service), `lorries/` module, `admin/` module (verification workflows), `carrier/` module, `auth/` module.
- **Frontend**: Angular 17+ with feature modules for Dispatcher, Carrier, Driver, Admin, TruckOwner. Each dashboard uses `*-state.service.ts`, `*-asset-cache.service.ts`, `*-filter.service.ts` pattern.
- **Shared**: TypeScript enums, interfaces, DTOs with old model types (`TruckOwner`, `LorryOwner`, `TripStatus`, verification enums).

### Key Discoveries:
- `trips.service.ts` (143KB) is the largest file — full rewrite needed as `orders.service.ts`
- `IndexSelectorService` currently selects GSI by filter selectivity — simplifies to role→GSI mapping
- `AssetCacheService` uses `forkJoin` + localStorage + 4hr TTL + cache-on-miss — needs `resolved` bucket evolution
- `TripCreateComponent` uses `mat-select` (not `mat-autocomplete`) — needs cascading dropdown rewrite
- `AuthService` already uses `AdminCreateUser` with `MessageAction: 'SUPPRESS'` — claim flow builds on this
- Carrier dashboard title bug: says "Admin Dashboard" instead of "Carrier Dashboard"
- Current ownership checks: Dispatcher verified via `dispatcherId !== userId`, Driver via GSI3 query, Carrier has no trip ownership check

## Desired End State

After all 9 phases:
- 4 roles (Admin, Dispatcher, Carrier, Driver) with many-to-many relationships
- Admin dashboard showing org-wide orders across all their Dispatchers
- Dispatcher creates orders with cascading Carrier→Asset `mat-autocomplete` dropdowns
- Per-role financial visibility and editing permissions enforced on backend
- Atomic ownership checks via DynamoDB `ConditionExpression` with `ReturnValuesOnConditionCheckFailure`
- Field-level allowlists per role (disallowed fields → 400)
- Two-tier asset cache (subscribed + resolved) on all dashboards
- TruckOwner role completely eliminated
- Admin verification workflows removed
- All dashboards use correct profit metrics per role

### Verification:
- All seeded test users can log in and see role-appropriate data
- Dispatcher can create/edit orders with cascading dropdowns
- Admin can view orders and edit dispatcherRate
- Carrier can reassign assets and edit driverRate/fuel
- Driver can update status and add notes
- Cross-role mutations are rejected with 400/403
- `npm test` passes in all packages

## What We're NOT Doing

- Driver mobility / Carrier transfer UI (deferred to post-launch)
- Asset transfer UI for trucks/trailers (deferred to post-launch)
- Email change after registration (deferred to post-launch)
- New CSS frameworks, redesigned layouts, or altered styling
- Alternative state management libraries
- Hard deletes of any records
- Modifications to old DynamoDB tables (parallel table strategy)

## Implementation Approach

9 phases, each building on the previous. Shared types first (unblocks everything), then backend (orders → auth → cleanup), then frontend (dispatcher dashboard → order forms → admin dashboard → carrier/driver → cleanup).

## References

- Design document: `thoughts/shared/design.md`
- Authorization research: `thoughts/shared/research/2026-02-20-order-ownership-authorization.md`
- Seed script: `scripts/seed-v2.ts` (re-seed: `USER_POOL_ID=us-east-1_yoiMUn0Q8 AWS_PROFILE=haul-hub npx ts-node scripts/seed-v2.ts`)
- Git: `0b0a30c` on `main`

---

## Phase 1: Shared Types Foundation

### Overview
Replace old enums, interfaces, and DTOs with v2 types. This unblocks all backend and frontend work.

### Changes Required:

#### 1. Enums
**File**: `haulhub-shared/src/enums/user-role.enum.ts`
**Changes**: Remove `TruckOwner`, `LorryOwner`. Keep `Admin`, `Dispatcher`, `Carrier`, `Driver`.

**File**: `haulhub-shared/src/enums/trip-status.enum.ts` → rename to `order-status.enum.ts`
**Changes**: Replace with `OrderStatus`: `Scheduled`, `PickingUp`, `Transit`, `Delivered`, `WaitingRC`, `ReadyToPay`, `Canceled`.

**File**: `haulhub-shared/src/enums/account-status.enum.ts` (NEW)
**Changes**: Create `AccountStatus`: `unclaimed`, `pending_verification`, `active`, `suspended`.

**Files to DELETE**:
- `enums/verification-status.enum.ts`
- `enums/lorry-verification-status.enum.ts`
- `enums/vehicle-verification-status.enum.ts`

**File**: `haulhub-shared/src/enums/index.ts`
**Changes**: Update exports — remove deleted enums, add `OrderStatus`, `AccountStatus`.

#### 2. Interfaces
**File**: `haulhub-shared/src/interfaces/trip.interface.ts` → rename to `order.interface.ts`
**Changes**: New `Order` interface per design Section 6. All fields: `orderId`, `adminId`, `dispatcherId`, `carrierId`, `driverId`, `truckId`, `trailerId`, `brokerId`, `invoiceNumber`, `brokerLoad`, `orderStatus`, timestamps, locations, mileage, full financial model (`orderRate`, `adminRate`, `adminPayment`, `dispatcherRate`, `dispatcherPayment`, `carrierRate`, `carrierPayment`, `driverRate`, `driverPayment`, fuel fields, `fuelCost`), `notes`, audit fields.

**File**: `haulhub-shared/src/interfaces/user.interface.ts`
**Changes**: Add `accountStatus`, `subscribedCarrierIds?`, `subscribedAdminIds?`, `createdBy`, `lastModifiedBy`, `claimedAt?`. Remove `verificationStatus`. Update `role` type to new 4-role union.

**File**: `haulhub-shared/src/interfaces/truck.interface.ts`
**Changes**: Remove `truckOwnerId`, `verificationStatus`, `LegacyTruck`. Add `fuelGasAvgGallxMil?`, `fuelGasAvgCost?`, `createdBy`, `lastModifiedBy`.

**File**: `haulhub-shared/src/interfaces/trailer.interface.ts`
**Changes**: Change `ownerId` → `carrierId`. Remove `verificationStatus`. Add `createdBy`, `lastModifiedBy`.

**File**: `haulhub-shared/src/interfaces/payment-report.interface.ts`
**Changes**: Replace `TruckOwnerPaymentReport` with per-role report interfaces (Admin, Dispatcher, Carrier, Driver).

**File**: `haulhub-shared/src/interfaces/workflow-rules.interface.ts`
**Changes**: New status transition rules per design Section 5. Per-role allowed transitions.

**File**: `haulhub-shared/src/interfaces/index.ts`
**Changes**: Update exports.

#### 3. DTOs
**File**: `haulhub-shared/src/dtos/trip.dto.ts` → rename to `order.dto.ts`
**Changes**: `CreateOrderDto`, `UpdateOrderDto`, `UpdateOrderStatusDto`, `OrderFilters`. Include all v2 fields. `OrderFilters` has `carrierId`, `adminId` instead of `truckOwnerId`.

**File**: `haulhub-shared/src/dtos/truck.dto.ts`
**Changes**: Remove `truckOwnerId`. Add audit fields.

**File**: `haulhub-shared/src/dtos/trailer.dto.ts`
**Changes**: Change `ownerId` → `carrierId`. Add audit fields.

**File**: `haulhub-shared/src/dtos/index.ts`
**Changes**: Update exports.

#### 4. Utils
**File**: `haulhub-shared/src/utils/trip-calculations.util.ts`
**Changes**: Per-role profit calculations per design Section 17:
- `calcAdminProfit(order)` = adminPayment - lumper - detention
- `calcDispatcherProfit(order)` = dispatcherPayment
- `calcCarrierProfit(order)` = carrierPayment - driverPayment - fuelCost
- `calcDriverProfit(order)` = driverPayment

### Tests for This Phase:

#### Unit Tests:
- [x] `OrderStatus` enum has all 7 values
- [x] `AccountStatus` enum has all 4 values
- [x] `UserRole` enum has exactly 4 values (no TruckOwner/LorryOwner)
- [x] `Order` interface compiles with all required fields
- [x] `CreateOrderDto` includes `adminId`, `carrierId`, `invoiceNumber`, `brokerLoad`
- [x] Per-role profit calculations return correct values for sample orders
- [x] Status transition rules allow/deny correct transitions per role

### Success Criteria:

#### Automated Verification:
- [x] `cd haulhub-shared && npm run build` compiles without errors
- [x] `cd haulhub-shared && npm test` passes

#### Manual Verification:
- [x] Verify no references to `TruckOwner`, `LorryOwner`, `TripStatus`, `VerificationStatus` remain in shared package

**Implementation Note**: After completing this phase, the backend and frontend will have compile errors (they reference old types). That's expected — they get fixed in subsequent phases.

---

## Phase 2: Backend Orders Module

### Overview
Create the new `orders/` module that replaces `trips/`. This is the largest phase — new controller, service, and index selector targeting v2 tables with ownership guard rails.

### Changes Required:

#### 1. Config Service
**File**: `haulhub-backend/src/config/config.service.ts`
**Changes**: Add v2 table name getters:
```typescript
get ordersTableName(): string {
  return process.env.ETRUCKY_ORDERS_TABLE || 'eTruckyOrders';
}
get v2UsersTableName(): string {
  return process.env.ETRUCKY_USERS_TABLE || 'eTruckyUsers';
}
get v2TrucksTableName(): string {
  return process.env.ETRUCKY_TRUCKS_TABLE || 'eTruckyTrucks';
}
get v2TrailersTableName(): string {
  return process.env.ETRUCKY_TRAILERS_TABLE || 'eTruckyTrailers';
}
get v2BrokersTableName(): string {
  return process.env.ETRUCKY_BROKERS_TABLE || 'eTruckyBrokers';
}
```

#### 2. Index Selector
**File**: `haulhub-backend/src/orders/index-selector.service.ts` (NEW, replaces `trips/index-selector.service.ts`)
**Changes**: Simplified role→GSI mapping:
```typescript
selectIndex(role: UserRole): { indexName: string; pkPrefix: string } {
  switch (role) {
    case UserRole.Admin:      return { indexName: 'GSI4', pkPrefix: 'ADMIN#' };
    case UserRole.Dispatcher:  return { indexName: 'GSI2', pkPrefix: 'DISPATCHER#' };
    case UserRole.Carrier:     return { indexName: 'GSI1', pkPrefix: 'CARRIER#' };
    case UserRole.Driver:      return { indexName: 'GSI3', pkPrefix: 'DRIVER#' };
  }
}
```
Secondary filters (broker, truck, driver, status) applied as `FilterExpression`.

#### 3. Orders Controller
**File**: `haulhub-backend/src/orders/orders.controller.ts` (NEW)
**Changes**: Endpoints:
- `POST /orders` — `@Roles(Dispatcher)` — create order
- `PATCH /orders/:id` — `@Roles(Admin, Dispatcher, Carrier, Driver)` — update order (field-level enforcement in service)
- `PATCH /orders/:id/status` — `@Roles(Dispatcher, Carrier, Driver)` — update status
- `DELETE /orders/:id` — `@Roles(Dispatcher)` — soft delete
- `GET /orders` — `@Roles(Admin, Dispatcher, Carrier, Driver)` — list with role-based GSI + pagination
- `GET /orders/:id` — `@Roles(Admin, Dispatcher, Carrier, Driver)` — get by ID with role-based field filtering
- `GET /orders/reports/payments` — payment reports per role

All endpoints use `@CurrentUser()` to extract caller identity.

#### 4. Orders Service
**File**: `haulhub-backend/src/orders/orders.service.ts` (NEW — largest new file)
**Changes**:

**Ownership guard rails (Decision 13):**
Every mutation uses `ConditionExpression` with `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'`:
```typescript
// Dispatcher update example
ConditionExpression: 'attribute_exists(PK) AND dispatcherId = :callerId'
ExpressionAttributeValues: { ':callerId': user.userId }
```
On `ConditionalCheckFailedException`: if `error.Item` exists → 403 "You do not have permission to update this order". If no item → 404 "Order not found".

**Field-level allowlists:**
```typescript
const ALLOWED_FIELDS: Record<UserRole, string[]> = {
  [UserRole.Admin]: ['dispatcherRate', 'notes'],
  [UserRole.Dispatcher]: [/* all except dispatcherRate, adminRate, driverRate, fuelGasAvgCost, fuelGasAvgGallxMil */],
  [UserRole.Carrier]: ['driverId', 'truckId', 'trailerId', 'driverRate', 'fuelGasAvgCost', 'fuelGasAvgGallxMil', 'notes'],
  [UserRole.Driver]: ['notes'],
};
```
If DTO contains disallowed fields → 400 "Fields not permitted for your role: [field list]".

**Auto-recalculation:**
- When Admin changes `dispatcherRate`: `adminRate = 10 - dispatcherRate`, recalc `adminPayment`, `dispatcherPayment`
- When Carrier changes `driverRate`: recalc `driverPayment`
- When Carrier changes fuel inputs: recalc `fuelCost`
- `carrierPayment` = `orderRate × 90%` (never changes)

**Create order:**
- Validate all entity IDs exist (admin, carrier, driver, truck, trailer, broker)
- Lookup driver.rate and truck fuel defaults
- Calculate all payment fields
- Write to DynamoDB with all GSI keys

**Status transitions:**
- Validate transition is allowed for the caller's role per design Section 5
- Set `pickupTimestamp` when → PickingUp, `deliveryTimestamp` when → Delivered

**Role-based field filtering on GET:**
- Admin: sees orderRate, adminRate, adminPayment, dispatcherRate, dispatcherPayment, carrierPayment, lumper, detention. Does NOT see driverRate, driverPayment, fuelCost.
- Dispatcher: sees orderRate, dispatcherRate, dispatcherPayment, carrierPayment, lumper, detention. Does NOT see adminRate, adminPayment, driverRate, driverPayment, fuelCost.
- Carrier: sees carrierPayment (as "revenue"), driverRate, driverPayment, fuelCost, lumper, detention. Does NOT see orderRate, adminRate, adminPayment, dispatcherRate, dispatcherPayment.
- Driver: sees driverPayment, mileage. Does NOT see any other financial fields.

**Pagination:** Same pattern as current — `lastEvaluatedKey` via `x-pagination-token` header, `Limit` param, `FilterExpression` for secondary filters.

#### 5. Orders Module
**File**: `haulhub-backend/src/orders/orders.module.ts` (NEW)
**Changes**: Register `OrdersController`, `OrdersService`, `IndexSelectorService`. Import `ConfigModule`, `AwsModule`.

#### 6. Backend .env
**File**: `haulhub-backend/.env`
**Changes**: Add v2 table env vars:
```
ETRUCKY_ORDERS_TABLE=eTruckyOrders
ETRUCKY_USERS_TABLE=eTruckyUsers
ETRUCKY_TRUCKS_TABLE=eTruckyTrucks
ETRUCKY_TRAILERS_TABLE=eTruckyTrailers
ETRUCKY_BROKERS_TABLE=eTruckyBrokers
```

### Tests for This Phase:

#### Unit Tests:
- [x] Index selector returns correct GSI for each role
- [x] Field-level allowlist rejects disallowed fields with 400
- [x] Field-level allowlist accepts allowed fields
- [x] Ownership ConditionExpression built correctly per role
- [x] ConditionalCheckFailedException with Item → 403
- [x] ConditionalCheckFailedException without Item → 404
- [x] Auto-recalc: changing dispatcherRate recalculates adminRate, adminPayment, dispatcherPayment
- [x] Auto-recalc: changing driverRate recalculates driverPayment
- [x] Auto-recalc: changing fuel inputs recalculates fuelCost
- [x] carrierPayment = orderRate × 90% always
- [x] Status transitions: valid transitions succeed, invalid transitions → 400
- [x] Role-based field filtering strips correct fields per role
- [x] Create order calculates all payment fields from entity defaults

### Success Criteria:

#### Automated Verification:
- [x] `cd haulhub-backend && npx jest --testPathPattern=src/orders` passes (22/22)
- [ ] `cd haulhub-backend && npm run build` compiles (blocked by old modules — requires Phase 4)
- [ ] `cd haulhub-backend && npm test` passes (blocked by old modules — requires Phase 4)

#### Manual Verification:
- [ ] Create order via curl as Dispatcher → order appears in DynamoDB with all fields
- [ ] Update order as wrong Dispatcher → 403
- [ ] Update order with disallowed fields → 400
- [ ] GET order as Carrier → financial fields filtered correctly

**Implementation Note**: After completing this phase, pause for manual API testing with seeded data before proceeding.

---

## Phase 3: Backend Auth & Entity Resolution

### Overview
Implement the three-way registration/claim flow, placeholder creation, entity resolution endpoint, and subscription management. These are the new backend capabilities that don't exist today.

### Changes Required:

#### 1. Auth Service — Claim Flow
**File**: `haulhub-backend/src/auth/auth.service.ts`
**Changes**: Modify `register()` to implement three-way check:

1. Check Cognito for email:
   - **Already active (confirmed)**: return "This email is already registered" (no verification code sent)
   - **Exists as placeholder (unclaimed)**: send verification code to email, set password, return "Verification code sent"
   - **Doesn't exist**: create new Cognito user, send verification code, return "Verification code sent"
2. Placeholder and new-account responses are **identical** (prevents email enumeration)
3. On verification: update DDB `accountStatus` → `active`, set `claimedAt`

Add `createPlaceholder()` method:
- Creates Cognito user with `MessageAction: 'SUPPRESS'`
- Creates DDB record with `accountStatus: 'unclaimed'`
- Returns `userId` (Cognito sub)

Add `getUserDetailsByEmail()` method for the three-way check.

**File**: `haulhub-backend/src/auth/dto/register.dto.ts`
**Changes**: Remove `TruckOwner`/`LorryOwner` from role validation. Add `Admin` as valid registration role (for claim flow — Admins can't self-register, only claim placeholders).

#### 2. Entity Resolution Endpoint
**File**: `haulhub-backend/src/users/users.controller.ts`
**Changes**: Add endpoints:
- `POST /entities/resolve` — batch resolve UUIDs to display info (any authenticated user)
- `GET /users/subscriptions` — get current user's subscription lists
- `PATCH /users/subscriptions` — add/remove subscription IDs
- `POST /users/placeholder` — create placeholder user (Dispatcher only)

**File**: `haulhub-backend/src/users/users.service.ts`
**Changes**:

`resolveEntities(ids: string[])`: Batch lookup across Users, Trucks, Trailers tables. For each UUID, return minimal display info:
- User → `{ name, type: role }`
- Truck → `{ plate, brand, type: 'truck' }`
- Trailer → `{ plate, brand, type: 'trailer' }`
- Not found → `{ name: 'Unknown', type: 'unknown' }`
Batch limit: 50 UUIDs per request.

`getSubscriptions(userId)`: Read user record, return `subscribedAdminIds` and `subscribedCarrierIds`.

`updateSubscriptions(userId, { addAdminIds?, removeAdminIds?, addCarrierIds?, removeCarrierIds? })`: DynamoDB `ADD`/`DELETE` on set attributes.

`createPlaceholder(creatorId, { email, name, role })`: Call `authService.createPlaceholder()`, then if role is Carrier and creator is Dispatcher → auto-add carrierId to creator's `subscribedCarrierIds`. If role is Admin and creator is Dispatcher → auto-add adminId to creator's `subscribedAdminIds`.

### Tests for This Phase:

#### Unit Tests:
- [x] Three-way registration: active account → "already registered"
- [x] Three-way registration: placeholder → "verification code sent" + password set
- [x] Three-way registration: new account → "verification code sent" + user created
- [x] Placeholder and new-account responses are identical (no email enumeration)
- [x] `resolveEntities` returns correct display info for users, trucks, trailers
- [x] `resolveEntities` returns "Unknown" for non-existent UUIDs
- [x] `resolveEntities` rejects batches > 50
- [x] Subscription add/remove works correctly
- [x] Placeholder creation auto-subscribes creator

### Success Criteria:

#### Automated Verification:
- [x] `cd haulhub-backend && npm test` passes (targeted: 14/14 auth+users tests pass; full suite blocked by old modules until Phase 4)

#### Manual Verification:
- [ ] Create placeholder via API → Cognito user exists with no invitation email
- [ ] Register with placeholder email → account claimed, `accountStatus` = `active`
- [ ] `POST /entities/resolve` with mixed UUIDs → correct display info returned
- [ ] Subscription management → `subscribedCarrierIds` updated in DynamoDB

**Implementation Note**: After completing this phase, pause for manual testing of the claim flow with seeded Cognito users.

---

## Phase 4: Backend Cleanup

### Overview
Remove old code, rename modules, and wire everything together. After this phase, the backend is fully v2.

### Changes Required:

#### 1. Admin Module
**File**: `haulhub-backend/src/admin/admin.controller.ts`
**Changes**: Remove all verification endpoints (`/admin/trucks/pending`, `/admin/trucks/:id/verify`, `/admin/users/pending`, `/admin/users/:id/verify`). The Admin role no longer verifies anything — they're a business owner. Keep the controller for any Admin-specific query endpoints if needed, or remove entirely if all queries go through `/orders`.

**File**: `haulhub-backend/src/admin/admin.service.ts`
**Changes**: Remove verification logic. If Admin needs org-wide queries beyond `/orders` (which already handles Admin via GSI4), add them here. Otherwise gut the service.

**File**: `haulhub-backend/src/admin/brokers.controller.ts`
**Changes**: Keep only `GET /brokers`. Remove `POST`, `PATCH`, `DELETE` endpoints.

**File**: `haulhub-backend/src/admin/brokers.service.ts`
**Changes**: Keep only `findAll()`. Remove `create()`, `update()`, `delete()`.

#### 2. Assets Module (rename from lorries)
**File**: `haulhub-backend/src/lorries/` → rename to `haulhub-backend/src/assets/`
**Changes**:
- Remove all `truckOwnerId` logic
- Remove TruckOwner-specific endpoints (getTruckOwnersByCarrier, etc.)
- Add audit fields (`createdBy`, `lastModifiedBy`) to create/update operations
- Support Dispatcher creating assets for subscribed Carriers (check `subscribedCarrierIds`)
- Point to v2 table names via `ConfigService`

#### 3. Carrier Module
**File**: `haulhub-backend/src/carrier/carrier.service.ts`
**Changes**: Update for new financial model. Remove TruckOwner references. Update `getAllAssets()` to not return truckOwners.

**File**: `haulhub-backend/src/carrier/carrier.controller.ts`
**Changes**: Update `validateCarrierAccess()` — same pattern, just ensure it works with v2 user records.

#### 4. Analytics Module
**File**: `haulhub-backend/src/analytics/analytics.service.ts` (58.7KB)
**Changes**: Update per-role profit calculations:
- Admin: `adminPayment - lumper - detention`
- Dispatcher: `dispatcherPayment`
- Carrier: `carrierPayment - driverPayment - fuelCost`
- Driver: `driverPayment`
Remove TruckOwner analytics. Point to v2 tables.

#### 5. App Module
**File**: `haulhub-backend/src/app.module.ts`
**Changes**: Replace `TripsModule` → `OrdersModule`. Replace `LorriesModule` → `AssetsModule`. Update imports.

#### 6. Remove Old Trips Module
**Action**: Delete `haulhub-backend/src/trips/` directory entirely (controller, service, index-selector, module). Replaced by `orders/` from Phase 2.

### Tests for This Phase:

#### Unit Tests:
- [ ] Broker endpoint returns list on GET, rejects POST/PATCH/DELETE
- [ ] Asset creation includes audit fields
- [ ] Dispatcher can create assets for subscribed Carriers
- [ ] Dispatcher cannot create assets for unsubscribed Carriers → 403
- [ ] Analytics returns correct profit per role
- [ ] No references to TruckOwner/LorryOwner in any backend file

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-backend && npm run build` compiles with zero errors
- [ ] `cd haulhub-backend && npm test` passes
- [ ] `grep -r "TruckOwner\|LorryOwner\|truckOwnerId" haulhub-backend/src/` returns zero matches

#### Manual Verification:
- [ ] Full API smoke test with seeded data — all endpoints respond correctly
- [ ] Login as each role → GET /orders returns role-appropriate data

**Implementation Note**: After completing this phase, the entire backend is v2. Pause for comprehensive API testing before starting frontend work.

---

## Phase 5: Dispatcher Dashboard

### Overview
Update the Dispatcher dashboard to work with v2 backend — new filters, evolved asset cache, updated table columns and profit calculations.

### Changes Required:

#### 1. Core Services
**File**: `haulhub-frontend/src/app/core/services/trip.service.ts` → rename to `order.service.ts`
**Changes**: Update all API paths (`/trips` → `/orders`). Update method signatures to use `Order`, `CreateOrderDto`, `UpdateOrderDto`, `OrderFilters`. Add `resolveEntities(ids: string[])` method calling `POST /entities/resolve`. Add `getSubscriptions()` and `updateSubscriptions()` methods.

**File**: `haulhub-frontend/src/app/core/services/index.ts`
**Changes**: Update exports.

#### 2. Dashboard State
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/dashboard-state.service.ts` (14.8KB)
**Changes**:
- `DashboardFilters`: remove `truckOwnerId`, add `carrierId`
- `TripStatus` → `OrderStatus`
- Update view cache keys
- `Trip` → `Order` throughout

#### 3. Asset Cache — Two-Tier Evolution
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/asset-cache.service.ts` (16.6KB)
**Changes**:
- `AssetCache` interface: remove `truckOwners` map, add `carriers` map, add `admins` map
- Add `resolved` bucket: `Map<string, { name: string; type: string; fetchedAt: number }>`
- Add `resolveEntities(ids: string[])`: batch-fetch unknown UUIDs via `POST /entities/resolve`, populate resolved bucket with 30-min TTL
- Add `forceRefresh()`: bypass localStorage TTL, fetch fresh from backend (used by Create Order page)
- Update `loadAssets()` forkJoin: replace `getTruckOwnersByCarrier()` with calls to load subscribed carriers and admins
- Table rendering: check subscribed → check resolved → batch-fetch misses

#### 4. Filter Service
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/shared-filter.service.ts` (5.3KB)
**Changes**: Remove `truckOwnerId` filter. Add `carrierId` filter.

#### 5. Trip Table → Order Table
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/trip-table/trip-table.component.ts` (32KB)
**Changes**:
- `displayedColumns`: remove `truckOwnerId`, add `carrierId` (resolved to company name via cache)
- `revenue` column → show `orderRate`
- `profitLoss` → show `dispatcherPayment`
- Remove `expenses` column (Dispatchers don't see carrier-level costs)
- `Trip` → `Order`, `TripStatus` → `OrderStatus`
- Update all `calculateTripProfit` calls → `calcDispatcherProfit`
- Update filter dropdowns: add Carrier autocomplete, remove TruckOwner

**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/trip-table/trip-table.component.html` (14.4KB)
**Changes**: Update column templates, filter bar, status chips to use new enum values.

#### 6. Charts & Analytics
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/dashboard-charts-widget/dashboard-charts-widget.component.ts` (17KB)
**Changes**: Profit metric → `dispatcherPayment`.

**File**: `haulhub-frontend/src/app/features/dispatcher/analytics-dashboard/analytics-dashboard.component.ts` (22KB)
**Changes**: Same profit metric update.

**File**: `haulhub-frontend/src/app/features/dispatcher/payment-report/payment-report.component.ts` (16KB)
**Changes**: Same profit metric update. Remove TruckOwner payment references.

#### 7. Filter Card
**File**: `haulhub-frontend/src/app/features/dispatcher/dashboard/unified-filter-card/unified-filter-card.component.ts`
**Changes**: No structural changes needed — filter card only has date range today. Role-specific filters are in the trip-table component.

### Tests for This Phase:

#### Unit Tests:
- [ ] `DashboardFilters` interface has `carrierId`, no `truckOwnerId`
- [ ] Asset cache `forceRefresh()` bypasses TTL
- [ ] Asset cache `resolveEntities()` populates resolved bucket
- [ ] Resolved bucket entries expire after 30 minutes
- [ ] Dispatcher profit calculation = `dispatcherPayment`

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-frontend && npm run build` compiles
- [ ] `cd haulhub-frontend && npm test` passes

#### Manual Verification:
- [ ] Login as Dispatcher → dashboard loads with orders from v2 backend
- [ ] Carrier names resolve correctly in table (from subscribed cache)
- [ ] Filter by Carrier works
- [ ] Pagination works (forward/back)
- [ ] Charts show dispatcherPayment as profit metric
- [ ] Payment report shows correct Dispatcher financials

**Implementation Note**: After completing this phase, pause for manual dashboard testing before proceeding to order forms.

---

## Phase 6: Dispatcher Order Forms

### Overview
Rewrite Create Order and Edit Order forms with cascading Carrier→Asset `mat-autocomplete` dropdowns, Admin selection, forced cache refresh, and v2 financial model. This is the most complex frontend phase.

### Changes Required:

#### 1. Create Order
**File**: `haulhub-frontend/src/app/features/dispatcher/trip-create/trip-create.component.ts` (17KB) → rename to `order-create.component.ts`
**Changes**:

**ngOnInit — forced cache refresh:**
```typescript
this.assetCacheService.forceRefresh().subscribe(() => {
  this.admins = this.assetCacheService.getSubscribedAdmins();
  this.carriers = this.assetCacheService.getSubscribedCarriers();
});
```

**Admin autocomplete:** `mat-autocomplete` populated from `subscribedAdminIds`. Filter by name as user types. Required field.

**Carrier autocomplete:** `mat-autocomplete` populated from `subscribedCarrierIds`. Filter by company name. Required field.

**Cascading asset fetch on Carrier selection:**
```typescript
onCarrierSelected(carrierId: string): void {
  forkJoin({
    trucks: this.orderService.getTrucksByCarrier(carrierId),
    trailers: this.orderService.getTrailersByCarrier(carrierId),
    drivers: this.orderService.getDriversByCarrier(carrierId),
  }).subscribe(({ trucks, trailers, drivers }) => {
    this.trucks = trucks.filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
    this.trailers = trailers.filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
    this.drivers = drivers.filter(d => d.isActive).sort((a, b) => a.name.localeCompare(b.name));
    this.form.patchValue({ truckId: null, trailerId: null, driverId: null });
  });
}
```

**Truck, Trailer, Driver autocompletes:** `mat-autocomplete` populated from selected Carrier's assets. All required.

**Form fields:**
- Remove: `orderConfirmation`, `truckOwnerRate`, `truckOwnerPayment`
- Add: `adminId`, `invoiceNumber`, `brokerLoad`, `adminRate` (default 5%, disabled), `dispatcherRate` (default 5%, disabled)
- `brokerPayment` → `orderRate`
- Auto-calc: `adminPayment`, `dispatcherPayment`, `carrierPayment` (all disabled/display-only)
- `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil` → auto-populated from selected Driver/Truck defaults, but NOT shown to Dispatcher (sent to backend for storage)

**On Driver selection:** auto-populate `driverRate` from `driver.rate`
**On Truck selection:** auto-populate `fuelGasAvgGallxMil` and `fuelGasAvgCost` from truck defaults

**All autocomplete dropdowns sorted ascending** by display field (name, plate, brokerName).

**File**: `haulhub-frontend/src/app/features/dispatcher/trip-create/trip-create.component.html` (15.6KB) → rename to `order-create.component.html`
**Changes**: Replace `mat-select` dropdowns with `mat-autocomplete` for Admin, Carrier, Broker, Truck, Trailer, Driver. Add `[displayWith]` functions. Add clear buttons. Restructure Assignment section.

#### 2. Edit Order
**File**: `haulhub-frontend/src/app/features/dispatcher/trip-edit/trip-edit.component.ts` (18KB) → rename to `order-edit.component.ts`
**Changes**: Same cascading dropdown logic as Create. Pre-populate all fields from existing order. Admin and Carrier dropdowns pre-selected. On Carrier change → re-fetch assets, reset truck/trailer/driver.

**File**: `haulhub-frontend/src/app/features/dispatcher/trip-edit/trip-edit.component.html` (14KB) → rename to `order-edit.component.html`
**Changes**: Same template updates as Create.

#### 3. Order Detail
**File**: `haulhub-frontend/src/app/features/dispatcher/trip-detail/trip-detail.component.ts` (10KB) → rename to `order-detail.component.ts`
**Changes**: Update financial visibility — Dispatcher sees: orderRate, dispatcherRate, dispatcherPayment, carrierPayment, lumper, detention. Does NOT see: adminRate, adminPayment, driverRate, driverPayment, fuelCost.

**File**: `haulhub-frontend/src/app/features/dispatcher/trip-detail/trip-detail.component.html` (12KB) → rename to `order-detail.component.html`
**Changes**: Update field labels and visibility.

#### 4. Routes
**File**: `haulhub-frontend/src/app/features/dispatcher/dispatcher.routes.ts`
**Changes**: Update paths: `trips/create` → `orders/create`, `trips/:tripId/edit` → `orders/:orderId/edit`, `trips/:tripId` → `orders/:orderId`.

### Tests for This Phase:

#### Unit Tests:
- [ ] Carrier selection triggers asset fetch
- [ ] Asset fetch resets truck/trailer/driver dropdowns
- [ ] Admin autocomplete filters by name
- [ ] Carrier autocomplete filters by company
- [ ] Truck autocomplete filters by plate
- [ ] Form validation requires adminId, carrierId, all assignment fields
- [ ] Auto-calc: adminPayment = orderRate × adminRate / 100
- [ ] Auto-calc: dispatcherPayment = orderRate × dispatcherRate / 100
- [ ] Auto-calc: carrierPayment = orderRate × 90%

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-frontend && npm run build` compiles
- [ ] `cd haulhub-frontend && npm test` passes

#### Manual Verification:
- [ ] Navigate to Create Order → cache force-refreshes (verify network tab)
- [ ] Select Admin from autocomplete → filters by name
- [ ] Select Carrier → truck/trailer/driver dropdowns populate with that Carrier's assets
- [ ] Change Carrier → previous asset selections clear, new assets load
- [ ] Select Driver → driverRate auto-populates (hidden from Dispatcher)
- [ ] Select Truck → fuel defaults auto-populate (hidden from Dispatcher)
- [ ] Submit order → order created in DynamoDB with all calculated fields
- [ ] Edit existing order → all fields pre-populated, cascading dropdowns work
- [ ] Order detail → correct financial fields visible for Dispatcher role

**Implementation Note**: This is the most complex frontend phase. After completing, pause for thorough manual testing of the full create/edit/view flow.

---

## Phase 7: Admin Dashboard (NEW)

### Overview
Build the Admin business-owner dashboard from scratch, following the Dispatcher dashboard pattern. The Admin sees org-wide orders across all their Dispatchers, can filter by Dispatcher, and can edit the dispatcherRate on any order.

### Changes Required:

#### 1. State Service
**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-state.service.ts` (NEW)
**Changes**: Follow `DashboardStateService` pattern exactly:
- `AdminDashboardFilters`: `dateRange`, `status`, `brokerId`, `dispatcherId` (derived from order data, not subscription list)
- `PaginationState`: same as Dispatcher (`page`, `pageSize`, `pageTokens[]`)
- `LoadingState`, `ErrorState`: same pattern
- `filtersAndPagination$`: `combineLatest` with `debounceTime(200)`
- View caches for analytics and payments

#### 2. Asset Cache
**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-asset-cache.service.ts` (NEW)
**Changes**: Follow `AssetCacheService` pattern:
- `subscribed` bucket: `brokers` (global list), `dispatchers` (derived from order data — unique dispatcherIds from first page load)
- `resolved` bucket: same pattern as Dispatcher's
- `loadAssets()`: `forkJoin` to load brokers. Dispatchers populated from order data (no subscription list on Admin).
- localStorage persistence with 4hr TTL
- `resolveEntities()` for cache misses

#### 3. Filter Service
**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-filter.service.ts` (NEW)
**Changes**: Follow `SharedFilterService` pattern. Filters: `dateRange`, `status`, `brokerId`, `dispatcherId`.

#### 4. Order Table
**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-order-table/admin-order-table.component.ts` (NEW)
**Changes**: Follow `TripTableComponent` pattern. Columns per design Section 11:
- `status`, `invoiceNumber`, `brokerLoad`, `scheduledTimestamp`, `pickupCity`, `deliveryCity`, `broker`, `dispatcher`, `orderRate`, `adminProfit`, `actions`
- `adminProfit` = `adminPayment - lumper - detention`
- Filter bar: status, broker, dispatcher autocompletes
- Pagination: same `pageTokens[]` pattern
- Row action: click to view order detail; inline edit for `dispatcherRate`

**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-order-table/admin-order-table.component.html` (NEW)
**Changes**: Follow `trip-table.component.html` structure. Mat-table with columns, filter bar, paginator.

**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-order-table/admin-order-table.component.scss` (NEW)
**Changes**: Copy from `trip-table.component.scss` — identical styling per UX constraint.

#### 5. Charts Widget
**File**: `haulhub-frontend/src/app/features/admin/dashboard/admin-charts-widget/admin-charts-widget.component.ts` (NEW)
**Changes**: Follow `DashboardChartsWidgetComponent` pattern. Profit metric = `adminPayment - lumper - detention`.

#### 6. Dashboard Component
**File**: `haulhub-frontend/src/app/features/admin/dashboard/dashboard.component.ts`
**Changes**: Rebuild to follow Dispatcher dashboard pattern — view mode selector (table/analytics/payments), filter card, order table, charts widget, analytics wrapper, payments wrapper.

**File**: `haulhub-frontend/src/app/features/admin/dashboard/dashboard.component.html`
**Changes**: Replace current `<h1>Admin Dashboard</h1>` with full dashboard layout matching Dispatcher structure.

#### 7. Dispatcher Rate Editing
The Admin's unique capability: editing `dispatcherRate` on any order they own.

**In admin-order-table:** Add an edit icon on each row. Clicking opens an inline edit or dialog for `dispatcherRate`. On save:
- Call `PATCH /orders/:id` with `{ dispatcherRate: newValue }`
- Backend auto-recalculates: `adminRate = 10 - dispatcherRate`, `adminPayment`, `dispatcherPayment`
- Refresh the row in the table

#### 8. Routes
**File**: `haulhub-frontend/src/app/features/admin/admin.routes.ts`
**Changes**: Remove `lorries/verification`, `users/verification`, `brokers` routes. Keep `dashboard` as default. Add sub-routes if needed for analytics/payments views (or handle via view mode selector like Dispatcher).

### Tests for This Phase:

#### Unit Tests:
- [ ] Admin state service initializes with correct default filters
- [ ] Admin asset cache loads brokers and resolves dispatchers
- [ ] Admin order table displays correct columns
- [ ] Admin profit calculation = adminPayment - lumper - detention
- [ ] Dispatcher rate edit sends correct PATCH request

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-frontend && npm run build` compiles
- [ ] `cd haulhub-frontend && npm test` passes

#### Manual Verification:
- [ ] Login as Admin (admin1@etrucky.com / TempPass123!) → dashboard loads
- [ ] Orders from all Dispatchers visible (700 orders for Maria)
- [ ] Filter by Dispatcher works
- [ ] Filter by Broker works
- [ ] Pagination works (forward/back)
- [ ] Charts show adminProfit metric
- [ ] Edit dispatcherRate on an order → adminRate auto-adjusts, payments recalculate
- [ ] Dashboard title says "Admin Dashboard"

**Implementation Note**: This is the only dashboard built from scratch. After completing, pause for thorough manual testing.

---

## Phase 8: Carrier & Driver Dashboard Updates

### Overview
Update existing Carrier and Driver dashboards for v2 model — remove TruckOwner references, update profit calculations, evolve asset caches, fix Carrier dashboard title.

### Changes Required:

#### 1. Carrier Dashboard

**File**: `haulhub-frontend/src/app/features/carrier/shared/carrier-dashboard-state.service.ts` (3.2KB)
**Changes**: Remove `truckOwnerId` and `brokerId` from `CarrierDashboardFilters`. `TripStatus` → `OrderStatus`.

**File**: `haulhub-frontend/src/app/features/carrier/shared/carrier-asset-cache.service.ts` (8KB)
**Changes**: Remove `truckOwners` map. Add `resolved` bucket + `POST /entities/resolve` integration.

**File**: `haulhub-frontend/src/app/features/carrier/shared/carrier-filter.service.ts` (5.9KB)
**Changes**: Remove `truckOwnerId` and `brokerId` filters.

**File**: `haulhub-frontend/src/app/features/carrier/shared/unified-filter-card/unified-filter-card.component.html`
**Changes**: Fix title: "Admin Dashboard" → "Carrier Dashboard".

**File**: `haulhub-frontend/src/app/features/carrier/dashboard/carrier-trip-table/carrier-trip-table.component.ts` (25KB)
**Changes**:
- Remove columns: `brokerName`, `truckOwnerName`
- Add column: `trailerId` (resolved to plate)
- `revenue` → `carrierPayment`
- `expenses` → `driverPayment + fuelCost`
- `profitLoss` → `carrierPayment - driverPayment - fuelCost`
- `Trip` → `Order`, `TripStatus` → `OrderStatus`
- Add row-level edit for Carrier-allowed fields: reassign truck/trailer/driver, edit driverRate, fuel inputs

**File**: `haulhub-frontend/src/app/features/carrier/dashboard/carrier-charts-widget/carrier-charts-widget.component.ts` (12KB)
**Changes**: Profit metric → `carrierPayment - driverPayment - fuelCost`.

**File**: `haulhub-frontend/src/app/features/carrier/analytics/analytics.component.ts` (24KB)
**Changes**: Same profit metric update.

**File**: `haulhub-frontend/src/app/features/carrier/payment-report/payment-report.component.ts` (13KB)
**Changes**: Same profit metric update. Remove TruckOwner payment references.

**File**: `haulhub-frontend/src/app/features/carrier/asset-management/asset-management.component.ts` (22KB)
**Changes**: Remove all `truckOwnerId` / `TruckOwner` references. Remove truck owner dropdown from forms. Add `createdBy`, `lastModifiedBy` display.

**File**: `haulhub-frontend/src/app/features/carrier/carrier.routes.ts`
**Changes**: Update trip detail path to order detail.

#### 2. Driver Dashboard

**File**: `haulhub-frontend/src/app/features/driver/dashboard/driver-asset-cache.service.ts` (5.2KB)
**Changes**: Add `resolved` bucket + `POST /entities/resolve` integration.

**File**: `haulhub-frontend/src/app/features/driver/dashboard/driver-trip-table/` (or equivalent)
**Changes**:
- Update columns per design Section 11: `status`, `invoiceNumber`, `scheduledTimestamp`, `pickupCity`, `deliveryCity`, `truck`, `driverPayment`
- `Trip` → `Order`, `TripStatus` → `OrderStatus`
- Profit = `driverPayment` (always positive)

**File**: Driver charts/analytics/payment-report
**Changes**: Profit metric → `driverPayment`.

### Tests for This Phase:

#### Unit Tests:
- [ ] Carrier profit = carrierPayment - driverPayment - fuelCost
- [ ] Driver profit = driverPayment
- [ ] Carrier asset cache has no truckOwners map
- [ ] Carrier filter has no brokerId or truckOwnerId

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-frontend && npm run build` compiles
- [ ] `cd haulhub-frontend && npm test` passes

#### Manual Verification:
- [ ] Login as Carrier (carrier1@etrucky.com) → dashboard title says "Carrier Dashboard"
- [ ] Carrier sees: status, scheduled date, pickup/delivery, dispatcher, truck, driver, trailer, carrierPayment, expenses, profit
- [ ] Carrier does NOT see: broker, orderRate, adminPayment, dispatcherPayment
- [ ] Carrier can edit driverRate, fuel inputs, reassign truck/trailer/driver on an order
- [ ] Login as Driver (driver1@etrucky.com) → dashboard loads with assigned orders
- [ ] Driver sees: status, scheduled date, pickup/delivery, truck, driverPayment
- [ ] Driver does NOT see any other financial fields

**Implementation Note**: After completing this phase, all 4 role dashboards are functional. Pause for cross-role manual testing.

---

## Phase 9: Frontend Cleanup & Auth

### Overview
Delete dead code, update routing, fix navigation, and update the registration flow. After this phase, the frontend is fully v2 with no old model references.

### Changes Required:

#### 1. Delete TruckOwner Module
**Action**: Delete entire `haulhub-frontend/src/app/features/truck-owner/` directory.

#### 2. Delete Admin Verification/Broker Components
**Action**: Delete:
- `haulhub-frontend/src/app/features/admin/lorry-verification/`
- `haulhub-frontend/src/app/features/admin/user-verification/`
- `haulhub-frontend/src/app/features/admin/broker-management/`

#### 3. App Routes
**File**: `haulhub-frontend/src/app/app.routes.ts`
**Changes**:
- Remove `truck-owner` route entirely
- Remove `UserRole.LorryOwner` reference
- Keep all other routes as-is

#### 4. Header Navigation
**File**: `haulhub-frontend/src/app/shared/components/header/header.component.ts`
**Changes**:
- Remove TruckOwner navigation items
- Update dashboard titles per design Q9:
  - Admin → "Admin Dashboard"
  - Carrier → "Carrier Dashboard"
  - Dispatcher → "Dispatcher Dashboard"
  - Driver → "Driver Dashboard"
- Update role-based menu items (Admin no longer has verification/broker links)

#### 5. Auth Components
**File**: `haulhub-frontend/src/app/features/auth/register/register.component.ts`
**Changes**:
- Remove `TruckOwner`/`LorryOwner` from role dropdown
- Role options: `Dispatcher`, `Carrier`, `Driver` (Admin cannot self-register — only claim placeholders)
- Registration flow handles claim transparently (backend returns identical response for placeholder and new account)

**File**: `haulhub-frontend/src/app/core/services/auth.service.ts`
**Changes**: Update role references. Remove TruckOwner/LorryOwner handling. Update post-login redirect logic for 4 roles.

**File**: `haulhub-frontend/src/app/core/guards/auth.guard.ts`
**Changes**: Update role checks — remove TruckOwner/LorryOwner.

#### 6. Core Services Cleanup
**File**: `haulhub-frontend/src/app/core/services/admin.service.ts`
**Changes**: Remove verification methods. Keep any methods needed for Admin dashboard queries.

**File**: `haulhub-frontend/src/app/core/services/carrier.service.ts`
**Changes**: Remove TruckOwner references from `getAllAssets()` response type.

**File**: `haulhub-frontend/src/app/core/services/pdf-export.service.ts`
**Changes**: Update "Dispatcher Dashboard Report" references if needed.

### Tests for This Phase:

#### Unit Tests:
- [ ] App routes have no truck-owner path
- [ ] Auth guard recognizes exactly 4 roles
- [ ] Register component offers exactly 3 role options (Dispatcher, Carrier, Driver)
- [ ] No imports from deleted modules

### Success Criteria:

#### Automated Verification:
- [ ] `cd haulhub-frontend && npm run build` compiles with zero errors
- [ ] `cd haulhub-frontend && npm test` passes
- [ ] `grep -r "TruckOwner\|LorryOwner\|truckOwnerId\|truck-owner" haulhub-frontend/src/` returns zero matches (excluding node_modules)
- [ ] `grep -r "TripStatus\|trip\.interface\|lorry\.interface" haulhub-frontend/src/` returns zero matches

#### Manual Verification:
- [ ] Navigate to `/truck-owner/dashboard` → redirects to login (route doesn't exist)
- [ ] Registration page shows 3 role options
- [ ] Login as each role → correct dashboard loads with correct title
- [ ] Header navigation shows correct menu items per role
- [ ] No console errors on any page

**Implementation Note**: After completing this phase, the entire application is v2. Run full regression testing across all roles.

---

## Performance Considerations

- **DynamoDB reads**: Ownership check via `ConditionExpression` is a single read-modify-write — no extra read needed. `ReturnValuesOnConditionCheckFailure` adds minimal overhead.
- **Entity resolution**: `POST /entities/resolve` batches up to 50 UUIDs in a single request. Uses `BatchGetItem` internally for O(1) lookups per UUID.
- **Asset cache**: localStorage persistence avoids redundant API calls. 4hr TTL balances freshness with performance. Forced refresh only on Create Order navigation.
- **Cascading dropdowns**: Carrier asset fetch is 3 parallel API calls (trucks, trailers, drivers). Consider combining into a single `GET /carriers/:id/assets` endpoint if latency is an issue.

## Migration Notes

- Old DynamoDB tables remain untouched — rollback is possible by reverting code and env vars
- Cognito user pool is shared between old and new — no migration needed
- v2 seed data is already deployed — no data migration needed
- When ready to deploy to production: update Lambda env vars to point to v2 tables, deploy new code
- After successful deployment: old tables can be archived or deleted
