---
date: 2026-02-20T18:01:00+00:00
researcher: Kiro
git_commit: 0b0a30c
branch: main
repository: github.com/d-amaya/etruck
topic: "Backend guard rails for order ownership authorization"
tags: [research, codebase, authorization, orders, security]
status: complete
last_updated: 2026-02-20
last_updated_by: Kiro
---

# Research: Backend Guard Rails for Order Ownership Authorization

**Date**: 2026-02-20T18:01:00+00:00
**Researcher**: Kiro
**Git Commit**: 0b0a30c
**Branch**: main
**Repository**: github.com/d-amaya/etruck

## Research Question

What backend authorization guard rails exist today for order mutations (create, update, delete, status change), and what does the v2 design require for the new multi-role, many-to-many model?

## Summary

The current codebase has a two-layer authorization model: (1) role-based access via `@Roles()` decorator + `RolesGuard`, and (2) ownership verification inside service methods. The Dispatcher path has ownership checks (trip.dispatcherId === userId). The Driver path verifies assignment via GSI3 query. The Carrier path has a `validateCarrierAccess()` helper that compares JWT `carrierId` to the requested resource. However, the v2 model introduces 4 roles that can mutate orders with different field-level permissions, and the many-to-many relationships mean ownership is no longer a simple `userId === record.fieldId` check.

## Detailed Findings

### Layer 1: Route-Level Role Gating

Every controller uses `@UseGuards(JwtAuthGuard, RolesGuard)` at the class level. Individual endpoints use `@Roles(UserRole.Dispatcher)` etc. to restrict which roles can hit the endpoint.

- `JwtAuthGuard` (`auth/guards/jwt-auth.guard.ts`) validates the Cognito JWT, extracts `userId`, `email`, `role` (from `cognito:groups`), `carrierId`, and `nationalId` from Cognito user attributes. Attaches to `request.user`.
- `RolesGuard` (`auth/guards/roles.guard.ts`) checks `request.user.role` against the `@Roles()` metadata. Returns 403 if no match.
- `@CurrentUser()` decorator (`auth/decorators/current-user.decorator.ts`) extracts the user object from the request for use in controller methods.

### Layer 2: Ownership Verification in Service Methods

#### Dispatcher — `getTripById()` (trips.service.ts:350-408)

The core ownership check. Called by `updateTrip()`, `deleteTrip()`, and `getTripById()`:

```typescript
if (userRole === UserRole.Dispatcher && trip.dispatcherId !== userId) {
  throw new ForbiddenException('You do not have permission to access this trip');
}
```

This is a read-then-check pattern: fetch the record by PK, then compare `dispatcherId` to the JWT `userId`. If mismatch → 403.

#### Driver — `getTripForDriver()` (trips.service.ts:940-975)

Queries GSI3 (`DRIVER#<userId>`) to find all trips assigned to the driver, then checks if the specific `tripId` is in the result set. If not → 403.

#### Carrier — `validateCarrierAccess()` (carrier.controller.ts:68-82)

Compares `user.carrierId` from JWT to the `requestedCarrierId` parameter. This is used for asset management (trucks, trailers, drivers), not for trip mutations.

#### Gaps in Current Implementation

1. **Carrier trip access**: `getTripById()` has a comment: `"For now, we'll allow carriers to view any trip"` — no `carrierId` check.
2. **LorryOwner trip access**: Comment says `"In production, add lorry ownership verification here"` — no check implemented.
3. **No field-level enforcement**: `updateTrip()` accepts any field in the DTO. There's no check preventing a Dispatcher from sending `driverPayment` or `fuelGasAvgCost` (fields they shouldn't control in v2).

### What v2 Requires (from design.md Sections 4, 17)

The v2 model has 4 roles that can mutate orders, each with different permissions:

| Operation | Admin | Dispatcher | Carrier | Driver |
|-----------|-------|------------|---------|--------|
| Create Order | ❌ | ✅ | ❌ | ❌ |
| Edit Order (most fields) | ❌ | ✅ | ❌ | ❌ |
| Edit dispatcherRate (adminRate auto-adjusts) | ✅ | ❌ | ❌ | ❌ |
| Edit assignment (truck/trailer/driver) | ❌ | ✅ | ✅ | ❌ |
| Edit driverRate, fuel inputs | ❌ | ❌ | ✅ | ❌ |
| Update status | ❌ | ✅ | ✅ | ✅ |
| Add notes | ✅ | ✅ | ✅ | ✅ |
| Cancel order | ❌ | ✅ | ❌ | ❌ |

### Ownership Rules for v2

Each role's "ownership" of an order is verified differently:

