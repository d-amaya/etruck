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
13. [Infrastructure & Migration Strategy](#13-infrastructure--migration-strategy)
14. [Current DynamoDB State — Gap & Waste Analysis](#14-current-dynamodb-state--gap--waste-analysis)
15. [What Gets Removed](#15-what-gets-removed)
16. [Open Questions](#16-open-questions)

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

### 1.5 Key Decisions Made During Design

The following decisions were reached through discussion between Daniel (product owner) and Kiro (AI assistant) on 2026-02-20. Each decision is documented here so that future sessions can understand the reasoning without access to the original conversation.

#### Decision 1: Many-to-Many Relationships
Admin↔Dispatcher and Dispatcher↔Carrier are both many-to-many. A Dispatcher can work for multiple Admins simultaneously and with multiple Carriers. This means there is no `adminId` or `carrierId` on the Dispatcher's user record — these relationships are expressed at the Order level (each order specifies which Admin and which Carrier it belongs to) and via subscription lists.

#### Decision 2: Subscription Model for Permissions
Rather than a Carrier maintaining a "trusted Dispatchers" list, the permission model works via subscription lists on the user who needs to select from a dropdown:
- **Admin's record** has `subscribedDispatcherIds: string[]` — controls which Dispatchers appear in the Admin's views.
- **Dispatcher's record** has `subscribedCarrierIds: string[]` — controls which Carriers appear in the Dispatcher's dropdowns and which Carriers' assets the Dispatcher can create/modify.

Subscription is initiated by the entity being subscribed (a Carrier subscribes to a Dispatcher, a Dispatcher subscribes to an Admin). When a Dispatcher creates a new Carrier placeholder, that Carrier is auto-subscribed to the Dispatcher. Unsubscribing removes the ID from the list but does not affect existing orders.

#### Decision 3: No Denormalized Names on Order Records
Instead of storing snapshot names (carrierName, driverName, etc.) on each order record, the system uses a client-side caching strategy (detailed in Section 10). This was chosen because:
- It avoids stale names on order records when entities rename.
- Filters always operate on UUIDs (not names), so name changes don't break filtering.
- The cache self-heals: misses are resolved automatically and cached for future use.
- Order records stay lean (no duplicate name fields).

The tradeoff is that a backend endpoint must exist to resolve any UUID to display info regardless of subscription status, and entities must be soft-deleted (never hard-deleted) so resolution always works.

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
- Modeled via `subscribedDispatcherIds: string[]` on the Admin's user record
- When creating an order, the Dispatcher selects which Admin it belongs to
- The `adminId` lives on the Order record, not on the Dispatcher's user record
- A Dispatcher subscribes to an Admin → their dispatcherId is added to the Admin's list
- When an Admin creates a Dispatcher placeholder → auto-subscribed

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
During implementation planning, we identified that the Dispatcher needs to know which Admins they work for (to populate the "Select Admin" dropdown on the Create Order form). Since `subscribedDispatcherIds` lives on the Admin's record, querying "which Admins contain my ID" would require a table scan. Solution: add `subscribedAdminIds: string[]` to the Dispatcher's record, maintained in sync. When an Admin subscribes a Dispatcher, both records are updated.

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
  subscribedDispatcherIds?: string[];  // On Admin records only
  subscribedCarrierIds?: string[];     // On Dispatcher records only
  subscribedAdminIds?: string[];       // On Dispatcher records only (bidirectional sync)

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
2. Backend checks if a Cognito user exists with that email:
   - **Exists (placeholder)**: sends a verification code to that email address.
   - **Doesn't exist**: creates a new Cognito user, sends a verification code.
3. The HTTP response is identical in both cases: "Verification code sent to your email." This prevents email enumeration attacks — an attacker cannot determine whether a placeholder exists by observing the response.
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

### Solution: Two-Tier Cache with Forced Refresh

#### Cache Structure (localStorage)

```json
{
  "ttl": "<ISO timestamp>",
  "subscribed": {
    "<uuid>": { "name": "Swift Transport", "type": "carrier" },
    "<uuid>": { "name": "James Garcia", "type": "driver" },
    "<uuid>": { "plate": "ABC1234", "brand": "Peterbilt", "type": "truck" }
  },
  "resolved": {
    "<uuid>": { "name": "Old Carrier LLC", "type": "carrier", "fetchedAt": "..." }
  }
}
```

- **`subscribed` bucket**: Populated from full refresh of subscribed entities. Refreshed every 5 minutes.
- **`resolved` bucket**: Populated from cache-miss fetches. Longer TTL (30-60 minutes) since these are for historical/unsubscribed entities.

#### Refresh Strategy

| Trigger | Action |
|---------|--------|
| Dashboard load | Fetch all subscribed assets → populate `subscribed` bucket |
| Every 5 minutes | Background refresh of `subscribed` bucket (picks up new subscriptions, name changes) |
| Navigate to Create Order page | **Forced full refresh** (always fresh Carrier/asset list when it matters most) |
| Cache miss during table render | Batch-fetch unknown UUIDs via `POST /entities/resolve` → populate `resolved` bucket |

#### Table Rendering Logic

When rendering an order table cell that needs a name:
1. Check `subscribed` cache for the UUID → if found, display current name.
2. Check `resolved` cache for the UUID → if found, display resolved name.
3. If neither → add UUID to a batch list. After processing all rows, call `POST /entities/resolve` with the batch. Populate `resolved` cache. Re-render.

#### Filters

Filters always operate on UUIDs, not names. The filter dropdown is populated from the `subscribed` cache (current names), but the filter value sent to the backend is the UUID. This means name changes never break filtering.

#### Backend Endpoint

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
- Entities are soft-deleted (never hard-deleted), so resolution always works.
- If an entity is truly gone, returns `{ "name": "Unknown", "type": "unknown" }`.

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

### New Seed Data

Wipe v2 tables and seed with:
- 2 Admins (business owners)
- 3 Dispatchers (subscribed across both Admins)
- 3 Carriers (subscribed across Dispatchers, each with trucks/trailers/drivers)
- 6-8 Drivers (distributed across Carriers)
- 10-15 Trucks (distributed across Carriers)
- 10-15 Trailers (distributed across Carriers)
- 20 Brokers (same list as current)
- 200+ Orders with new statuses, new financial model, proper adminId/carrierId references

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
