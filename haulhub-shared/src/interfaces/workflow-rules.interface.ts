import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';

export interface StatusTransitionRule {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  allowedRoles: UserRole[];
}

export interface WorkflowConfiguration {
  transitions: StatusTransitionRule[];
  defaultStatus: OrderStatus;
  finalStatuses: OrderStatus[];
}

/**
 * v2 status transition rules per design Section 5.
 * Forward flow: Scheduled → PickingUp → Transit → Delivered → WaitingRC → ReadyToPay
 * Cancel: Scheduled → Canceled (Dispatcher only)
 */
export const ORDER_WORKFLOW_RULES: StatusTransitionRule[] = [
  // Forward flow
  {
    fromStatus: OrderStatus.Scheduled,
    toStatus: OrderStatus.PickingUp,
    allowedRoles: [UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver]
  },
  {
    fromStatus: OrderStatus.PickingUp,
    toStatus: OrderStatus.Transit,
    allowedRoles: [UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver]
  },
  {
    fromStatus: OrderStatus.Transit,
    toStatus: OrderStatus.Delivered,
    allowedRoles: [UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver]
  },
  {
    fromStatus: OrderStatus.Delivered,
    toStatus: OrderStatus.WaitingRC,
    allowedRoles: [UserRole.Dispatcher, UserRole.Carrier]
  },
  {
    fromStatus: OrderStatus.WaitingRC,
    toStatus: OrderStatus.ReadyToPay,
    allowedRoles: [UserRole.Dispatcher]
  },
  // Cancel
  {
    fromStatus: OrderStatus.Scheduled,
    toStatus: OrderStatus.Canceled,
    allowedRoles: [UserRole.Dispatcher]
  }
];

export function isTransitionAllowed(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  role: UserRole
): boolean {
  return ORDER_WORKFLOW_RULES.some(
    rule => rule.fromStatus === fromStatus &&
            rule.toStatus === toStatus &&
            rule.allowedRoles.includes(role)
  );
}
