# eTrucky Hierarchy Redesign — Detailed Design Document

**Date**: 2026-02-20
**Author**: Kiro + Daniel
**Git Commit**: 0b0a30c (branch: main)
**Repository**: github.com/d-amaya/etruck

---

## Table of Contents

1. [Introduction & Background](#1-introduction--background)
2. [New Role Definitions](#2-new-role-definitions)
3. [Relationships & Subscription Model](#3-relationships--subscription-model)
4. [Financial Model](#4-financial-model)
5. [Order Status Lifecycle](#5-order-status-lifecycle)
6. [Order Data Model](#6-order-data-model)
7. [User Data Model](#7-user-data-model)
8. [Asset Data Models](#8-asset-data-models)
9. [Registration & Account Claim Flow](#9-registration--account-claim-flow)
10. [Client-Side Asset Caching Strategy](#10-client-side-asset-caching-strategy)
11. [Dashboard & Table Design Per Role](#11-dashboard--table-design-per-role)
12. [Broker Management](#12-broker-management)
    - 12.1 [Dispatcher Order Form — Cascading Dropdown](#121-dispatcher-order-form--cascading-carrierasset-dropdown)
13. [Infrastructure & Migration Strategy](#13-infrastructure--migration-strategy)
14. [Current DynamoDB State — Gap & Waste Analysis](#14-current-dynamodb-state--gap--waste-analysis)
15. [What Gets Removed](#15-what-gets-removed)
16. [Resolved Questions](#16-resolved-questions)
    - 16.1 [DynamoDB Pagination — Hard Requirement](#161-dynamodb-pagination--hard-requirement)
17. [Revised Financial Model (Final)](#17-revised-financial-model-final)
18. [Concrete Codebase Change Map](#18-concrete-codebase-change-map)

---

## 1. Introduction & Background

### 1.1 What eTrucky Is

eTrucky is a serverless transportation management system for the US trucking logistics industry. It is built on AWS (Lambda, DynamoDB, Cognito, S3, CloudFront, API Gateway) with an Angular 17+ frontend and a NestJS backend. The codebase is organized as a monorepo with four packages: `haulhub-shared` (TypeScript types/DTOs), `haulhub-backend` (NestJS API), `haulhub-frontend` (Angular app), and `haulhub-infrastructure` (AWS CDK).

The application coordinates the workflow between companies that need goods transported (via Brokers) and the people who make that happen. A Broker publishes a deal (e.g., "truck needed to move a container from Houston to Dallas"), and the eTrucky users coordinate to fulfill that order.

### 1.2 The Old Model (What Was Built)

The application was originally built with a **carrier-centric hierarchy**:

```
Carrier (top-level logistics company)
├── Dispatchers (created by Carrier, create/manage trips)
├── Drivers (created by Carrier, execute trips)
├── Truck Owners (created by Carrier, own trucks)
├── Trucks (belong to Carrier, linked to Truck Owners)
└── Trailers (belong to Carrier)
```

In this model:
- The **Carrier** was the top-level organizational entity that owned everything.
- **Dispatchers** belonged to exactly one Carrier and created trips by selecting from the Carrier's assets.
- **Truck Owners** were separate users who owned trucks within a Carrier's organization.
- **Drivers** belonged to a Carrier and were assigned to trips.
- An **Admin** role existed as a system administrator who verified users, approved truck registrations, and managed the global broker list.
- All users were created by the Carrier (except Admin, created manually).
- The Carrier had a dashboard showing all trips across all their Dispatchers.

This model was implemented end-to-end with:
- 5 DynamoDB tables: `eTrucky-Users`, `eTrucky-Trips`, `eTrucky-Trucks`, `eTrucky-Trailers`, `eTrucky-Brokers`
- GSIs for role-based querying (Carrier, Dispatcher, Driver, TruckOwner, Broker)
- Full NestJS backend with JWT auth via Cognito, role-based access control, and role-based field filtering
- Angular dashboards for each role (Carrier, Dispatcher, Driver, TruckOwner, Admin)
- Seed data: 1 Carrier, 2 Dispatchers, 8 Drivers, 3 Truck Owners, 15 Trucks, 18 Trailers, ~300 Trips, 20 Brokers

### 1.3 Why It's Changing

After further analysis of how the US trucking logistics industry actually operates, the original requirements were found to be incorrect. The hierarchy was inverted. In reality:

- The **Admin** is not a system administrator — they are the **business owner** who has direct relationships with Brokers, negotiates orders, and delegates work to Dispatchers. They earn a commission (typically 5% of the order rate) as a pure intermediary with no operational risk.

- The **Dispatcher** is not an employee of a Carrier — they are an **independent intermediary** who knows many Carriers. They receive orders from Admins and find the right Carrier (with available trucks and drivers) to execute each order. They also earn a commission (typically 5%).

- The **Carrier** is not the top-level entity — they are the **company that owns the assets** (trucks, trailers) and employs drivers. They receive orders from Dispatchers and execute them. They earn the remaining ~90% of the order rate but carry all the operational risk (fuel costs, driver payments, etc.).

- The **Truck Owner** role does not exist as a separate entity — the Carrier IS the truck owner. This was a confusion in the original requirements.

- **Relationships are many-to-many**: An Admin can work with multiple Dispatchers. A Dispatcher can work with multiple Admins AND multiple Carriers. A Carrier can receive orders from multiple Dispatchers.

### 1.4 The New Model

```
Admin (Business Owner)
├── contacts Brokers, negotiates orders
├── delegates orders to their Dispatchers
├── earns 5% of Order Rate (pure profit, no risk)
└── needs org-wide visibility across all their Dispatchers

Dispatcher (Intermediary)
├── receives orders from Admin
├── knows many Carriers, assigns orders to a specific Carrier
├── earns 5% of Order Rate (pure profit, no risk)
├── can create/modify Carrier assets (if subscribed)
└── sees only their own orders

Carrier (Asset Owner / Executor)
├── owns Trucks, Trailers; employs Drivers
├── receives orders from Dispatchers
├── manages their own costs (fuel, driver pay)
├── earns ~90% of Order Rate (carries the risk)
└── does NOT see Broker payment, Admin payment, or Dispatcher payment

Driver (Carrier's Employee)
├── executes the trip physically
├── can update order status and add notes
├── sees only their own payment and mileage
└── profit = their payment (always positive)
```

### 1.5 Hard Constraints

These constraints are non-negotiable and apply to ALL implementation work.

**UX/UI Constraint:** The current look and feel, styling, and customer experience of eTrucky MUST NOT change. The existing dashboard structure, components, Angular Material theming, and layout patterns MUST remain intact. Any new component (e.g., Admin business-owner dashboard) MUST adopt the same visual style, component structure, and interaction patterns as the existing dashboards. No new CSS frameworks, no redesigned layouts, no altered color schemes or typography.

**Efficiency Constraint:** The existing state management and caching strategies MUST be retained. Every dashboard uses the same architecture: `*-state.service.ts` (BehaviorSubjects for filters, pagination, loading, error, view caches), `*-asset-cache.service.ts` (entity resolution with localStorage, TTL, cache-on-miss), `*-filter.service.ts` (shared filter state). Any new dashboard or component MUST adopt these same patterns. No alternative state management libraries, no different caching approaches.

**Pagination Constraint:** The existing DynamoDB pagination logic (`lastEvaluatedKey` via `x-pagination-token` header, `pageTokens[]` for back-navigation, filter-reset-to-page-0) is a hard requirement. Any new dashboard MUST implement the same pagination strategy. See Section 16.1 for details.

### 1.6 Key Decisions Made During Design

The following decisions were reached through discussion between Daniel (product owner) and Kiro (AI assistant) on 2026-02-20. Each decision is documented here so that future sessions can understand the reasoning without access to the original conversation.

#### Decision 1: Many-to-Many Relationships
Admin↔Dispatcher and Dispatcher↔Carrier are both many-to-many. A Dispatcher can work for multiple Admins simultaneously and with multiple Carriers. This means there is no `adminId` or `carrierId` on the Dispatcher's user record — these relationships are expressed at the Order level (each order specifies which Admin and which Carrier it belongs to) and via subscription lists.

#### Decision 2: Subscription Model for Permissions
The permission model works via subscription lists on the user who needs to select from a dropdown:
- **Dispatcher's record** has `subscribedAdminIds: string[]` — controls which Admins appear in the Dispatcher's Create Order dropdown.
- **Dispatcher's record** has `subscribedCarrierIds: string[]` — controls which Carriers appear in the Dispatcher's dropdowns and which Carriers' assets the Dispatcher can create/modify.

The Admin does NOT need a reciprocal `subscribedDispatcherIds` list — their Dispatcher filter is derived from order data (unique `dispatcherId` values from their GSI4 query results).

Subscription is initiated by the entity being subscribed (an Admin subscribes to a Dispatcher's list, a Carrier subscribes to a Dispatcher's list). When a Dispatcher creates a new Carrier placeholder, that Carrier is auto-subscribed. Unsubscribing removes the ID from the list but does not affect existing orders.

#### Decision 3: No Denormalized Names on Order Records
Instead of storing snapshot names (carrierName, driverName, etc.) on each order record, the system uses a client-side caching strategy (detailed in Section 10). This was chosen because:
- It avoids stale names on order records when entities rename.
- Filters always operate on UUIDs (not names), so name changes don't break filtering.
- The cache self-heals: misses are resolved automatically and cached for future use.
- Order records stay lean (no duplicate name fields).

The tradeoff is that a backend endpoint must exist to resolve any UUID to display info regardless of subscription status, and entities must be soft-deleted (never hard-deleted) so resolution always works.

**Order immutability rule:** Orders are snapshots of the assignment at creation time. If an asset (Truck, Trailer) or a Driver is later transferred to a different Carrier, existing orders are NOT modified — they retain the original `carrierId`, `truckId`, `trailerId`, `driverId`. The transfer only affects which Carrier's asset pool the entity appears in for future order creation. Historical orders remain queryable by the original Carrier via their GSI, and the asset's display info (plate, name) resolves via entity cache regardless of current ownership.

**Asset transfer flow (Truck/Trailer):** Ownership transfer uses an invite/accept pattern (same as Driver mobility in Q10):
1. Carrier-2 requests ownership transfer → `pendingCarrierId` is set on the asset record
2. Carrier-1 sees a transfer request indicator next to the asset → accepts or rejects
3. Accept → `carrierId` updates to Carrier-2, `pendingCarrierId` clears, GSI1PK re-indexes automatically
4. Reject → `pendingCarrierId` clears

This preserves the asset's UUID across the transfer — no duplicate records, no plate uniqueness issues, and historical orders are unaffected (same `truckId`/`trailerId`, order immutability rule holds).

New optional fields on Truck and Trailer interfaces:
```typescript
pendingCarrierId?: string;  // Set when another Carrier requests ownership transfer
```

**Deferred to post-launch**: Transfer UI. For initial build, the manual workaround is: Carrier-1 deactivates the asset, Carrier-2 registers it fresh (same plate, new UUID). This requires plate/VIN uniqueness checks to only match active records (`isActive = true`). The current `getTruckByPlate` scan in `lorries.service.ts` does not filter by `isActive` — this must be fixed in v2.

#### Decision 4: Order Statuses
The old statuses (Scheduled, Picked Up, In Transit, Delivered, Paid, Canceled) are replaced with new statuses reflecting the actual business workflow. "Picking Up" is an in-progress state (driver en route), different from the old "Picked Up" (completed action). "Waiting RC" means awaiting documentation/rate confirmation. "Ready To Pay" means all docs are in order. See Section 5 for full details.

#### Decision 5: Financial Visibility by Role
Each role sees only the financial fields relevant to them. Admin and Dispatcher do NOT see fuel costs or driver costs. Carrier does NOT see the broker payment (order rate), admin payment, or dispatcher payment. Driver sees only their own payment. Charts and analytics use each role's own profit metric as the input, not the overall order profit. See Section 4 for the full matrix.

#### Decision 6: Editing Permissions
- Admin can update the Dispatcher's rate on an order (which affects the Admin's profit calculation).
- Dispatcher can update the entire order EXCEPT their own rate.
- Carrier can update the Driver's rate and fuel-related inputs (which recalculate the Carrier's profit; Admin and Dispatcher profits are unaffected).
- Driver can only update order status and add notes.

#### Decision 7: Auto-Calculated Fields
When a Dispatcher creates an order, the system ALWAYS calculates and stores driver payment and fuel cost based on default rates from the Driver and Truck records. This ensures that when the Carrier opens the order, they immediately see these values and can adjust them if needed. The Dispatcher and Admin never see these fields in their views.

#### Decision 8: Broker Management Outside the App
Brokers are managed directly in DynamoDB by eTrucky engineers with admin permissions on DDB (not the Admin role in the app). The in-app broker management UI (create, edit, delete) is removed. Brokers remain a global read-only list available to Dispatchers and Admins when creating/viewing orders.

#### Decision 9: Registration & Account Claim Flow
The "Create-then-Claim" pattern handles the many-to-many world where User A needs to reference User B before User B has registered. Placeholder Cognito accounts are created with suppressed invitation emails. The real person claims the account by registering with the same email. The registration flow is identical whether a placeholder exists or not (preventing email enumeration attacks). Unclaimed accounts have zero app access. See Section 9 for full details.

#### Decision 10: Parallel Tables for Migration
To avoid breaking the deployed application while developing the new model, entirely new DynamoDB tables are created with a new naming convention. The deployed app continues using old tables; local development uses new tables. See Section 13 for the full migration strategy.

#### Decision 11: New Order Fields
`orderConfirmation` is replaced by `invoiceNumber` and `brokerLoad`. `adminId` is added to every order. New financial fields (`adminRate`, `adminPayment`, `carrierRate`, `carrierPayment`) support the new model. `brokerPayment` is conceptually renamed to `orderRate`.

#### Decision 12: Audit Fields on Assets
All assets (Trucks, Trailers) get `createdAt`, `createdBy`, `updatedAt`, and `lastModifiedBy` fields, since assets can be created by either a Dispatcher or a Carrier.

#### Decision 13: Backend Order Ownership Guard Rails
Every order mutation (update, status change, delete) must enforce two layers of authorization beyond the existing role gate:

1. **Ownership verification via DynamoDB `ConditionExpression`** (atomic, no read-then-check race condition). The update/delete command includes a condition that verifies the caller's relationship to the order based on their role:
   - Admin: `adminId = :callerId`
   - Dispatcher: `dispatcherId = :callerId`
   - Carrier: `carrierId = :callerId`
   - Driver: `driverId = :callerId`
   Uses `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'` to distinguish 404 from 403:
   - `ConditionalCheckFailedException` with `error.Item` → 403 "You do not have permission to update this order"
   - `ConditionalCheckFailedException` without `error.Item` → 404 "Order not found"

2. **Field-level allowlist enforcement** (per-role). The backend validates the incoming DTO against a per-role allowlist of modifiable fields. If the DTO contains fields the role is not permitted to modify → 400 Bad Request (not silent strip).

   | Role | Allowed Fields on Order Update |
   |------|-------------------------------|
   | Admin | `dispatcherRate` (triggers adminRate + payment recalc), `notes` |
   | Dispatcher | All fields EXCEPT `dispatcherRate`, `adminRate`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil` |
   | Carrier | `driverId`, `truckId`, `trailerId`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`, `notes` |
   | Driver | `notes` only (status updates via separate endpoint) |

   See `thoughts/shared/research/2026-02-20-order-ownership-authorization.md` for full analysis.

---

## 2. New Role Definitions

### Admin (Business Owner)
- Direct contact with Brokers; negotiates and accepts orders
- Delegates orders to their Dispatchers
- Earns 5% of Order Rate (pure profit, no risk)
- Needs org-wide visibility across all their Dispatchers
- Does NOT care about fuel costs or driver costs
- Profit = OrderRate − (LumperFees + DetentionFees + DispatcherPayment + CarrierPayment)

### Dispatcher (Intermediary)
- Receives orders from Admin, finds assets to execute them
- Knows many Carriers; assigns orders to a specific Carrier
- Earns 5% of Order Rate (pure profit, no risk)
- Sees only their own orders
- Does NOT care about fuel costs or driver costs
- Can create/modify Carrier assets (if Carrier is subscribed to them)
- Profit = OrderRate × DispatcherRate

### Carrier (Asset Owner / Executor)
- Owns Trucks, Trailers; employs Drivers
- Receives orders from Dispatchers
- Manages their own costs (fuel, driver pay)
- Earns ~90% of Order Rate (carries the risk)
- Does NOT see Broker payment, Admin payment, or Dispatcher payment
- Sees CarrierPayment as their "Revenue"
- Profit = CarrierPayment − FuelCost − DriverPayment

### Driver (Carrier's Employee)
- Executes the trip physically
- Can update order status and add notes
- Sees only their own payment and mileage
- Profit = DriverPayment (always positive)

---

## 3. Relationships & Subscription Model

### Admin ↔ Dispatcher (Many-to-Many)
- A Dispatcher can work for multiple Admins simultaneously
- An Admin can have multiple Dispatchers
- Modeled via `subscribedAdminIds: string[]` on the Dispatcher's user record
- When creating an order, the Dispatcher selects which Admin it belongs to
- The `adminId` lives on the Order record, not on the Dispatcher's user record
- An Admin subscribes to a Dispatcher → their adminId is added to the Dispatcher's `subscribedAdminIds`
- When a Dispatcher creates an Admin placeholder → auto-subscribed
- The Admin does NOT need a `subscribedDispatcherIds` list — their Dispatcher filter dropdown is derived from the orders themselves (unique `dispatcherId` values from GSI4 query results, resolved to names via entity cache)

### Dispatcher ↔ Carrier (Many-to-Many)
- A Dispatcher can work with multiple Carriers
- A Carrier can be used by multiple Dispatchers
- Modeled via `subscribedCarrierIds: string[]` on the Dispatcher's user record
- A Carrier subscribes to a Dispatcher → their carrierId is added to the Dispatcher's list
- When a Dispatcher creates a Carrier placeholder → auto-subscribed
- Subscription controls:
  1. Which Carriers appear in the Dispatcher's "Carrier" dropdown when creating/editing orders
  2. Which Carriers' assets (trucks, trailers, drivers) the Dispatcher can create/modify

### Bidirectional Subscription Discovery
During implementation planning, we identified that the Dispatcher needs to know which Admins they work for (to populate the "Select Admin" dropdown on the Create Order form). This is handled by `subscribedAdminIds: string[]` on the Dispatcher's record. The Admin does NOT need a reciprocal list — their Dispatcher filter is derived from order data (unique `dispatcherId` values from GSI4 results). No bidirectional sync is needed for the Admin↔Dispatcher relationship.

### Carrier → Driver (One-to-Many)
- Drivers belong to exactly one Carrier
- `carrierId` on the Driver's user record
- Carrier creates Driver placeholders (same claim flow as other roles)
- Driver mobility: `pendingCarrierId?: string` field on Driver record for Carrier transfer invites (UI deferred to post-launch)

### Unsubscribe Behavior
- Unsubscribing removes the ID from the subscription list
- Existing orders are NOT affected (they reference IDs directly)
- The Dispatcher/Admin can no longer create new orders for that entity
- Historical order data remains readable via the client-side asset cache (cache-miss resolution fetches by UUID from the backend)

---

## 4. Financial Model

### Payment Distribution

```
Order Rate (what the Broker pays for the trip)
├── Admin Payment      = OrderRate × AdminRate (default 5%)
├── Dispatcher Payment = OrderRate × DispatcherRate (default 5%)
├── Lumper Fees        (deducted from order)
├── Detention Fees     (deducted from order)
└── Carrier Payment    = OrderRate − AdminPayment − DispatcherPayment − LumperFees − DetentionFees
      ├── Driver Payment   = DriverRate × MileageOrder
      ├── Fuel Cost        = MileageTotal × GalPerMile × CostPerGal
      └── Carrier Profit   = CarrierPayment − DriverPayment − FuelCost
```

### Per-Role Financial Visibility

| Field | Admin | Dispatcher | Carrier | Driver |
|-------|-------|------------|---------|--------|
| Order Rate | ✅ | ✅ | ❌ | ❌ |
| Admin Rate / Payment | ✅ | ❌ | ❌ | ❌ |
| Dispatcher Rate / Payment | ✅ | ✅ | ❌ | ❌ |
| Carrier Payment | ✅ | ✅ | ✅ (as "Revenue") | ❌ |
| Lumper Fees | ✅ | ✅ | ✅ | ❌ |
| Detention Fees | ✅ | ✅ | ✅ | ❌ |
| Driver Rate / Payment | ❌ | ❌ | ✅ | ✅ |
| Fuel Inputs / Cost | ❌ | ❌ | ✅ | ❌ |
| Admin Profit | ✅ | ❌ | ❌ | ❌ |
| Dispatcher Profit | ❌ | ✅ | ❌ | ❌ |
| Carrier Profit | ❌ | ❌ | ✅ | ❌ |
| Driver Profit | ❌ | ❌ | ❌ | ✅ |

### Per-Role Editing Permissions

| Action | Admin | Dispatcher | Carrier | Driver |
|--------|-------|------------|---------|--------|
| Create Order | ❌ | ✅ | ❌ | ❌ |
| Edit Order (all fields except own rate) | ❌ | ✅ | ❌ | ❌ |
| Edit Dispatcher Rate | ✅ | ❌ | ❌ | ❌ |
| Edit Driver Rate, Fuel Inputs | ❌ | ❌ | ✅ | ❌ |
| Update Status | ❌ | ✅ | ✅ | ✅ |
| Add Notes | ✅ | ✅ | ✅ | ✅ |
| Delete Order | ❌ | ✅ | ❌ | ❌ |

### Auto-Calculated Fields at Order Creation

When a Dispatcher creates an order, the system ALWAYS calculates and stores:
- `adminPayment` = orderRate × adminRate
- `dispatcherPayment` = orderRate × dispatcherRate
- `carrierPayment` = orderRate − adminPayment − dispatcherPayment − lumperFees − detentionFees
- `driverPayment` = driverRate × mileageOrder (from Driver's default rate)
- `fuelCost` = mileageTotal × fuelGasAvgGallxMil × fuelGasAvgCost (from Truck's defaults)

These are stored on the order so Carriers see them immediately and can adjust if needed.

---

## 5. Order Status Lifecycle

### New Statuses

```
Scheduled → Picking Up → Transit → Delivered → Waiting RC → Ready To Pay
                                                     ↑            │
                                                     └────────────┘
                                                    (docs incomplete)

Canceled ← reachable from Scheduled or Picking Up
```

| Status | Meaning |
|--------|---------|
| Scheduled | Order created, not yet in motion |
| Picking Up | Driver en route to pickup location (in-progress) |
| Transit | Goods picked up, driver heading to delivery |
| Delivered | Goods delivered to destination |
| Waiting RC | Awaiting documentation / rate confirmation |
| Ready To Pay | All documentation received, payment can be processed |
| Canceled | Order canceled |

### Status Update Permissions

| From → To | Dispatcher | Carrier | Driver |
|-----------|------------|---------|--------|
| Scheduled → Picking Up | ✅ | ✅ | ✅ |
| Picking Up → Transit | ✅ | ✅ | ✅ |
| Transit → Delivered | ✅ | ✅ | ✅ |
| Delivered → Waiting RC | ✅ | ✅ | ❌ |
| Waiting RC → Ready To Pay | ✅ | ❌ | ❌ |
| Ready To Pay → Waiting RC | ✅ | ❌ | ❌ |
| Scheduled → Canceled | ✅ | ❌ | ❌ |
| Picking Up → Canceled | ✅ | ❌ | ❌ |

### OrderStatus Enum

```typescript
enum OrderStatus {
  Scheduled = 'Scheduled',
  PickingUp = 'Picking Up',
  Transit = 'Transit',
  Delivered = 'Delivered',
  WaitingRC = 'Waiting RC',
  ReadyToPay = 'Ready To Pay',
  Canceled = 'Canceled',
}
```

---

## 6. Order Data Model

### New Order Interface

```typescript
interface Order {
  // Primary key
  orderId: string;

  // Relationships (all userId-based)
  adminId: string;
  dispatcherId: string;
  carrierId: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  brokerId: string;

  // Order information
  invoiceNumber: string;       // NEW (replaces orderConfirmation)
  brokerLoad: string;          // NEW
  orderStatus: OrderStatus;

  // Timestamps (ISO 8601)
  scheduledTimestamp: string;
  pickupTimestamp: string | null;
  deliveryTimestamp: string | null;

  // Pickup location
  pickupCompany: string;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  pickupPhone: string;
  pickupNotes: string;

  // Delivery location
  deliveryCompany: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryPhone: string;
  deliveryNotes: string;

  // Mileage
  mileageEmpty: number;
  mileageOrder: number;
  mileageTotal: number;

  // Financial — Order level
  orderRate: number;           // What the Broker pays (was brokerPayment)
  adminRate: number;           // Admin's % (default 5%)
  adminPayment: number;        // orderRate × adminRate
  dispatcherRate: number;      // Dispatcher's % (default 5%)
  dispatcherPayment: number;   // orderRate × dispatcherRate
  carrierRate: number;         // Carrier's % (default 90%)
  carrierPayment: number;      // orderRate − adminPayment − dispatcherPayment − lumper − detention
  lumperValue: number;
  detentionValue: number;

  // Financial — Carrier level (hidden from Admin/Dispatcher)
  driverRate: number;          // $/mile
  driverPayment: number;       // driverRate × mileageOrder
  fuelGasAvgCost: number;      // $/gallon
  fuelGasAvgGallxMil: number;  // gallons/mile
  fuelCost: number;            // mileageTotal × fuelGasAvgGallxMil × fuelGasAvgCost

  // Notes
  notes: string;

  // Audit
  createdAt: string;
  updatedAt: string;
  lastModifiedBy: string;
}
```

### Fields Removed from Old Trip Model

| Removed Field | Reason |
|---------------|--------|
| `truckOwnerId` | TruckOwner role eliminated; Carrier owns trucks |
| `truckOwnerPayment` / `truckOwnerRate` | Replaced by `carrierPayment` / `carrierRate` |
| `orderConfirmation` | Replaced by `invoiceNumber` + `brokerLoad` |
| `brokerPayment` | Renamed to `orderRate` |
| `brokerRate` (old per-mile rate) | Replaced by `orderRate` (flat amount) |
| `factoryRate` / `factoryAdvance` / `factoryCost` | Never used (always 0 in seed data) |
| `brokerCost` | Never used |
| `brokerAdvance` | Review if needed (see Open Questions) |
| `orderAverage` | Never used |
| `orderExpenses` / `orderRevenue` | Replaced by explicit per-role calculations |

### DynamoDB Schema — eTruckyOrders Table

**Primary Key:**
- PK: `ORDER#<orderId>`
- SK: `METADATA`

**GSIs:**

| GSI | Partition Key | Sort Key | Purpose |
|-----|--------------|----------|---------|
| GSI1 | `CARRIER#<carrierId>` | `<scheduledTimestamp>#<orderId>` | Carrier's orders |
| GSI2 | `DISPATCHER#<dispatcherId>` | `<scheduledTimestamp>#<orderId>` | Dispatcher's orders |
| GSI3 | `DRIVER#<driverId>` | `<scheduledTimestamp>#<orderId>` | Driver's orders |
| GSI4 | `ADMIN#<adminId>` | `<scheduledTimestamp>#<orderId>` | Admin's orders (was OWNER#) |
| GSI5 | `BROKER#<brokerId>` | `<scheduledTimestamp>#<orderId>` | Broker filtering |

Note: GSI4 changes from `OWNER#<truckOwnerId>` (old) to `ADMIN#<adminId>` (new). Since we're creating a new table (`eTruckyOrders`), this is a clean definition — no migration of GSI keys needed.

---

## 7. User Data Model

### User Interface

```typescript
interface User {
  userId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DISPATCHER' | 'CARRIER' | 'DRIVER';
  accountStatus: 'unclaimed' | 'pending_verification' | 'active' | 'suspended';

  // Common fields
  company?: string;            // Carrier, Admin
  rate?: number;               // Dispatcher: % of order | Driver: $/mile
  ein?: string;                // Carrier, Admin
  ss?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;

  // Driver-specific
  carrierId?: string;          // Only for Drivers (belongs to one Carrier)
  cdlClass?: string;
  cdlState?: string;
  cdlIssued?: string;
  cdlExpires?: string;

  // Subscription lists
  subscribedCarrierIds?: string[];     // On Dispatcher records only
  subscribedAdminIds?: string[];       // On Dispatcher records only

  // Audit
  createdAt: string;
  createdBy: string;           // userId of whoever created this record
  updatedAt: string;
  lastModifiedBy: string;
  claimedAt?: string;          // When an unclaimed account was claimed

  isActive: boolean;
}
```

### UserRole Enum

```typescript
enum UserRole {
  Admin = 'Admin',
  Dispatcher = 'Dispatcher',
  Carrier = 'Carrier',
  Driver = 'Driver',
}
```

Removed: `TruckOwner`, `LorryOwner`

### DynamoDB Schema — eTruckyUsers Table

**Primary Key:**
- PK: `USER#<userId>`
- SK: `METADATA`

**GSIs:**

| GSI | Partition Key | Sort Key | Purpose |
|-----|--------------|----------|---------|
| GSI1 | `CARRIER#<carrierId>` | `ROLE#<role>#USER#<userId>` | Query Drivers by Carrier |
| GSI2 | `EMAIL#<email>` | `USER#<userId>` | Email lookups for registration/claim |

GSI1 is used for querying Drivers by their Carrier. For Admin→Dispatcher and Dispatcher→Carrier queries, we use the subscription lists on the user records (small arrays, no GSI needed).

---

## 8. Asset Data Models

### Truck Interface

```typescript
interface Truck {
  truckId: string;
  carrierId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  isActive: boolean;
  rate?: number;               // Default fuel rate or $/mile for this truck
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  lastModifiedBy: string;
}
```

Removed: `truckOwnerId` (Carrier owns trucks directly)

### DynamoDB Schema — eTruckyTrucks Table

**Primary Key:**
- PK: `TRUCK#<truckId>`
- SK: `METADATA`

**GSIs:**

| GSI | Partition Key | Sort Key | Purpose |
|-----|--------------|----------|---------|
| GSI1 | `CARRIER#<carrierId>` | `TRUCK#<truckId>` | Query trucks by Carrier |

Removed: GSI2 (`OWNER#<userId>`) — no more TruckOwner role.

### Trailer Interface

```typescript
interface Trailer {
  trailerId: string;
  carrierId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  lastModifiedBy: string;
}
```

### DynamoDB Schema — eTruckyTrailers Table

**Primary Key:**
- PK: `TRAILER#<trailerId>`
- SK: `METADATA`

**GSIs:**

| GSI | Partition Key | Sort Key | Purpose |
|-----|--------------|----------|---------|
| GSI1 | `CARRIER#<carrierId>` | `TRAILER#<trailerId>` | Query trailers by Carrier |

No changes from old model (except audit fields added to records).

### Broker Interface

```typescript
interface Broker {
  brokerId: string;
  brokerName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### DynamoDB Schema — eTruckyBrokers Table

**Primary Key:**
- PK: `BROKER#<brokerId>`
- SK: `METADATA`

No GSIs. No changes from old model.

---

## 9. Registration & Account Claim Flow

### Principles
- No invitation emails for placeholder accounts (suppressed via Cognito `MessageAction: 'SUPPRESS'`)
- Uniform registration flow — no information leak about whether a placeholder exists
- Email ownership is the identity proof (verification code sent to email)
- Unclaimed accounts have zero app access (empty profile completion screen)

### Placeholder Creation

1. A Dispatcher (or Admin) enters name + email + role for a new entity (Carrier, Admin, etc.) — either during order creation ("on the fly") or from a management screen.
2. Backend creates a Cognito user with `MessageAction: 'SUPPRESS'` (no email sent to the user).
3. Backend creates a DDB record in `eTruckyUsers` with `accountStatus: 'unclaimed'`.
4. `userId` = Cognito `sub` (stable UUID from creation). All order references use this ID from day one.
5. If a Dispatcher created a Carrier → the Carrier's ID is auto-added to the Dispatcher's `subscribedCarrierIds`.
6. The Dispatcher communicates out-of-band with the real person: "Go register on eTrucky with your email."

### Self-Registration / Claim Flow

1. User goes to the eTrucky registration page, enters email + name + password + role.
2. Backend checks Cognito for that email — three possible states:
   - **Already active (confirmed account)**: returns "This email is already registered." Frontend shows a "Go to Sign In" link. No verification code sent.
   - **Exists as placeholder (unclaimed)**: sends a verification code to that email address. Response: "Verification code sent to your email."
   - **Doesn't exist**: creates a new Cognito user, sends a verification code. Response: "Verification code sent to your email."
3. The response for placeholder and new-account cases is **identical** — this prevents email enumeration of placeholders. The already-active case is safe to distinguish (standard UX, not a security leak — every major service does this).
4. User receives the verification code in their inbox and enters it.
5. Account becomes `active`; password is set.
6. All existing order references (using the placeholder's userId) are already correct — no data migration needed.

### Email Correction

- The Dispatcher who created a placeholder can update the email at any time before the account is claimed.
- This updates the Cognito email attribute + DDB `email` field + `GSI2PK` (DynamoDB automatically re-indexes the item in GSI2).
- The `userId` remains unchanged; all order references stay valid.

### Security Analysis

| Threat | Mitigation |
|--------|------------|
| Email enumeration (brute-forcing to discover placeholders) | Uniform registration response — no information leak |
| Stranger claims wrong-email placeholder | No invitation email sent; stranger would have to independently visit eTrucky and register with that exact email. Even then, unclaimed accounts have zero data access. |
| Unauthorized access to placeholder data | Unclaimed accounts see nothing — just a profile completion screen |
| Dispatcher enters wrong email | Dispatcher can correct the email before claim; userId stays the same |

### Account Status Enum

```typescript
type AccountStatus = 'unclaimed' | 'pending_verification' | 'active' | 'suspended';
```

- `unclaimed`: Placeholder created by another user. No password set. Zero app access.
- `pending_verification`: User has started registration but hasn't verified email yet.
- `active`: Fully registered and verified. Full app access per role.
- `suspended`: Account disabled by system admin.

---

## 10. Client-Side Asset Caching Strategy

### Problem
Order tables display human-readable names (e.g., "Swift Logistics" instead of a UUID). If a Carrier unsubscribes from a Dispatcher, the Dispatcher loses access to that Carrier's asset list, and the table would show raw UUIDs. Additionally, if a Carrier renames their company, we need consistent display across all orders.

### UX/UI Constraint: Preserve Existing Patterns

The current codebase implements a per-dashboard caching architecture that must be preserved:

```
features/<role>/dashboard/
├── *-state.service.ts        ← BehaviorSubjects for filters, pagination, loading, error, view caches
├── *-asset-cache.service.ts  ← Entity resolution with localStorage, TTL, cache-on-miss
├── *-filter.service.ts       ← Shared filter state across sub-components
```

Each dashboard (Dispatcher, Carrier, Driver) has its own `AssetCacheService` that:
- Uses `forkJoin` to load all subscribed entities on dashboard load
- Persists to `localStorage` with a 4-hour TTL
- Implements cache-on-miss with a 15-minute failed-lookup TTL
- Tracks failed lookups to avoid hammering the backend

**This pattern must be retained.** The solution below evolves it rather than replacing it.

### Solution: Evolved Two-Tier Cache (extends existing AssetCacheService)

Each role's `AssetCacheService` is extended with a second bucket for resolved (unsubscribed/historical) entities.

#### Cache Structure (localStorage) — Evolution of Current Pattern

```json
{
  "timestamp": 1708444800000,
  "subscribed": {
    "trucks": { "<truckId>": { "plate": "ABC1234", "brand": "Peterbilt" } },
    "trailers": { "<trailerId>": { "plate": "XYZ5678", "brand": "Wabash" } },
    "drivers": { "<userId>": { "name": "James Garcia" } },
    "brokers": { "<brokerId>": { "brokerName": "C.H. Robinson" } },
    "carriers": { "<carrierId>": { "name": "Swift Transport", "company": "Swift LLC" } }
  },
  "resolved": {
    "<uuid>": { "name": "Old Carrier LLC", "type": "carrier", "fetchedAt": 1708444800000 }
  }
}
```

- **`subscribed` bucket**: Populated from the existing `forkJoin` load pattern. Refreshed on dashboard load (existing behavior) and on Create Order page navigation (new: forced refresh).
- **`resolved` bucket**: NEW. Populated from cache-miss fetches via `POST /entities/resolve`. Uses 30-minute TTL. Handles historical/unsubscribed entities.

#### Refresh Strategy (preserves existing triggers, adds new ones)

| Trigger | Action | Existing? |
|---------|--------|-----------|
| Dashboard load | `forkJoin` load all subscribed assets → populate `subscribed` bucket | ✅ Existing |
| Cache TTL expired (4 hours) | Clear and reload on next dashboard load | ✅ Existing |
| Navigate to Create Order page | **Forced full refresh** — bypass TTL, fetch fresh from backend. Carrier assets fetched live on every Carrier selection (never cached). | 🆕 New |
| Cache miss during table render | Batch-fetch unknown UUIDs via `POST /entities/resolve` → populate `resolved` bucket | 🆕 New |
| Failed lookup retry (15-min TTL) | Skip re-fetch for recently failed UUIDs | ✅ Existing pattern (extend to resolved bucket) |

#### Table Rendering Logic

When rendering an order table cell that needs a name:
1. Check `subscribed` cache for the UUID → if found, display current name.
2. Check `resolved` cache for the UUID → if found and not expired, display resolved name.
3. If neither → add UUID to a batch list. After processing all rows, call `POST /entities/resolve` with the batch. Populate `resolved` cache. Re-render.

This is the same cache-on-miss pattern already used by `DashboardStateService.getBrokerName()` — extended to all entity types.

#### Filters

Filters always operate on UUIDs, not names. The filter dropdown is populated from the `subscribed` cache (current names), but the filter value sent to the backend is the UUID. This means name changes never break filtering.

#### Backend Endpoint (NEW)

```
POST /entities/resolve
Body: { "ids": ["uuid-1", "uuid-2", "uuid-3"] }
Response: {
  "uuid-1": { "name": "Swift Transport", "type": "carrier" },
  "uuid-2": { "name": "James Garcia", "type": "driver" },
  "uuid-3": { "plate": "ABC1234", "brand": "Peterbilt", "type": "truck" }
}
```

- Returns minimal public display info for any entity by UUID.
- Works regardless of subscription status.
- Requires authentication (JWT) but no role restriction.
- Entities are soft-deleted (never hard-deleted), so resolution always works.
- If an entity is truly gone, returns `{ "name": "Unknown", "type": "unknown" }`.
- Batch limit: 50 UUIDs per request.

#### Codebase Impact

| Current File | Change |
|-------------|--------|
| `features/dispatcher/dashboard/asset-cache.service.ts` | Add `resolved` bucket, `POST /entities/resolve` integration, forced refresh on Create Order |
| `features/carrier/shared/carrier-asset-cache.service.ts` | Same evolution |
| `features/driver/dashboard/driver-asset-cache.service.ts` | Same evolution |
| `features/admin/dashboard/` (NEW) | Create `admin-asset-cache.service.ts` following same pattern |
| `haulhub-backend/src/users/users.controller.ts` | Add `POST /entities/resolve` endpoint |
| `haulhub-backend/src/users/users.service.ts` | Add `resolveEntities()` method |

---

## 11. Dashboard & Table Design Per Role

### Order Table Columns

| Column | Admin | Dispatcher | Carrier | Driver |
|--------|-------|------------|---------|--------|
| Status | ✅ | ✅ | ✅ | ✅ |
| Invoice # | ✅ | ✅ | ✅ | ✅ |
| Broker Load | ✅ | ✅ | ❌ | ❌ |
| Scheduled Date | ✅ | ✅ | ✅ | ✅ |
| Pickup City | ✅ | ✅ | ✅ | ✅ |
| Delivery City | ✅ | ✅ | ✅ | ✅ |
| Broker | ✅ | ✅ | ❌ | ❌ |
| Dispatcher | ✅ | ❌ (it's them) | ✅ | ❌ |
| Carrier | ❌ | ✅ | ❌ (it's them) | ❌ |
| Truck | ❌ | ❌ | ✅ | ✅ |
| Driver | ❌ | ❌ | ✅ | ❌ (it's them) |
| Trailer | ❌ | ❌ | ✅ | ❌ |
| Order Rate | ✅ | ✅ | ❌ | ❌ |
| Their Profit | ✅ (Admin profit) | ✅ (Dispatcher profit) | ✅ (Carrier profit) | ✅ (Driver payment) |

### Order Table Filters

| Filter | Admin | Dispatcher | Carrier | Driver |
|--------|-------|------------|---------|--------|
| Date Range | ✅ | ✅ | ✅ | ✅ |
| Status | ✅ | ✅ | ✅ | ✅ |
| Broker | ✅ | ✅ | ❌ | ❌ |
| Dispatcher | ✅ | ❌ | ✅ | ❌ |
| Carrier | ❌ | ✅ | ❌ | ❌ |
| Truck | ❌ | ❌ | ✅ | ✅ |
| Driver | ❌ | ❌ | ✅ | ❌ |

### Chart/Analytics Input Per Role

| Role | Chart Metric (Profit) |
|------|-----------------------|
| Admin | OrderRate − (Lumper + Detention + DispatcherPayment + CarrierPayment) |
| Dispatcher | DispatcherPayment (= OrderRate × DispatcherRate) |
| Carrier | CarrierPayment − FuelCost − DriverPayment |
| Driver | DriverPayment |

---

## 12. Broker Management

Brokers are managed directly in DynamoDB by eTrucky engineers (not through the app). The existing in-app broker management UI (create, edit, delete in the Admin feature module) will be removed.

Brokers remain a global read-only list. The backend exposes `GET /brokers` for Dispatchers and Admins to populate dropdowns when creating/viewing orders.

---

## 12.1. Dispatcher Order Form — Cascading Carrier→Asset Dropdown

### UX Flow

When a Dispatcher creates or edits an order, the Assignment section works as follows:

1. **Admin autocomplete** — `mat-autocomplete` populated from the Dispatcher's `subscribedAdminIds` (resolved via asset cache). Dispatcher types to filter by name. Required field.
2. **Carrier autocomplete** — `mat-autocomplete` populated from the Dispatcher's `subscribedCarrierIds` (resolved via asset cache). Dispatcher types to filter by company name. Required field.
3. **On Carrier selection** — the form fetches the selected Carrier's assets **fresh from the backend** (never from cache):
   - Trucks belonging to that Carrier (`GET /trucks?carrierId=<id>`)
   - Trailers belonging to that Carrier (`GET /trailers?carrierId=<id>`)
   - Drivers belonging to that Carrier (`GET /users?carrierId=<id>&role=DRIVER`)
4. **Truck, Trailer, Driver autocompletes** — `mat-autocomplete` populated with the selected Carrier's assets. Truck filters by plate, Trailer filters by plate, Driver filters by name. All required.
5. **"Add New" button** next to each asset autocomplete — opens a dialog to create a new asset for the selected Carrier on the fly. After creation, the Carrier's assets are re-fetched from the backend and the autocomplete auto-selects the new asset.

All autocomplete dropdowns follow the existing pattern used in the dashboard filter bars (`trip-table.component.html`): `<input matInput [matAutocomplete]>` with `valueChanges.pipe(startWith(''), map(value => _filter(value)))` for type-to-filter, `[displayWith]` for showing the human-readable name when a UUID is selected, and a clear button (`mat-icon-button` with `close` icon) to reset the field.

### Forced Cache Refresh on Create Order Navigation

This is a **hard requirement**. When the Dispatcher navigates to the Create Order page, the `AssetCacheService` must perform a full refresh of the `subscribed` bucket — bypassing localStorage TTL and fetching fresh data from the backend. This guarantees:

- Any Carriers recently subscribed to the Dispatcher appear immediately in the Carrier dropdown.
- Any Admins recently subscribed appear immediately in the Admin dropdown.
- The Dispatcher always works with the latest subscription state.

Additionally, when the Dispatcher selects a Carrier from the dropdown, the Carrier's assets (trucks, trailers, drivers) are **always fetched live from the backend** — never served from cache. This guarantees:

- If the Carrier (or another Dispatcher) just registered a new truck, it appears immediately.
- If an asset was deactivated, it no longer appears.
- The Dispatcher always assigns from the Carrier's current asset pool.

The only data that may come from cache during order creation is the Broker list (brokers change infrequently and are managed outside the app).

### Implementation Detail

```typescript
// In the Create Order component's ngOnInit:
this.assetCacheService.forceRefresh().subscribe(() => {
  // Subscribed bucket is now fresh — populate Admin and Carrier dropdowns
  this.admins = this.assetCacheService.getSubscribedAdmins();
  this.carriers = this.assetCacheService.getSubscribedCarriers();
});

// On Carrier dropdown selection change — always live fetch, no cache:
onCarrierSelected(carrierId: string): void {
  forkJoin({
    trucks: this.assetService.getTrucksByCarrier(carrierId),
    trailers: this.assetService.getTrailersByCarrier(carrierId),
    drivers: this.assetService.getDriversByCarrier(carrierId),
  }).subscribe(({ trucks, trailers, drivers }) => {
    this.trucks = trucks.filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
    this.trailers = trailers.filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
    this.drivers = drivers.filter(d => d.isActive).sort((a, b) => a.name.localeCompare(b.name));
    // Reset dependent dropdowns — previous Carrier's assets are no longer valid
    this.form.patchValue({ truckId: null, trailerId: null, driverId: null });
  });
}
```

### Sorting Rule

All autocomplete dropdown lists are sorted ascending by their display field:

| Dropdown | Sort Field | Order |
|----------|-----------|-------|
| Admin | `name` | A → Z |
| Carrier | `company` (or `name`) | A → Z |
| Broker | `brokerName` | A → Z |
| Truck | `plate` | A → Z |
| Trailer | `plate` | A → Z |
| Driver | `name` | A → Z |

This applies everywhere autocomplete lists appear — Create Order, Edit Order, and dashboard filter bars.

### Codebase Impact

| Current File | Change |
|-------------|--------|
| `features/dispatcher/trip-create/trip-create.component.ts` | Add Admin dropdown; change Carrier selection to trigger asset reload; add "Add New" dialogs |
| `features/dispatcher/trip-create/trip-create.component.html` | Add Admin field; restructure Assignment section with cascading dropdowns |
| `features/dispatcher/trip-edit/trip-edit.component.ts` | Same cascading logic for edit form |
| `features/dispatcher/dashboard/asset-cache.service.ts` | Add method to load assets for a specific Carrier (not just the user's own Carrier) |

### Auto-Calculated Fields on Order Creation

When the Dispatcher submits the Create Order form, the backend ALWAYS calculates and stores:

```typescript
// From the form
const { orderRate, adminRate, dispatcherRate, lumperValue, detentionValue, driverId, truckId, mileageOrder, mileageTotal } = dto;

// Looked up from entity records
const driver = await getUser(driverId);  // driver.rate = $/mile
const truck = await getTruck(truckId);   // truck.fuelGasAvgGallxMil, truck.fuelGasAvgCost

// Calculated
const adminPayment = round2(orderRate * adminRate / 100);
const dispatcherPayment = round2(orderRate * dispatcherRate / 100);
const carrierPayment = round2(orderRate * 0.9);
const driverPayment = round2(driver.rate * mileageOrder);
const fuelCost = round2(mileageTotal * truck.fuelGasAvgGallxMil * truck.fuelGasAvgCost);
```

These values are stored on the order so the Carrier sees them immediately. The Dispatcher and Admin never see `driverPayment` or `fuelCost` in their views.

---

## 13. Infrastructure & Migration Strategy

### Migration Approach: Parallel Tables

The deployed AWS application and local development share the same DynamoDB tables. Making breaking changes (removing fields, changing GSI keys, wiping data) would break the deployed app for other testers.

**Solution**: Create entirely new DynamoDB tables with a new naming convention. The deployed app continues using old tables undisturbed. Local development targets new tables. Clean cutover when ready.

### Table Naming

| Old Table (keep for deployed app) | New Table (for v2 development) |
|-----------------------------------|-------------------------------|
| `eTrucky-Trips` | `eTruckyOrders` |
| `eTrucky-Users` | `eTruckyUsers` |
| `eTrucky-Trucks` | `eTruckyTrucks` |
| `eTrucky-Trailers` | `eTruckyTrailers` |
| `eTrucky-Brokers` | `eTruckyBrokers` |

Convention: remove the hyphen from the old name. Special case: `Trips` → `Orders` to reflect the terminology change.

### CDK Changes

Add new table definitions in `database-stack.ts` alongside the existing ones. Both sets of tables exist in AWS simultaneously. The old tables are not modified or deleted.

New environment variables for the backend `.env`:

```bash
# v2 Tables (new hierarchy)
ETRUCKY_ORDERS_TABLE=eTruckyOrders
ETRUCKY_USERS_TABLE=eTruckyUsers
ETRUCKY_TRUCKS_TABLE=eTruckyTrucks
ETRUCKY_TRAILERS_TABLE=eTruckyTrailers
ETRUCKY_BROKERS_TABLE=eTruckyBrokers
```

### Deployment Workflow

1. **CDK deploy**: Add v2 table definitions → both old and new tables exist in AWS.
2. **Local development**: `.env` points to v2 tables. Develop and test against new schema.
3. **Seed v2 tables**: New seed script creates data with new hierarchy (Admins, Dispatchers, Carriers, Drivers, new financial model, new statuses).
4. **When ready to deploy**: Update Lambda environment variables to point to v2 tables. Deploy new backend + frontend code.
5. **Rollback**: If issues found, revert Lambda env vars to old table names + revert code. Old tables are untouched.
6. **Cleanup**: After successful deployment and validation, old tables can be deleted (or kept for archival).

### Cognito Changes

- Update custom attributes: remove dependency on `custom:carrierId` for Dispatchers (many-to-many, no single carrier).
- Add `custom:accountStatus` attribute.
- Ensure placeholder creation uses `MessageAction: 'SUPPRESS'`.
- Cognito user pool itself doesn't change — same pool, same groups. Just attribute usage changes.

### v2 Tables — Deployed and Seeded

The v2 DynamoDB tables and Cognito users are **already deployed and populated** in the AWS account. The CDK definitions are in `haulhub-infrastructure/lib/stacks/database-stack.ts` (the `v2*` table properties). The seed script is `scripts/seed-v2.ts` + `scripts/seed-v2-helpers.ts`.

**Tables and GSIs (live in AWS):**

| Table | PK | SK | GSIs |
|-------|----|----|------|
| `eTruckyOrders` | `ORDER#<orderId>` | `METADATA` | GSI1: `CARRIER#<carrierId>` / `<timestamp>#<orderId>`, GSI2: `DISPATCHER#<dispatcherId>` / `<timestamp>#<orderId>`, GSI3: `DRIVER#<driverId>` / `<timestamp>#<orderId>`, GSI4: `ADMIN#<adminId>` / `<timestamp>#<orderId>`, GSI5: `BROKER#<brokerId>` / `<timestamp>#<orderId>` |
| `eTruckyUsers` | `USER#<userId>` | `METADATA` | GSI1: `CARRIER#<carrierId>` / `ROLE#<role>#USER#<userId>`, GSI2: `EMAIL#<email>` / `USER#<userId>` |
| `eTruckyTrucks` | `TRUCK#<truckId>` | `METADATA` | GSI1: `CARRIER#<carrierId>` / `TRUCK#<truckId>` |
| `eTruckyTrailers` | `TRAILER#<trailerId>` | `METADATA` | GSI1: `CARRIER#<carrierId>` / `TRAILER#<trailerId>` |
| `eTruckyBrokers` | `BROKER#<brokerId>` | `METADATA` | None |

**Seeded data (live in AWS, seeded 2026-02-20):**

| Entity | Count | Details |
|--------|-------|---------|
| Admins | 2 | Maria Rodriguez (`admin1@etrucky.com`), James Chen (`admin2@etrucky.com`) |
| Dispatchers | 3 | Carlos Mendez (`dispatcher1@etrucky.com`), Sarah Johnson (`dispatcher2@etrucky.com`), Mike Williams (`dispatcher3@etrucky.com`) |
| Carriers | 3 | Swift Transport LLC (`carrier1@etrucky.com`), Eagle Freight Inc (`carrier2@etrucky.com`), Pacific Haulers (`carrier3@etrucky.com`) |
| Drivers | 8 | 3 per Swift, 3 per Eagle, 2 per Pacific (`driver1@etrucky.com` ... `driver8@etrucky.com`) |
| Trucks | 12 | 4 per Carrier, each with `fuelGasAvgGallxMil` and `fuelGasAvgCost` defaults |
| Trailers | 12 | 4 per Carrier |
| Brokers | 20 | C.H. Robinson, XPO Logistics, TQL, etc. |
| Orders | 1,400 | 700 per Admin, Jan 2025 → Apr 2026 |

**Password for all test users:** `TempPass123!`

**Subscription wiring (one-directional, on Dispatcher records only):**

| Dispatcher | `subscribedAdminIds` | `subscribedCarrierIds` |
|------------|---------------------|----------------------|
| Carlos Mendez | [Maria] | [Swift, Eagle] |
| Sarah Johnson | [Maria, James] | [Eagle, Pacific] |
| Mike Williams | [James] | [Pacific] |

Admins have **no** subscription lists. Their Dispatcher filter is derived from order data.

**Many-to-many relationships demonstrated:**
- Sarah works for both Admins (Maria and James) — her orders are split across both
- Carlos and Sarah share Eagle Freight as a Carrier
- Sarah and Mike share Pacific Haulers as a Carrier

**Order status distribution (time-based):**

| Order age | Primary statuses |
|-----------|-----------------|
| Future (Mar–Apr 2026) | 100% Scheduled |
| 0–7 days old | Scheduled 40%, Picking Up 30%, Transit 20%, Delivered 10% |
| 8–30 days old | Mix of Delivered, Waiting RC, Transit, Picking Up, Scheduled, Canceled |
| 31–90 days old | Ready To Pay 35%, Waiting RC 25%, Delivered 25%, Canceled 15% |
| 90+ days old | Ready To Pay 80%, Canceled 10%, Delivered 10% |

**Order record fields (every order has all of these):**
```
orderId, adminId, dispatcherId, carrierId, driverId, truckId, trailerId, brokerId,
invoiceNumber, brokerLoad, orderStatus, scheduledTimestamp, pickupTimestamp, deliveryTimestamp,
pickupCompany, pickupAddress, pickupCity, pickupState, pickupZip, pickupPhone, pickupNotes,
deliveryCompany, deliveryAddress, deliveryCity, deliveryState, deliveryZip, deliveryPhone, deliveryNotes,
mileageEmpty, mileageOrder, mileageTotal,
orderRate, adminRate, adminPayment, dispatcherRate, dispatcherPayment,
carrierRate (90), carrierPayment, lumperValue, detentionValue,
driverRate, driverPayment, fuelGasAvgCost, fuelGasAvgGallxMil, fuelCost,
notes, createdAt, updatedAt, lastModifiedBy
```

**To re-seed:** `USER_POOL_ID=us-east-1_yoiMUn0Q8 AWS_PROFILE=haul-hub npx ts-node scripts/seed-v2.ts`

---

## 14. Current DynamoDB State — Gap & Waste Analysis

This section documents what currently exists in the old DynamoDB tables and identifies fields/records that are waste (no longer needed) or gaps (missing for the new model).

### eTrucky-Trips (old) → eTruckyOrders (new)

**Current record fields and their fate:**

| Current Field | Status | Notes |
|---------------|--------|-------|
| `tripId` | RENAME → `orderId` | Primary identifier |
| `carrierId` | KEEP | Now = company executing the order |
| `dispatcherId` | KEEP | The intermediary |
| `driverId` | KEEP | Assigned driver |
| `truckId` | KEEP | Assigned truck |
| `trailerId` | KEEP | Assigned trailer |
| `brokerId` | KEEP | Broker reference |
| `truckOwnerId` | **WASTE** | TruckOwner role eliminated |
| `orderConfirmation` | **WASTE** | Replaced by invoiceNumber + brokerLoad |
| `orderStatus` | KEEP | But values change to new enum |
| `brokerPayment` | RENAME → `orderRate` | What the Broker pays |
| `driverPayment` | KEEP | Carrier's expense |
| `truckOwnerPayment` | **WASTE** | Replaced by carrierPayment |
| `truckOwnerRate` | **WASTE** | Replaced by carrierRate |
| `dispatcherPayment` | KEEP | Was always 0; now calculated |
| `dispatcherRate` | KEEP | Was always 0; now default 5% |
| `fuelCost` | KEEP | Carrier's expense |
| `fuelGasAvgCost` | KEEP | $/gallon |
| `fuelGasAvgGallxMil` | KEEP | gallons/mile |
| `lumperValue` | KEEP | Deducted from order |
| `detentionValue` | KEEP | Deducted from order |
| `brokerRate` | **WASTE** | Old per-mile rate concept |
| `factoryRate` | **WASTE** | Always 0 |
| `factoryAdvance` | **WASTE** | Always 0 |
| `factoryCost` | **WASTE** | Always 0 |
| `brokerCost` | **WASTE** | Always 0 |
| `brokerAdvance` | **REVIEW** | See Open Questions |
| `driverAdvance` | **REVIEW** | See Open Questions |
| `orderAverage` | **WASTE** | Always 0 |
| `orderExpenses` | **WASTE** | Always 0 |
| `orderRevenue` | **WASTE** | Always 0 |
| `orderRate` (old) | **WASTE** | Was always 0; reused name for new purpose |
| — | **GAP**: `adminId` | Missing — needed for Admin's dashboard |
| — | **GAP**: `adminRate` / `adminPayment` | Missing — Admin's commission |
| — | **GAP**: `carrierRate` / `carrierPayment` | Missing — Carrier's revenue |
| — | **GAP**: `invoiceNumber` | Missing — replaces orderConfirmation |
| — | **GAP**: `brokerLoad` | Missing — new required field |
| — | **GAP**: `lastModifiedBy` | Missing — audit trail |

**GSI changes:**

| GSI | Old Key | New Key | Change |
|-----|---------|---------|--------|
| GSI4 | `OWNER#<truckOwnerId>` | `ADMIN#<adminId>` | Repurposed (clean in new table) |

### eTrucky-Users (old) → eTruckyUsers (new)

**Current records:**
- 1 Carrier, 2 Dispatchers, 8 Drivers, 3 Truck Owners — all linked to one Carrier via `carrierId`

**Waste:**
- 3 Truck Owner records (role eliminated)
- `carrierId` on Dispatcher records (many-to-many, no single carrier)
- `verificationStatus` on all records (no in-app verification workflow)

**Gaps:**
- No Admin users exist
- Missing `accountStatus`, `createdBy`, `claimedAt`, `lastModifiedBy`
- Missing `subscribedDispatcherIds` (on Admin records)
- Missing `subscribedCarrierIds` (on Dispatcher records)

### eTrucky-Trucks (old) → eTruckyTrucks (new)

**Current records:** 15 trucks, each with `carrierId` and `truckOwnerId`

**Waste:**
- `truckOwnerId` field on all records (Carrier owns trucks directly)
- GSI2 (`OWNER#<userId>`) — no more TruckOwner queries

**Gaps:**
- Missing `createdBy`, `lastModifiedBy`
- Missing `rate` (default fuel/mile rate for the truck)

### eTrucky-Trailers (old) → eTruckyTrailers (new)

**Current records:** 18 trailers, each with `carrierId`

**Waste:** None significant.

**Gaps:**
- Missing `createdBy`, `lastModifiedBy`

### eTrucky-Brokers (old) → eTruckyBrokers (new)

**Current records:** 20 brokers. No changes needed. Will be duplicated to new table for clean separation.

---

## 15. What Gets Removed

### Roles
- `TruckOwner` / `LorryOwner` — eliminated entirely from enums, interfaces, DTOs, controllers, services, frontend modules

### Backend Modules/Files to Remove or Gut
- TruckOwner-specific logic in `lorries.service.ts` (getTruckOwnersByCarrier, etc.)
- TruckOwner-specific endpoints in `lorries.controller.ts`
- Admin verification workflows in `admin.controller.ts` and `admin.service.ts` (lorry verification, user verification)
- Broker CRUD endpoints in `brokers.controller.ts` (keep only GET for read-only access)
- `truckOwnerId` references throughout all services
- Old `TripStatus` enum values and transition rules

### Frontend Modules to Remove
- `features/truck-owner/` — entire module (dashboard, truck-list, truck-registration, trailer-list, trailer-registration, vehicle-trip-list)
- `features/admin/lorry-verification/` — entire component + dialogs
- `features/admin/user-verification/` — entire component + dialogs
- `features/admin/broker-management/` — entire component + dialogs

### Shared Types to Remove
- `TruckOwner`, `LorryOwner` enum values from `UserRole`
- `LorryVerificationStatus` enum
- `VerificationStatus` enum
- `VehicleVerificationStatus` enum (if no longer needed)
- `LegacyTruck` interface
- `Lorry` interface
- `RegisterLorryDto`, `VerifyLorryDto`, `VerifyUserDto`, `VerifyTruckDto`
- `TruckOwnerPaymentReport` interface
- `truckOwnerId`, `truckOwnerPayment`, `truckOwnerRate` from Trip interface
- `orderConfirmation` from Trip interface
- Factory-related fields from Trip interface and DTOs

### Infrastructure
- GSI2 on eTruckyTrucks table (not created in new table definition)
- GSI4 old key pattern on eTruckyOrders (new table uses ADMIN# pattern)

---

## 16. Resolved Questions

All open questions were resolved on 2026-02-20. Answers documented here for future reference.

### Q1: Advance payments (`brokerAdvance`, `driverAdvance`)
**Answer**: DROP. Remove `brokerAdvance`, `driverAdvance`, and `factoryAdvance` from the model entirely. Not needed in the new hierarchy.

### Q2: Canceled status reachability
**Answer**: An order can be Canceled from ANY status. Only Dispatchers can cancel.

### Q3: Waiting RC ↔ Ready To Pay bidirectional
**Answer**: Yes. Ready To Pay can go back to Waiting RC if documentation is found incomplete. Only Dispatchers can perform this transition.

### Q4: Driver status update scope
**Answer**: Drivers can update: Scheduled → Picking Up → Transit → Delivered. Drivers CANNOT update: Delivered → Waiting RC (that's Dispatcher/Carrier only).

### Q5: Carrier's Edit Order scope
**Answer**: Carriers can edit driver rate, fuel inputs, AND reassign truck/trailer/driver on an order. They cannot edit any other fields.

### Q6: Admin's View/Edit Order scope
**Answer**: Admin view is read-only except they can edit the Dispatcher's rate on any order. Key rules:
- `adminRate + dispatcherRate = 10%` ALWAYS (exactly 10%, not ≤ 10%)
- Default split: 5% each
- When Admin changes `dispatcherRate`, `adminRate` automatically adjusts (complementary)
- `carrierPayment = orderRate × 90%` ALWAYS (never changes regardless of rate adjustments)
- Admin profit = `adminPayment - lumper - detention` = `(orderRate × adminRate) - lumper - detention`
- Admin can see their own rate but not edit it directly (it's derived from 10% - dispatcherRate)

### Q7: Admin creating orders
**Answer**: Only Dispatchers can create orders. Admins cannot.

### Q8: Email change after registration
**Answer**: Supported (Cognito attribute update + DDB GSI2PK re-index + verification flow for new email). Deferred to post-launch — implement after all dashboard changes are complete.

### Q9: Dashboard titles
**Answer**: Fix the current bug where Carrier dashboard is titled "Admin Dashboard". New titles:
- Admin role → "Admin Dashboard"
- Carrier role → "Carrier Dashboard"
- Dispatcher role → "Dispatcher Dashboard"
- Driver role → "Driver Dashboard"

### Q10: Driver's Carrier visibility and Driver mobility
**Answer**: Drivers see which Carrier they belong to (resolve `carrierId` from asset cache). Driver mobility between Carriers is supported via an invite/accept flow:
- New optional field on Driver record: `pendingCarrierId?: string`
- Carrier B invites a Driver → sets `pendingCarrierId` on Driver's record
- Driver sees invite on login → accepts → `carrierId` updates to Carrier B, `pendingCarrierId` clears, GSI1PK re-indexes
- Decline → `pendingCarrierId` clears
- Old Carrier resolves Driver's name on historical orders via `POST /entities/resolve` (cache miss)
- **Deferred to post-launch**: Transfer UI. For initial build, Drivers are created by their Carrier and stay put.

---

## 16.1. DynamoDB Pagination — Hard Requirement

### Current Pattern (MUST preserve)

The existing pagination implementation is a hard requirement. All new dashboards must adopt the same strategy.

**Frontend (`DashboardStateService`):**
```typescript
interface PaginationState {
  page: number;
  pageSize: number;
  lastEvaluatedKey?: string;
  pageTokens?: string[];  // Stores tokens for each page to enable back-navigation
}
```

- `lastEvaluatedKey` sent as `x-pagination-token` HTTP header (not query param)
- `pageTokens[]` array stores the `lastEvaluatedKey` for each page index
- Forward navigation: use `lastEvaluatedKey` from previous response
- Back navigation: look up `pageTokens[targetPage]`
- Filter changes: reset to page 0, clear `pageTokens[]`
- Page size changes: reset to page 0, clear `pageTokens[]`

**Backend (`TripsService`):**
- Receives `lastEvaluatedKey` from `x-pagination-token` header
- Passes it as `ExclusiveStartKey` to DynamoDB Query
- Returns `lastEvaluatedKey` from DynamoDB response in the response body
- Uses `Limit` parameter to control page size
- Applies `FilterExpression` for status/secondary filters AFTER the Query (DynamoDB evaluates filters after reading `Limit` items, so the returned count may be less than `Limit`)

**Critical behavior:** When filters are applied, the number of returned records may be less than `pageSize` because DynamoDB applies `FilterExpression` after reading `Limit` items. The frontend handles this gracefully — it shows whatever records are returned and enables "Next" if `lastEvaluatedKey` is present.

### v2 Changes (minimal)

The pagination logic itself does not change. Only the GSI selection changes:

| Role | Primary GSI | Partition Key | Sort Key |
|------|------------|---------------|----------|
| Admin | GSI4 | `ADMIN#<adminId>` | `<timestamp>#<orderId>` |
| Dispatcher | GSI2 | `DISPATCHER#<dispatcherId>` | `<timestamp>#<orderId>` |
| Carrier | GSI1 | `CARRIER#<carrierId>` | `<timestamp>#<orderId>` |
| Driver | GSI3 | `DRIVER#<driverId>` | `<timestamp>#<orderId>` |

The `IndexSelectorService` simplifies: the user's role determines the GSI. Secondary filters (broker, truck, driver, status) are applied as `FilterExpression` on the role's primary GSI.

### Codebase Impact

| Current File | Change |
|-------------|--------|
| `haulhub-backend/src/trips/index-selector.service.ts` | Simplify: role → GSI mapping instead of filter-based selection |
| `haulhub-frontend/src/app/features/dispatcher/dashboard/dashboard-state.service.ts` | Update filter interface (remove truckOwnerId, add carrierId) |
| `haulhub-frontend/src/app/features/admin/dashboard/` (NEW) | Create `admin-state.service.ts` following same pattern |

---

## 17. Revised Financial Model (Final)

The financial model was revised during Q&A. This section supersedes Section 4 where there are conflicts.

### Key Rules
1. `adminRate + dispatcherRate = 10%` (exactly, always)
2. `carrierRate = 90%` (always, never changes)
3. Default split: adminRate = 5%, dispatcherRate = 5%
4. Admin can edit dispatcherRate per-order → adminRate auto-adjusts (complementary)
5. Lumper and detention are absorbed by the Admin (reduce Admin's profit)

### Formulas
```
orderRate              = what the Broker pays (gross)
adminRate              = 10% - dispatcherRate (default 5%)
dispatcherRate         = 10% - adminRate (default 5%)

adminPayment           = orderRate × adminRate
dispatcherPayment      = orderRate × dispatcherRate
carrierPayment         = orderRate × 90%

adminProfit            = adminPayment - lumper - detention
                       = (orderRate × adminRate) - lumper - detention
dispatcherProfit       = dispatcherPayment
carrierProfit          = carrierPayment - driverPayment - fuelCost
driverProfit           = driverPayment

Verification: adminPayment + dispatcherPayment + carrierPayment = orderRate × 10% + orderRate × 90% = orderRate ✓
```

### Example ($5,000 order, default rates, $50 lumper, $0 detention)
```
adminPayment       = $5,000 × 5%  = $250
dispatcherPayment  = $5,000 × 5%  = $250
carrierPayment     = $5,000 × 90% = $4,500
lumper             = $50
detention          = $0

adminProfit        = $250 - $50 - $0 = $200
dispatcherProfit   = $250
carrierProfit      = $4,500 - driverPayment - fuelCost
```

### If Admin changes dispatcherRate to 7% on this order:
```
dispatcherRate     = 7%  → adminRate = 3%
adminPayment       = $5,000 × 3%  = $150
dispatcherPayment  = $5,000 × 7%  = $350
carrierPayment     = $5,000 × 90% = $4,500  (unchanged)

adminProfit        = $150 - $50 = $100  (Admin gave 2% to Dispatcher)
dispatcherProfit   = $350
carrierProfit      = $4,500 - driverPayment - fuelCost  (unchanged)
```

### Updated Per-Role Editing Permissions

| Action | Admin | Dispatcher | Carrier | Driver |
|--------|-------|------------|---------|--------|
| Create Order | ❌ | ✅ | ❌ | ❌ |
| Edit Order (all fields except rates) | ❌ | ✅ | ❌ | ❌ |
| Edit Dispatcher Rate (adminRate auto-adjusts) | ✅ | ❌ | ❌ | ❌ |
| Edit Assignment (truck/trailer/driver) | ❌ | ✅ | ✅ | ❌ |
| Edit Driver Rate, Fuel Inputs | ❌ | ❌ | ✅ | ❌ |
| Update Status | ❌ | ✅ | ✅ | ✅ |
| Add Notes | ✅ | ✅ | ✅ | ✅ |
| Cancel Order (from any status) | ❌ | ✅ | ❌ | ❌ |

### Updated Status Transitions

| From → To | Dispatcher | Carrier | Driver |
|-----------|------------|---------|--------|
| Scheduled → Picking Up | ✅ | ✅ | ✅ |
| Picking Up → Transit | ✅ | ✅ | ✅ |
| Transit → Delivered | ✅ | ✅ | ✅ |
| Delivered → Waiting RC | ✅ | ✅ | ❌ |
| Waiting RC → Ready To Pay | ✅ | ❌ | ❌ |
| Ready To Pay → Waiting RC | ✅ | ❌ | ❌ |
| ANY → Canceled | ✅ | ❌ | ❌ |

---

## 18. Concrete Codebase Change Map

This section maps every design decision to the specific files that need to change. It serves as the implementation roadmap.

### 18.1. Shared Package (`haulhub-shared/src/`)

| Action | File | Details |
|--------|------|---------|
| UPDATE | `enums/user-role.enum.ts` | Remove `TruckOwner`, `LorryOwner` |
| REPLACE | `enums/trip-status.enum.ts` | New `OrderStatus` enum: Scheduled, PickingUp, Transit, Delivered, WaitingRC, ReadyToPay, Canceled |
| DELETE | `enums/verification-status.enum.ts` | No longer needed |
| DELETE | `enums/lorry-verification-status.enum.ts` | No longer needed |
| DELETE | `enums/vehicle-verification-status.enum.ts` | No longer needed |
| CREATE | `enums/account-status.enum.ts` | `unclaimed`, `pending_verification`, `active`, `suspended` |
| UPDATE | `enums/index.ts` | Update exports |
| REPLACE | `interfaces/trip.interface.ts` → `interfaces/order.interface.ts` | New Order interface per Section 6 |
| UPDATE | `interfaces/user.interface.ts` | Add `accountStatus`, `carrierId`, `subscribedDispatcherIds`, `subscribedCarrierIds`, `subscribedAdminIds`, `createdBy`, `lastModifiedBy`, `claimedAt`; remove `verificationStatus` |
| UPDATE | `interfaces/truck.interface.ts` | Remove `truckOwnerId`, `verificationStatus`, `LegacyTruck`; add `rate`, `fuelGasAvgGallxMil`, `fuelGasAvgCost`, `createdBy`, `lastModifiedBy` |
| UPDATE | `interfaces/trailer.interface.ts` | Change `ownerId`→`carrierId`; remove `verificationStatus`; add `createdBy`, `lastModifiedBy` |
| KEEP | `interfaces/broker.interface.ts` | No changes |
| UPDATE | `interfaces/workflow-rules.interface.ts` | New statuses, new role-based permissions per Section 5 |
| UPDATE | `interfaces/payment-report.interface.ts` | Replace `TruckOwnerPaymentReport` with per-role reports |
| UPDATE | `interfaces/index.ts` | Update exports |
| REPLACE | `dtos/trip.dto.ts` → `dtos/order.dto.ts` | `CreateOrderDto`, `UpdateOrderDto`, `UpdateOrderStatusDto`, `OrderFilters` per Section 6 |
| UPDATE | `dtos/truck.dto.ts` | Remove `truckOwnerId`; add audit fields |
| UPDATE | `dtos/trailer.dto.ts` | Change `ownerId`→`carrierId`; add audit fields |
| KEEP | `dtos/broker.dto.ts` | No changes |
| UPDATE | `dtos/index.ts` | Update exports |
| UPDATE | `utils/trip-calculations.util.ts` | Per-role profit calculations per Section 17 |

### 18.2. Backend (`haulhub-backend/src/`)

| Action | File/Module | Details |
|--------|-------------|---------|
| RENAME+REWRITE | `trips/` → `orders/` | New controller, service, module for Order CRUD with v2 data model |
| SIMPLIFY | `trips/index-selector.service.ts` → `orders/index-selector.service.ts` | Role→GSI mapping per Section 16.1 |
| UPDATE | `auth/auth.service.ts` | Create-then-claim flow; placeholder Cognito creation with `MessageAction: 'SUPPRESS'` |
| UPDATE | `auth/dto/register.dto.ts` | Remove TruckOwner role option |
| UPDATE | `auth/guards/roles.guard.ts` | Remove TruckOwner role |
| ADD ENDPOINT | `users/users.controller.ts` | `POST /entities/resolve`, `GET /users/subscriptions`, `PATCH /users/subscriptions`, `POST /users/placeholder` |
| UPDATE | `users/users.service.ts` | Add `resolveEntities()`, subscription management, placeholder creation |
| GUT | `admin/admin.controller.ts` | Remove verification endpoints; add Admin business-owner query endpoints |
| GUT | `admin/admin.service.ts` | Remove verification logic; add org-wide order queries via GSI4 |
| UPDATE | `admin/brokers.controller.ts` | Keep only `GET /brokers`; remove POST, PATCH, DELETE |
| UPDATE | `admin/brokers.service.ts` | Keep only `findAll()`; remove create, update, delete |
| UPDATE | `carrier/carrier.controller.ts` | Update for new model (Carrier = asset owner); update edit permissions per Section 17 |
| UPDATE | `carrier/carrier.service.ts` | Update for new financial model |
| RENAME | `lorries/` → `assets/` | Remove truckOwnerId logic; add audit fields; support Dispatcher creating assets for subscribed Carriers |
| UPDATE | `analytics/analytics.service.ts` | Per-role profit calculations per Section 17 |
| UPDATE | `config/config.service.ts` | Add v2 table name env vars |
| UPDATE | `app.module.ts` | Update module imports (orders replaces trips, assets replaces lorries) |

### 18.3. Frontend (`haulhub-frontend/src/app/`)

| Action | File/Module | Details |
|--------|-------------|---------|
| UPDATE | `features/dispatcher/trip-create/` | Rename to order-create; add Admin dropdown; cascading Carrier→Asset dropdowns; auto-calc fields |
| UPDATE | `features/dispatcher/trip-edit/` | Rename to order-edit; same cascading logic |
| UPDATE | `features/dispatcher/trip-detail/` | Rename to order-detail; update financial visibility per Section 4 |
| UPDATE | `features/dispatcher/trip-list/` | Rename to order-list; update columns per Section 11 |
| UPDATE | `features/dispatcher/dashboard/dashboard-state.service.ts` | Update filter interface (remove truckOwnerId, add carrierId); update view caching keys |
| UPDATE | `features/dispatcher/dashboard/asset-cache.service.ts` | Add resolved bucket, `/entities/resolve` integration, forced refresh |
| UPDATE | `features/dispatcher/dashboard/trip-table/` | Update displayedColumns per Section 11; update profit calculation |
| UPDATE | `features/dispatcher/dashboard/dashboard-charts-widget/` | Use dispatcherPayment as profit metric |
| UPDATE | `features/dispatcher/analytics-dashboard/` | Use dispatcherPayment as profit metric |
| UPDATE | `features/dispatcher/payment-report/` | Use dispatcherPayment as profit metric |
| REBUILD | `features/admin/dashboard/` | New business-owner dashboard following Dispatcher pattern (state service, asset cache, filter card, order table, charts, analytics, payments) |
| DELETE | `features/admin/user-verification/` | Entire component + dialogs |
| DELETE | `features/admin/lorry-verification/` | Entire component + dialogs |
| DELETE | `features/admin/broker-management/` | Entire component + dialogs |
| UPDATE | `features/admin/admin.routes.ts` | Remove verification/broker routes; add dashboard sub-routes |
| UPDATE | `features/carrier/shared/carrier-asset-cache.service.ts` | Add resolved bucket |
| UPDATE | `features/carrier/shared/carrier-dashboard-state.service.ts` | Update filter interface |
| UPDATE | `features/carrier/dashboard/carrier-trip-table/` | Update columns per Section 11; update profit = carrierPayment - driverPayment - fuelCost |
| UPDATE | `features/carrier/analytics/` | Use carrier profit as metric |
| UPDATE | `features/carrier/payment-report/` | Use carrier profit as metric |
| DELETE | `features/truck-owner/` | **Entire module** (dashboard, truck-list, truck-registration, trailer-list, trailer-registration, vehicle-trip-list) |
| UPDATE | `features/driver/dashboard/driver-asset-cache.service.ts` | Add resolved bucket |
| UPDATE | `features/driver/dashboard/driver-trip-table/` | Update columns per Section 11 |
| UPDATE | `features/auth/register/register.component.ts` | Remove TruckOwner role option; update for claim flow |
| UPDATE | `shared/components/header/header.component.ts` | Remove TruckOwner navigation; update dashboard titles per Q9 |
| UPDATE | `core/services/trip.service.ts` | Rename to order.service.ts; update API paths |
| UPDATE | `core/services/admin.service.ts` | Remove verification methods; add Admin order query methods |
| UPDATE | `core/services/carrier.service.ts` | Update for new model |
| UPDATE | `core/services/auth.service.ts` | Update role references |
| UPDATE | `app.routes.ts` | Remove truck-owner routes; update admin routes |

### 18.4. Infrastructure (`haulhub-infrastructure/`)

| Action | File | Details |
|--------|------|---------|
| KEEP | `lib/stacks/database-stack.ts` | v2 tables already defined — no changes needed |
| UPDATE | `lib/stacks/api-stack.ts` | Update Lambda env vars to point to v2 tables for deployment |
| KEEP | `lib/stacks/auth-stack.ts` | Cognito pool unchanged |
| KEEP | `lib/stacks/frontend-stack.ts` | No changes |
| KEEP | `lib/stacks/storage-stack.ts` | No changes |

### 18.5. Scripts

| Action | File | Details |
|--------|------|---------|
| KEEP | `scripts/seed-v2.ts` | Already seeds v2 data — no changes needed |
| KEEP | `scripts/seed-v2-helpers.ts` | Already implements v2 model — no changes needed |
