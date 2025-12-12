import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  TripStatus,
  StatusAuditEntry,
  StatusAuditTrail,
  StatusChangeRequest,
  StatusTransitionValidation,
  StatusTransitionRule,
  DEFAULT_WORKFLOW_RULES
} from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing trip status workflows and audit trails
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */
@Injectable()
export class StatusWorkflowService {
  private workflowRules: StatusTransitionRule[] = DEFAULT_WORKFLOW_RULES;

  /**
   * Validate if a status transition is allowed
   * Requirements: 11.3 - Workflow automation rules and validations
   */
  validateStatusTransition(
    currentStatus: TripStatus,
    newStatus: TripStatus,
    userRole: string
  ): StatusTransitionValidation {
    // Same status is not a valid transition
    if (currentStatus === newStatus) {
      return {
        isValid: false,
        errorMessage: 'New status must be different from current status'
      };
    }

    // Find matching transition rule
    const rule = this.workflowRules.find(
      r => r.fromStatus === currentStatus && r.toStatus === newStatus
    );

    if (!rule) {
      return {
        isValid: false,
        errorMessage: `Invalid status transition from ${currentStatus} to ${newStatus}`
      };
    }

    // Check if user role is allowed
    if (!rule.allowedRoles.includes(userRole)) {
      return {
        isValid: false,
        errorMessage: `User role '${userRole}' is not authorized to perform this status transition`
      };
    }

    // Check if approval is required
    const warnings: string[] = [];
    if (rule.requiresApproval) {
      warnings.push('This status change requires approval');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Create an audit entry for a status change
   * Requirements: 11.2 - Status change audit trails with timestamps and user information
   */
  createAuditEntry(
    tripId: string,
    previousStatus: TripStatus,
    newStatus: TripStatus,
    userId: string,
    userName: string,
    request: StatusChangeRequest,
    isAutomatic: boolean = false
  ): StatusAuditEntry {
    return {
      auditId: uuidv4(),
      tripId,
      previousStatus,
      newStatus,
      changedBy: userId,
      changedByName: userName,
      changedAt: new Date().toISOString(),
      reason: request.reason,
      notes: request.notes,
      automaticChange: isAutomatic
    };
  }

  /**
   * Get all possible next statuses from current status
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  getAvailableTransitions(currentStatus: TripStatus, userRole: string): TripStatus[] {
    return this.workflowRules
      .filter(rule => 
        rule.fromStatus === currentStatus && 
        rule.allowedRoles.includes(userRole)
      )
      .map(rule => rule.toStatus);
  }

  /**
   * Check if a status is a final status (cannot be changed)
   * Requirements: 11.3 - Workflow automation rules
   */
  isFinalStatus(status: TripStatus): boolean {
    const finalStatuses: TripStatus[] = [TripStatus.Paid, TripStatus.Canceled];
    return finalStatuses.includes(status);
  }

  /**
   * Get status display information
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  getStatusDisplayInfo(status: TripStatus): {
    label: string;
    color: string;
    icon: string;
    description: string;
  } {
    const statusInfo = {
      [TripStatus.Scheduled]: {
        label: 'Scheduled',
        color: '#2196F3',
        icon: 'schedule',
        description: 'Trip is confirmed and scheduled'
      },
      [TripStatus.PickedUp]: {
        label: 'Picked Up',
        color: '#9C27B0',
        icon: 'local_shipping',
        description: 'Load has been picked up'
      },
      [TripStatus.InTransit]: {
        label: 'In Transit',
        color: '#3F51B5',
        icon: 'directions_car',
        description: 'Trip is in progress'
      },
      [TripStatus.Delivered]: {
        label: 'Delivered',
        color: '#4CAF50',
        icon: 'check_circle',
        description: 'Load has been delivered'
      },
      [TripStatus.Paid]: {
        label: 'Paid',
        color: '#00BCD4',
        icon: 'payment',
        description: 'Payment has been processed'
      },
      [TripStatus.Canceled]: {
        label: 'Canceled',
        color: '#F44336',
        icon: 'cancel',
        description: 'Trip has been canceled'
      }
    };

    return statusInfo[status];
  }

  /**
   * Get workflow statistics for reporting
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  getWorkflowStatistics(auditTrail: StatusAuditTrail): {
    totalChanges: number;
    automaticChanges: number;
    manualChanges: number;
    averageTimeInStatus: Record<TripStatus, number>;
    statusHistory: Array<{ status: TripStatus; duration: number }>;
  } {
    const entries = auditTrail.entries;
    const automaticChanges = entries.filter(e => e.automaticChange).length;
    const manualChanges = entries.filter(e => !e.automaticChange).length;

    // Calculate time spent in each status
    const statusDurations: Record<string, number[]> = {};
    const statusHistory: Array<{ status: TripStatus; duration: number }> = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const nextEntry = entries[i + 1];
      
      if (nextEntry) {
        const duration = new Date(nextEntry.changedAt).getTime() - new Date(entry.changedAt).getTime();
        const durationHours = duration / (1000 * 60 * 60);
        
        if (!statusDurations[entry.newStatus]) {
          statusDurations[entry.newStatus] = [];
        }
        statusDurations[entry.newStatus].push(durationHours);
        
        statusHistory.push({
          status: entry.newStatus,
          duration: durationHours
        });
      }
    }

    // Calculate averages
    const averageTimeInStatus: Record<TripStatus, number> = {} as any;
    Object.keys(statusDurations).forEach(status => {
      const durations = statusDurations[status];
      const average = durations.reduce((a, b) => a + b, 0) / durations.length;
      averageTimeInStatus[status as TripStatus] = average;
    });

    return {
      totalChanges: entries.length,
      automaticChanges,
      manualChanges,
      averageTimeInStatus,
      statusHistory
    };
  }
}
