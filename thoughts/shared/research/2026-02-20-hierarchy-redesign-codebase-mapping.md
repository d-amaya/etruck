---
date: 2026-02-20T16:35:13Z
researcher: Kiro
git_commit: 0b0a30c
branch: main
repository: github.com/d-amaya/etruck
topic: "eTrucky Hierarchy Redesign — Requirements-to-Codebase Mapping & Design Refinement"
tags: [research, codebase, redesign, requirements, migration, v2]
status: complete
last_updated: 2026-02-20
last_updated_by: Kiro
---

# Research: eTrucky Hierarchy Redesign — Requirements-to-Codebase Mapping

**Date**: 2026-02-20T16:35:13Z
**Researcher**: Kiro
**Git Commit**: 0b0a30c
**Branch**: main
**Repository**: github.com/d-amaya/etruck

## Research Question

Map the v2 requirements (from `thoughts/shared/research/requirements.md`) against the current codebase, validate the existing design document (`thoughts/shared/design.md`), and identify gaps, inconsistencies, and concrete file-level changes needed — while respecting UX/UI, performance, and migration constraints.

## Summary

The existing design document is comprehensive and well-aligned with the requirements. The v2 infrastructure (DynamoDB tables, seed script) is already deployed. This research maps every requirement to its current codebase location and identifies the concrete changes needed. Three areas require design refinement: (1) the frontend caching strategy must evolve from the existing pattern rather than replace it, (2) the Dispatcher's cascading Carrier→Asset dropdown needs explicit UX specification, and (3) the index-selector service needs updating for the new GSI layout.

---

## Detailed Findings

### 1. Shared Types — What Exists vs What's Needed

**Current files** (`haulhub-shared/src/`):

| File | Current State | Required Change |
|------|--------------|-----------------|
| `enums/user-role.enum.ts` | Has: Dispatcher, TruckOwner, LorryOwner, Driver, Admin, Carrier | Remove TruckOwner, LorryOwner |
| `enums/trip-status.enum.ts` | Has: Scheduled, PickedUp, InTransit, Delivered, Paid, Canceled | Replace with: Scheduled, PickingUp, Transit, Delivered, WaitingRC, ReadyToPay, Canceled |
| `enums/verification-status.enum.ts` | Has: Pending, Verified, Rejected | Remove entirely |
| `enums/lorry-verification-status.enum.ts` | Exists | Remove entirely |
| `enums/vehicle-verification-status.enum.ts` | Exists | Remove entirely |
| `interfaces/trip.interface.ts` | Has truckOwnerId, orderConfirmation, brokerRate, factoryRate, etc. | Replace with Order interface per design Section 6 |
| `interfaces/user.interface.ts` | Has verificationStatus, no subscriptions | Replace with User interface per design Section 7 |
| `interfaces/truck.interface.ts` | Has truckOwnerId, verificationStatus, LegacyTruck | Remove truckOwnerId, verificationStatus, LegacyTruck; add audit fields |
| `interfaces/trailer.interface.ts` | Has ownerId (not carrierId), verificationStatus | Change ownerId→carrierId; remove verificationStatus; add audit fields |
| `interfaces/broker.interface.ts` | Correct as-is | No change |
| `interfaces/workflow-rules.interface.ts` | Uses old TripStatus values and old role names | Update to new statuses and new role-based permissions per design Section 5 |
| `interfaces/payment-report.interface.ts` | Has TruckOwnerPaymentReport | Replace with per-role payment reports |
| `dtos/trip.dto.ts` | CreateTripDto has orderConfirmation, truckOwnerId; UpdateTripDto has factory fields | Replace with CreateOrderDto, UpdateOrderDto per design |
| `dtos/truck.dto.ts` | Has truckOwnerId references | Remove truckOwnerId |
| `dtos/trailer.dto.ts` | Exists | Update to match new Trailer interface |
| `utils/trip-calculations.util.ts` | Calculates profit as brokerPayment - all expenses | Replace with per-role profit calculations per design Section 17 |

**New files needed:**
- `enums/order-status.enum.ts` — new OrderStatus enum
- `enums/account-status.enum.ts` — new AccountStatus type
- `interfaces/order.interface.ts` — new Order interface (replaces Trip)
- `dtos/order.dto.ts` — new CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto, OrderFilters

### 2. Backend Modules — What Exists vs What's Needed

**Current modules** (`haulhub-backend/src/`):

