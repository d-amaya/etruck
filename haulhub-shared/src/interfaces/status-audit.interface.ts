import { OrderStatus } from '../enums/order-status.enum';

export interface StatusAuditEntry {
  auditId: string;
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  reason?: string;
  notes?: string;
}

export interface StatusAuditTrail {
  orderId: string;
  entries: StatusAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface StatusChangeRequest {
  newStatus: OrderStatus;
  reason?: string;
  notes?: string;
}

export interface StatusTransitionValidation {
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
}
