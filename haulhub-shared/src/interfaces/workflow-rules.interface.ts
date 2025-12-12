import { TripStatus } from '../enums/trip-status.enum';

/**
 * Defines valid status transitions in the workflow
 * Requirements: 11.3 - Workflow automation rules and validations
 */
export interface StatusTransitionRule {
  fromStatus: TripStatus;
  toStatus: TripStatus;
  requiresApproval: boolean;
  allowedRoles: string[]; // User roles that can perform this transition
  automaticTriggers?: AutomaticTrigger[];
}

/**
 * Defines conditions that automatically trigger status changes
 */
export interface AutomaticTrigger {
  condition: string; // Description of the condition
  targetStatus: TripStatus;
  checkInterval?: number; // How often to check (in minutes)
}

/**
 * Workflow configuration for the system
 */
export interface WorkflowConfiguration {
  transitions: StatusTransitionRule[];
  defaultStatus: TripStatus;
  finalStatuses: TripStatus[]; // Statuses that cannot be changed
  enableAutomation: boolean;
}

/**
 * Standard workflow rules for HaulHub
 */
export const DEFAULT_WORKFLOW_RULES: StatusTransitionRule[] = [
  // Scheduled -> PickedUp (driver picks up load)
  {
    fromStatus: TripStatus.Scheduled,
    toStatus: TripStatus.PickedUp,
    requiresApproval: false,
    allowedRoles: ['dispatcher', 'driver', 'admin']
  },
  // PickedUp -> InTransit (driver starts journey)
  {
    fromStatus: TripStatus.PickedUp,
    toStatus: TripStatus.InTransit,
    requiresApproval: false,
    allowedRoles: ['dispatcher', 'driver', 'admin']
  },
  // InTransit -> Delivered (driver delivers load)
  {
    fromStatus: TripStatus.InTransit,
    toStatus: TripStatus.Delivered,
    requiresApproval: false,
    allowedRoles: ['dispatcher', 'driver', 'admin']
  },
  // Delivered -> Paid (payment processed)
  {
    fromStatus: TripStatus.Delivered,
    toStatus: TripStatus.Paid,
    requiresApproval: false,
    allowedRoles: ['dispatcher', 'admin']
  },
  // Scheduled -> Canceled (trip canceled)
  {
    fromStatus: TripStatus.Scheduled,
    toStatus: TripStatus.Canceled,
    requiresApproval: true,
    allowedRoles: ['dispatcher', 'admin']
  },
  // Rollback transitions (require approval)
  {
    fromStatus: TripStatus.PickedUp,
    toStatus: TripStatus.Scheduled,
    requiresApproval: true,
    allowedRoles: ['admin']
  },
  {
    fromStatus: TripStatus.InTransit,
    toStatus: TripStatus.PickedUp,
    requiresApproval: true,
    allowedRoles: ['admin']
  },
  {
    fromStatus: TripStatus.Delivered,
    toStatus: TripStatus.InTransit,
    requiresApproval: true,
    allowedRoles: ['admin']
  }
];
