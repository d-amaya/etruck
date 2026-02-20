# eTrucky Requirements Update

## UI / UX Constraint

All changes described in this document must be implemented while preserving the current look and feel of the application. The existing dashboard structure, components, and styling must remain intact. Any modifications (column visibility, finance sections, filters, new fields, etc.) should be applied within the current UI framework without breaking styles or altering the overall customer experience.

The application already implements specific state management and caching strategies across its dashboards. This behavior must be retained, and any new dashboards or components must adopt the same patterns. Efficiency is a top-tier requirement — the current dashboards are already optimized this way, and all future work must follow suit.

The existing DynamoDB pagination logic is also a hard requirement. Any new dashboard must adopt the same strategy for reading records from DynamoDB, ensuring that pagination does not break when filters are applied and that the number of returned records always matches the expected page size.

### Deployment / Table Migration Constraint

The application is already deployed in an AWS account with test users actively using it. To avoid interfering with or breaking the existing deployed version, new DynamoDB tables have already been created via CDK with different names (e.g., `eTrucky-Users` → `eTruckyUsers`). Separate Cognito users have also been created, and the new tables have been seeded using the script at `scripts/seed-v2.ts`. The new codebase must point exclusively to these new tables.

Notable rename: the `eTrucky-Trips` table is now called `eTrucky-Orders`. The backend must be updated to point to this new table name.

---

## Revised Role Definitions

### 1. Admin (Business Owner)

The Admin is the direct contact with Brokers. They accept and negotiate orders, then delegate them to their Dispatchers. The Admin typically earns 5% of the order rate — since they take no risk, this is pure profit.

The Admin needs:
- A general view of the entire business
- The ability to track any order in the system
- Aggregated views by Dispatcher and Broker
- No visibility into fuel or driver costs (irrelevant to their role)

We need to reassess how their Analytics and Payment views should look.

### 2. Dispatcher

The Dispatcher assigns assets to carry out an order. They know many Carriers (companies that own trucks, trailers, and employ drivers) and coordinate with them to execute orders. The Dispatcher also earns a rate on the order, typically 5%. Like the Admin, they are an intermediary and take no risk — it is always profit.

The Dispatcher needs:
- A view of only their own orders
- Aggregated views with filters by Broker, Carrier, and Truck
- No visibility into fuel or driver costs (irrelevant to their role)

We need to reassess how their Analytics and Payment views should look.

### 3. Carrier

The Carrier is the company that owns the assets: Trucks, Trailers, and Drivers. There is no separate "Truck Owner" role — the Carrier itself is the owner. This corrects a confusion from the previous requirements.

---

## Proposed Changes

### Carrier Dashboard Naming
The Carrier Dashboard currently says "Admin Dashboard" in the title. Rename it to "Carrier Dashboard" to avoid confusion.

### Order Statuses
The valid statuses for orders are:
- Scheduled
- Picking Up
- Transit
- Delivered
- Ready To Pay
- Waiting RC
- Canceled

### Dispatcher Order Forms (Create, Edit, View)

- The Assignment section should allow the Dispatcher to select a Carrier first, then present the available assets (Trucks and Trailers) belonging to that Carrier.
- The Dispatcher should also be able to create or manage an asset for the Carrier on the fly during order creation, in case the Carrier hasn't registered it yet.

### Default Payment Rates

- Admin: 5% of the order rate
- Dispatcher: 5% of the order rate
- Carrier: the remaining 90%

### Admin Order View — Finances Section

The Admin's View Order form should only show values relevant to them. They do not care about fuel or driver costs. Their profit is:

```
Admin Profit = (Order Rate + Lumper Fee + Detention Fee) − (Dispatcher Payment + Carrier Payment)
```

Charts and Analytics should use the estimated order profit as the input for the Admin's calculations.

### Dispatcher Order Forms — Finances Section

The Dispatcher's Create, Edit, and View Order forms should only show values relevant to them. They do not care about fuel or driver costs. Their profit is:

```
Dispatcher Profit = Order Rate × Dispatcher Rate (default 5%)
```

They still need to see Lumper fees, Detention fees, and the Carrier's payment.

However, Charts and Analytics should use the Dispatcher's payment (not the order profit) as the input for their calculations.

Important: Carrier assets (Trucks and Drivers) have a default rate. When the Dispatcher creates an order, the system must always calculate fuel and driver costs behind the scenes and store them in DynamoDB. This ensures that when the Carrier opens the order, those fields are pre-populated and editable. The Dispatcher and Admin will never see those fields in their views.

### Carrier Order Forms — View and Edit — Finances Section

The Carrier's view operates differently from the Admin's and Dispatcher's. Carriers should not see the Broker payment or Dispatcher payment. Their revenue field is the Carrier's payment, and their profit is:

```
Carrier Profit = Carrier Payment − (Fuel Costs + Driver Payment)
```

Charts, Analytics, and Payment views should use the Carrier's payment as the input for profit/loss calculations.

Orders should always be created with default fuel and driver cost expenses based on the asset's default rate. When the Carrier opens the Edit view, they can modify those rates, which recalculates the Carrier's profit. Admin and Dispatcher profits are not affected by these changes.

### Audit Fields for Assets

Add the following fields to all assets:
- `createdAt` and `createdBy` — since assets can be created by either a Dispatcher or a Carrier
- `lastModifiedAt` and `lastModifiedBy` — to track who last updated the asset

### New Order Fields

Every order must have two new fields in the Order Information section:
- Invoice Number
- Broker Load

The existing Order Confirmation field appears to be no longer needed and should be removed.

### Dashboard Tables — Per-Role Visibility

Each user's dashboard table should only show columns relevant to their role:

- Admin: not interested in Truck, Trailer, or Driver details
- Dispatcher: not interested in Truck, Trailer, or Driver details, but wants to see their own profit (not the order profit)
- Carrier: interested in Dispatcher, Truck, Driver, and their own profit/loss

All users should see: Status, Invoice Number (new), Created/Scheduled date, and Pickup/Dropoff cities.

Filters per table should also be revisited to remove irrelevant options and keep only valuable ones for each role.

### User Registration and Multi-Admin Relationships

Open questions to resolve:
- What happens if a Dispatcher currently works with one Admin but moves to another in the future? Can they keep the same account?
- Can a Dispatcher manage orders for multiple Admins in parallel?
- Should the Dispatcher specify which Admin an order belongs to at creation time?

---

## Next Steps

Reason carefully about all of the above. Dive deep into the codebase to understand how these requirements impact the system end to end, including infrastructure. Help identify what data currently exists in DynamoDB, what gaps or waste exist in the records, and what changes are needed to support this business model. Ask clarifying questions as needed, and help plan how to get eTrucky to this desired state.