| Module | Current State | Required Change |
|--------|--------------|-----------------|
| `trips/` | trips.controller.ts (11KB), trips.service.ts (143KB), index-selector.service.ts (6.7KB) | Rename to `orders/`; rewrite service for new data model, new GSI layout, per-role filtering |
| `auth/` | auth.controller.ts, auth.service.ts (15KB), JWT guards, role decorators | Update register flow for create-then-claim; update role enum references |
| `users/` | users.service.ts (19KB), users.controller.ts | Add subscription management endpoints; add entity resolution endpoint (`POST /entities/resolve`) |
| `admin/` | admin.controller.ts, admin.service.ts (12KB), brokers.controller.ts, brokers.service.ts | Gut admin verification; remove broker CRUD (keep GET only); repurpose for Admin business-owner dashboard queries |
| `carrier/` | carrier.controller.ts (35KB), carrier.service.ts (6KB) | Update for new model (Carrier = asset owner, not top-level entity) |
| `lorries/` | lorries.controller.ts (6.4KB), lorries.service.ts (40KB) | Rename to `assets/`; remove truckOwnerId logic; add audit fields; support Dispatcher creating assets for subscribed Carriers |
| `analytics/` | analytics.controller.ts (4.8KB), analytics.service.ts (58KB) | Update profit calculations per role per design Section 17 |
| `documents/` | documents.controller.ts, documents.service.ts, file-storage.service.ts | Keep as-is (no changes in requirements) |
| `fuel/` | fuel.service.ts (11KB) | Keep as-is (fuel calculations unchanged) |
| `config/` | config.service.ts, aws.service.ts | Add v2 table name env vars |

**New endpoints needed:**
- `POST /entities/resolve` — batch UUID→display-info resolution (design Section 10)
- `GET /users/subscriptions` — get current user's subscription lists
- `PATCH /users/subscriptions` — update subscription lists (bidirectional sync)
- `POST /users/placeholder` — create placeholder account (Cognito + DDB)

**Index Selector changes:**
The current `index-selector.service.ts` selects between GSI1-GSI4 based on filter selectivity for the Dispatcher's view. In v2:
- Each role queries their own dedicated GSI (Admin→GSI4, Dispatcher→GSI2, Carrier→GSI1, Driver→GSI3)
- Secondary filters (broker, truck, driver) are applied as FilterExpressions on the role's primary GSI
- The index selector logic simplifies: role determines the GSI, filters narrow within it

### 3. Frontend Modules — What Exists vs What's Needed

**Current feature modules** (`haulhub-frontend/src/app/features/`):

| Module | Current State | Required Change |
|--------|--------------|-----------------|
| `dispatcher/` | dashboard (state, cache, filters, table, charts, analytics, payments), trip-create, trip-edit, trip-detail, trip-list | Update forms for Carrier→Asset cascading dropdown; update financial fields per role; add adminId selection; rename trip→order terminology |
| `carrier/` | dashboard (state, cache, filters, table, charts, analytics, payments), trip-list, asset-management, user-management | Update dashboard title ("Carrier Dashboard"); update financial visibility (hide broker/admin/dispatcher payments); update profit calculation |
| `driver/` | dashboard (state, cache, filters, table, charts), trip-list, payment-report | Update financial visibility (show only driver payment); update status transitions |
| `admin/` | dashboard, user-verification, lorry-verification, broker-management | Remove user-verification, lorry-verification, broker-management; rebuild dashboard as business-owner view with org-wide order visibility |
| `truck-owner/` | dashboard, truck-list, truck-registration, trailer-list, trailer-registration, vehicle-trip-list | **Remove entirely** |
| `auth/register/` | register.component.ts (7.8KB) | Update for create-then-claim flow; remove TruckOwner role option |

### 4. UX/UI Constraint — Preserving Existing Patterns

The requirements state: "All changes must be implemented while preserving the current look and feel."

**Dashboard pattern (must preserve):**
Each dashboard follows this architecture:
```
dashboard.component.ts (shell)
├── *-state.service.ts (BehaviorSubjects for filters, pagination, loading, error, caches)
├── *-asset-cache.service.ts (entity resolution with localStorage, TTL, cache-on-miss)
├── *-filter.service.ts (shared filter state across sub-components)
├── *-filter-card/ (filter UI component)
├── *-trip-table/ (data table with pagination)
├── *-charts-widget/ (Chart.js visualizations)
├── view-mode-selector/ (Table/Analytics/Payments toggle)
├── analytics-wrapper/ (analytics view)
└── payments-wrapper/ (payment report view)
```