| Role | Ownership Check | DynamoDB Verification |
|------|----------------|----------------------|
| Admin | `order.adminId === user.userId` | Fetch order, compare `adminId` |
| Dispatcher | `order.dispatcherId === user.userId` | Fetch order, compare `dispatcherId` |
| Carrier | `order.carrierId === user.carrierId` | Fetch order, compare `carrierId` to JWT `carrierId` |
| Driver | `order.driverId === user.userId` | Fetch order, compare `driverId` |

For Carrier, the check uses `user.carrierId` (from JWT/Cognito attributes), not `user.userId`, because the Carrier's `userId` is their `carrierId` (self-reference in the User table).

### Proposed Guard Rail Architecture

Two enforcement layers needed:

**1. Ownership Guard (read-then-check)**
Fetch the order by PK, verify the caller has a relationship to it based on their role. Reject with 403 if not.

**2. Field-Level Enforcement (per-role allowlists)**
After ownership is confirmed, filter the incoming DTO to only allow fields the role is permitted to modify. Silently strip disallowed fields (or reject with 400).

Allowlists per role:

| Role | Allowed Fields on Update |
|------|------------------------|
| Admin | `dispatcherRate` (triggers `adminRate` + `adminPayment` + `dispatcherPayment` recalc), `notes` |
| Dispatcher | All order fields EXCEPT `dispatcherRate`, `adminRate`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil` |
| Carrier | `driverId`, `truckId`, `trailerId`, `driverRate`, `fuelGasAvgCost`, `fuelGasAvgGallxMil`, `notes` |
| Driver | (status updates only — separate endpoint), `notes` |

## Code References

- `haulhub-backend/src/auth/guards/jwt-auth.guard.ts` — JWT validation, user extraction
- `haulhub-backend/src/auth/guards/roles.guard.ts` — Role-based route gating
- `haulhub-backend/src/auth/decorators/current-user.decorator.ts` — `CurrentUserData` interface
- `haulhub-backend/src/auth/decorators/roles.decorator.ts` — `@Roles()` decorator
- `haulhub-backend/src/trips/trips.controller.ts` — Route definitions with role annotations
- `haulhub-backend/src/trips/trips.service.ts:350-408` — `getTripById()` with ownership check
- `haulhub-backend/src/trips/trips.service.ts:410-600` — `updateTrip()` (calls getTripById for auth)
- `haulhub-backend/src/trips/trips.service.ts:829-1000` — `updateTripStatus()` with driver verification
- `haulhub-backend/src/trips/trips.service.ts:3588-3620` — `deleteTrip()` (calls getTripById for auth)
- `haulhub-backend/src/carrier/carrier.controller.ts:68-82` — `validateCarrierAccess()` pattern

## Architecture Documentation

### Current Authorization Flow

```
HTTP Request
  → JwtAuthGuard: validate token, extract user (userId, role, carrierId)
  → RolesGuard: check user.role ∈ @Roles() metadata
  → Controller: pass user + params to service
  → Service: fetch record by PK, compare ownership field to user.userId
  → If mismatch: throw ForbiddenException (403)
  → If match: proceed with mutation
```

### v2 Authorization Flow (needed)

```
HTTP Request
  → JwtAuthGuard: validate token, extract user (userId, role, carrierId)
  → RolesGuard: check user.role ∈ @Roles() metadata
  → Controller: pass user + params to service
  → Service: fetch order by PK
  → Ownership check: order.<roleField> === user.<idField> (role-dependent)
  → Field-level filter: strip fields not in role's allowlist
  → Auto-recalculation: if rate fields changed, recalculate dependent fields
  → DynamoDB update with filtered fields only
```

## Historical Context (from thoughts/)

- `thoughts/shared/design.md` Section 4 — Per-role financial visibility and editing permissions
- `thoughts/shared/design.md` Section 17 — Revised financial model with field-level editing rules
- `thoughts/shared/design.md` Section 1.6, Decision 6 — Editing permissions per role

## Open Questions

All resolved:

1. **Disallowed fields → 400 rejection.** If a role sends fields they're not permitted to modify, the backend returns 400 Bad Request (not silent strip). This makes security auditing explicit and catches frontend bugs early.
2. **ConditionExpression for atomic ownership checks.** Instead of read-then-check (race condition window), the DynamoDB update/delete uses a `ConditionExpression` that verifies ownership atomically. Example: `ConditionExpression: 'attribute_exists(PK) AND dispatcherId = :callerId'`. If the condition fails, return 403.
3. **Carrier status transitions** — fully defined in design.md Section 17. No additional restrictions needed.
