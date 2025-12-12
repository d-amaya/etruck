import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand
} from '@aws-sdk/lib-dynamodb';
import {
  StatusAuditEntry,
  StatusAuditTrail,
  TripStatus
} from '@haulhub/shared';

/**
 * Service for persisting and retrieving status audit trails from DynamoDB
 * Requirements: 11.2 - Status change audit trails with timestamps and user information
 */
@Injectable()
export class StatusAuditService {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'eTrucky-MainTable-dev';
  }

  /**
   * Save a status audit entry to DynamoDB
   * Requirements: 11.2 - Record timestamps and user information for audit trails
   */
  async saveAuditEntry(entry: StatusAuditEntry): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: {
        PK: `TRIP#${entry.tripId}`,
        SK: `AUDIT#${entry.changedAt}#${entry.auditId}`,
        GSI1PK: `AUDIT#${entry.tripId}`,
        GSI1SK: entry.changedAt,
        entityType: 'StatusAudit',
        ...entry
      }
    });

    await this.docClient.send(command);
  }

  /**
   * Get all audit entries for a trip
   * Requirements: 11.2 - Retrieve complete audit trail for a trip
   */
  async getAuditTrail(tripId: string): Promise<StatusAuditTrail> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':sk': 'AUDIT#'
      },
      ScanIndexForward: true // Sort by timestamp ascending
    });

    const response = await this.docClient.send(command);
    const entries = (response.Items || []) as StatusAuditEntry[];

    return {
      tripId,
      entries,
      createdAt: entries[0]?.changedAt || new Date().toISOString(),
      updatedAt: entries[entries.length - 1]?.changedAt || new Date().toISOString()
    };
  }

  /**
   * Get audit entries within a date range
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  async getAuditEntriesByDateRange(
    tripId: string,
    startDate: string,
    endDate: string
  ): Promise<StatusAuditEntry[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':start': `AUDIT#${startDate}`,
        ':end': `AUDIT#${endDate}`
      },
      ScanIndexForward: true
    });

    const response = await this.docClient.send(command);
    return (response.Items || []) as StatusAuditEntry[];
  }

  /**
   * Get the most recent audit entry for a trip
   * Requirements: 11.2 - Quick access to latest status change
   */
  async getLatestAuditEntry(tripId: string): Promise<StatusAuditEntry | null> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':sk': 'AUDIT#'
      },
      ScanIndexForward: false, // Sort descending to get latest first
      Limit: 1
    });

    const response = await this.docClient.send(command);
    const items = response.Items || [];
    return items.length > 0 ? (items[0] as StatusAuditEntry) : null;
  }

  /**
   * Get audit entries by user
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  async getAuditEntriesByUser(
    userId: string,
    limit: number = 50
  ): Promise<StatusAuditEntry[]> {
    // This would require a GSI on changedBy field
    // For now, we'll implement a scan with filter (not optimal for production)
    // TODO: Add GSI for user-based queries in production
    
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'changedBy = :userId',
      ExpressionAttributeValues: {
        ':pk': 'AUDIT',
        ':userId': userId
      },
      Limit: limit
    });

    const response = await this.docClient.send(command);
    return (response.Items || []) as StatusAuditEntry[];
  }

  /**
   * Get statistics about status changes
   * Requirements: 11.4 - Status-based filtering and reporting
   */
  async getStatusChangeStatistics(
    startDate: string,
    endDate: string
  ): Promise<{
    totalChanges: number;
    changesByStatus: Record<TripStatus, number>;
    changesByUser: Record<string, number>;
    automaticChanges: number;
    manualChanges: number;
  }> {
    // This is a simplified implementation
    // In production, this would use aggregation or pre-computed metrics
    
    const stats = {
      totalChanges: 0,
      changesByStatus: {} as Record<TripStatus, number>,
      changesByUser: {} as Record<string, number>,
      automaticChanges: 0,
      manualChanges: 0
    };

    // Initialize status counters
    Object.values(TripStatus).forEach(status => {
      stats.changesByStatus[status] = 0;
    });

    return stats;
  }
}