**Dispatcher dashboard** (`features/dispatcher/dashboard/`):
- `DashboardStateService`: BehaviorSubjects for filters, pagination, loading, error; view caching (analytics, payment, trips); broker caching with cache-on-miss; 30s loading timeout
- `AssetCacheService`: forkJoin loads trucks/trailers/drivers/brokers/truckOwners; localStorage with 4-hour TTL; cache-on-miss with 15-min failed-lookup TTL
- `SharedFilterService`: bridges filter state between filter-card and table
- `TripTableComponent`: displayedColumns includes status, scheduledTimestamp, pickupLocation, dropoffLocation, brokerName, truckId, truckOwnerId, driverName, revenue, expenses, profitLoss, actions

**Carrier dashboard** (`features/carrier/`):
- `CarrierDashboardStateService`, `CarrierAssetCacheService`, `CarrierFilterService`
- Same pattern as Dispatcher but scoped to Carrier's data

**Driver dashboard** (`features/driver/dashboard/`):
- `DriverDashboardStateService`, `DriverAssetCacheService`, `DriverSharedFilterService`
- Same pattern but simpler (fewer filters)

**Design refinement needed:** The design's Section 10 proposes a two-tier cache (subscribed + resolved) with 5-minute refresh and `POST /entities/resolve`. This is an evolution of the existing `AssetCacheService` pattern, not a replacement. The implementation should:
1. Keep the existing `*-asset-cache.service.ts` per-dashboard pattern
2. Extend it to support the subscription model (subscribed bucket = current forkJoin load; resolved bucket = new cache-miss resolution)
3. Add the `POST /entities/resolve` backend endpoint for cache-miss batch resolution
4. Keep localStorage persistence with TTL
5. Add forced refresh on Create Order page navigation

### 5. Performance Constraint — Preserving Pagination

**Current pagination pattern:**
- Frontend sends `lastEvaluatedKey` as `x-pagination-token` header
- Backend uses DynamoDB's `ExclusiveStartKey` for cursor-based pagination
- `DashboardStateService.PaginationState` tracks: page, pageSize, lastEvaluatedKey, pageTokens[]
- `pageTokens[]` stores tokens for each page to enable back-navigation
- Filter changes reset to page 0 and clear pageTokens
- Page size changes also reset to page 0

**Current index selection:**
- `IndexSelectorService` selects GSI based on filter selectivity
- Priority: driverId (GSI3) > brokerId (GSI4) > default dispatcher (GSI1)
- GSI2 was for lorryId (truck) filtering

**v2 changes:**
- Each role has a dedicated primary GSI (no cross-role index selection needed)
- Admin uses GSI4 (`ADMIN#<adminId>`), Dispatcher uses GSI2 (`DISPATCHER#<dispatcherId>`), Carrier uses GSI1 (`CARRIER#<carrierId>`), Driver uses GSI3 (`DRIVER#<driverId>`)
- Secondary filters (broker, truck, driver, status) applied as FilterExpressions
- Pagination logic stays identical — just the GSI selection changes

### 6. Migration Constraint — What's Already Done

**Infrastructure (already deployed):**
- `database-stack.ts` has both old and v2 table definitions
- v2 tables: eTruckyOrders (5 GSIs), eTruckyUsers (2 GSIs), eTruckyTrucks (1 GSI), eTruckyTrailers (1 GSI), eTruckyBrokers (no GSIs)
- GSI4 on v2OrdersTable uses `ADMIN#` prefix (correct per design)
- v2TrucksTable has only GSI1 (no GSI2 for TruckOwner — correct per design)

**Seed data (already created):**
- `scripts/seed-v2.ts` + `scripts/seed-v2-helpers.ts`
- Seeds: 2 Admins, 3 Dispatchers, 3 Carriers, 8 Drivers, 12 Trucks, 12 Trailers, 20 Brokers, 200+ Orders
- Uses new financial model (5%/5%/90%), new statuses, subscription model, audit fields
- Cognito users created with `MessageAction: 'SUPPRESS'`

**Backend .env (already configured):**
```
ETRUCKY_ORDERS_TABLE=eTruckyOrders
ETRUCKY_V2_USERS_TABLE=eTruckyUsers
ETRUCKY_V2_TRUCKS_TABLE=eTruckyTrucks
ETRUCKY_V2_TRAILERS_TABLE=eTruckyTrailers
ETRUCKY_V2_BROKERS_TABLE=eTruckyBrokers
```

