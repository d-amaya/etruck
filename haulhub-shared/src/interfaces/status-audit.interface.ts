import { TripStatus } from '../enums/trip-status.enum';

/**
 * Represents a single status change event in the audit trail
 * Requirements: 11.2 - Status change audit trails with timestamps and user information
 */
export interface StatusAuditEntry {
  auditId: string;
  tripId: string;
  previousStatus: TripStatus;
  newStatus: TripStatus;
  changedBy: string; // User ID who made the change
  changedByName: string; // User name for display
  changedAt: string; // ISO timestamp
  reason?: string; // Optional reason for status change
  notes?: string; // Additional notes about the change
  automaticChange: boolean; // Whether this was an automated workflow change
}

/**
 * Represents the complete audit trail for a trip
 */
export interface StatusAuditTrail {
  tripId: string;
  entries: StatusAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a status change with audit information
 */
export interface StatusChangeRequest {
  newStatus: TripStatus;
  reason?: string;
  notes?: string;
}

/**
 * Workflow validation result
 */
export interface StatusTransitionValidation {
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
}