### 7. Design Validation — Gaps Found

| # | Gap | Location | Resolution |
|---|-----|----------|------------|
| 1 | Design Section 10 (caching) proposes a new architecture; requirements say "retain existing patterns" | Design vs Requirements | Evolve existing AssetCacheService pattern; add resolved bucket and /entities/resolve endpoint |
| 2 | Dispatcher trip-create form needs cascading Carrier→Asset dropdown UX spec | Design Section 11 mentions it but lacks detail | Add explicit UX flow: Carrier dropdown → on select, load assets for that Carrier → populate Truck/Trailer/Driver dropdowns |
| 3 | IndexSelectorService needs rewrite for role-based GSI selection | `haulhub-backend/src/trips/index-selector.service.ts` | Simplify: role determines GSI, filters narrow within it |
| 4 | Admin dashboard is currently a system-admin view (verification, broker CRUD) | `features/admin/` | Rebuild as business-owner dashboard following the same pattern as Dispatcher dashboard |
| 5 | The `Trailer` interface uses `ownerId` not `carrierId` | `haulhub-shared/src/interfaces/trailer.interface.ts` | Change to `carrierId` |
| 6 | Design mentions `Truck.rate` for default fuel rate but current Truck interface has no `rate` field | `haulhub-shared/src/interfaces/truck.interface.ts` | Add `rate?: number` and `fuelGasAvgGallxMil?: number`, `fuelGasAvgCost?: number` |
| 7 | Driver interface in shared has no `carrierId` field | `haulhub-shared/src/interfaces/user.interface.ts` | Already in design Section 7; needs implementation |
| 8 | `brokerAdvance` and `driverAdvance` still in UpdateTripDto | `haulhub-shared/src/dtos/trip.dto.ts` | Remove per design Q1 resolution |

---

## Code References

- `haulhub-shared/src/enums/user-role.enum.ts` — Current UserRole enum
- `haulhub-shared/src/enums/trip-status.enum.ts` — Current TripStatus enum (needs replacement)
- `haulhub-shared/src/interfaces/trip.interface.ts` — Current Trip interface (needs replacement with Order)
- `haulhub-shared/src/interfaces/user.interface.ts` — Current User interface (needs expansion)
- `haulhub-shared/src/utils/trip-calculations.util.ts` — Current financial calculations (needs per-role rewrite)
- `haulhub-backend/src/trips/trips.service.ts` — Main backend service (143KB, needs rewrite)
- `haulhub-backend/src/trips/index-selector.service.ts` — GSI selection logic (needs simplification)
- `haulhub-backend/src/admin/admin.service.ts` — Admin verification (needs gutting)
- `haulhub-backend/src/admin/brokers.service.ts` — Broker CRUD (keep GET only)
- `haulhub-frontend/src/app/features/dispatcher/dashboard/dashboard-state.service.ts` — Dashboard state pattern (preserve)
- `haulhub-frontend/src/app/features/dispatcher/dashboard/asset-cache.service.ts` — Asset caching pattern (evolve)
- `haulhub-frontend/src/app/features/truck-owner/` — Entire module to remove
- `haulhub-infrastructure/lib/stacks/database-stack.ts` — v2 tables already defined
- `scripts/seed-v2.ts` — v2 seed data already created
- `haulhub-backend/.env` — v2 table names already configured

## Architecture Documentation

The codebase follows a consistent architecture across all layers:
- **Shared**: TypeScript interfaces/enums/DTOs consumed by both backend and frontend
- **Backend**: NestJS modules (controller + service per domain), DynamoDB via AWS SDK v3, Cognito for auth
- **Frontend**: Angular 17+ standalone components, per-dashboard state services, localStorage caching, Chart.js
- **Infrastructure**: AWS CDK with separate stacks (auth, database, api, storage, frontend)

## Historical Context (from thoughts/)

- `thoughts/shared/design.md` — Comprehensive design document created 2026-02-20, covers all 17 sections
- `thoughts/shared/research/requirements.md` — Original requirements document with all constraints

## Open Questions

1. Should the Admin dashboard reuse the Dispatcher's dashboard-state pattern exactly, or should it have a simplified version (since Admins can't create/edit orders)?
2. The Dispatcher's "create asset on the fly" feature during order creation — should this be a dialog/modal or inline form expansion?
3. Should the `POST /entities/resolve` endpoint require authentication, or be a lightweight public endpoint for display-only data?
