import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  QueryCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import {
  Lorry,
  LorryVerificationStatus,
  VerifyLorryDto,
  User,
  VerificationStatus,
  VerifyUserDto,
} from '@haulhub/shared';

@Injectable()
export class AdminService {
  private readonly usersTableName: string;
  private readonly lorriesTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.usersTableName = this.configService.usersTableName;
    this.lorriesTableName = this.configService.lorriesTableName;
  }

  /**
   * Get all pending lorry verifications
   * Query GSI1 on new lorries table for lorries with Pending or NeedsMoreEvidence status
   * Requirements: 12.1
   */
  async getPendingLorries(): Promise<Lorry[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    try {
      // Query for Pending lorries using GSI1
      const pendingQuery = new QueryCommand({
        TableName: this.lorriesTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': `LORRY_STATUS#${LorryVerificationStatus.Pending}`,
        },
      });

      const pendingResult = await dynamodbClient.send(pendingQuery);

      // Query for NeedsMoreEvidence lorries using GSI1
      const needsMoreEvidenceQuery = new QueryCommand({
        TableName: this.lorriesTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': `LORRY_STATUS#${LorryVerificationStatus.NeedsMoreEvidence}`,
        },
      });

      const needsMoreEvidenceResult = await dynamodbClient.send(
        needsMoreEvidenceQuery,
      );

      // Combine results
      const allItems = [
        ...(pendingResult.Items || []),
        ...(needsMoreEvidenceResult.Items || []),
      ];

      return allItems.map((item) => this.mapItemToLorry(item));
    } catch (error: any) {
      console.error('Error getting pending lorries:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve pending lorries',
      );
    }
  }

  /**
   * Verify a lorry (approve/reject/request more evidence)
   * Requirements: 12.2, 12.3, 12.4
   */
  async verifyLorry(
    lorryId: string,
    dto: VerifyLorryDto,
  ): Promise<Lorry> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate decision
    const validDecisions = ['Approved', 'Rejected', 'NeedsMoreEvidence'];
    if (!validDecisions.includes(dto.decision)) {
      throw new BadRequestException(
        `Invalid decision. Must be one of: ${validDecisions.join(', ')}`,
      );
    }

    // Validate rejection reason for Rejected and NeedsMoreEvidence
    if (
      (dto.decision === 'Rejected' || dto.decision === 'NeedsMoreEvidence') &&
      (!dto.reason || dto.reason.trim().length === 0)
    ) {
      throw new BadRequestException(
        `Rejection reason is required when decision is ${dto.decision}`,
      );
    }

    try {
      // First, we need to find the lorry to get the ownerId
      // We'll query GSI1 on the new lorries table to find the lorry by lorryId
      const findLorryQuery = new QueryCommand({
        TableName: this.lorriesTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':gsi1sk': `LORRY#${lorryId}`,
        },
      });

      const findResult = await dynamodbClient.send(findLorryQuery);

      if (!findResult.Items || findResult.Items.length === 0) {
        throw new NotFoundException(`Lorry with ID ${lorryId} not found`);
      }

      const lorryItem = findResult.Items[0];
      const ownerId = lorryItem.ownerId;
      const currentStatus = lorryItem.verificationStatus;

      // Map decision to verification status
      const newStatus = dto.decision as LorryVerificationStatus;

      // Build update expression
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      // Update verification status
      updateExpressions.push('#verificationStatus = :verificationStatus');
      expressionAttributeNames['#verificationStatus'] = 'verificationStatus';
      expressionAttributeValues[':verificationStatus'] = newStatus;

      // Update GSI1PK to reflect new status
      updateExpressions.push('#GSI1PK = :gsi1pk');
      expressionAttributeNames['#GSI1PK'] = 'GSI1PK';
      expressionAttributeValues[':gsi1pk'] = `LORRY_STATUS#${newStatus}`;

      // Update or remove rejection reason
      if (dto.decision === 'Rejected' || dto.decision === 'NeedsMoreEvidence') {
        updateExpressions.push('#rejectionReason = :rejectionReason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
        expressionAttributeValues[':rejectionReason'] = dto.reason;
      } else if (dto.decision === 'Approved') {
        // Remove rejection reason if approved
        updateExpressions.push('REMOVE #rejectionReason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
      }

      // Update timestamp
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();

      // Update the lorry in the new lorries table
      const updateCommand = new UpdateCommand({
        TableName: this.lorriesTableName,
        Key: {
          PK: `LORRY_OWNER#${ownerId}`,
          SK: `LORRY#${lorryId}`,
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(PK)',
      });

      const result = await dynamodbClient.send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException(`Lorry with ID ${lorryId} not found`);
      }

      return this.mapItemToLorry(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Lorry with ID ${lorryId} not found`);
      }
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error verifying lorry:', error);
      throw new InternalServerErrorException('Failed to verify lorry');
    }
  }

  /**
   * Map DynamoDB item to Lorry interface
   */
  private mapItemToLorry(item: any): Lorry {
    return {
      lorryId: item.lorryId,
      ownerId: item.ownerId,
      make: item.make,
      model: item.model,
      year: item.year,
      verificationStatus: item.verificationStatus,
      verificationDocuments: item.verificationDocuments || [],
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Get all pending user verifications
   * Scan for users with Pending verification status
   * Requirements: 13.1
   */
  async getPendingUsers(): Promise<User[]> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    try {
      // Scan the UsersTable for users with Pending verification status
      // Note: In production with large datasets, consider adding GSI for user status queries
      const scanCommand = new ScanCommand({
        TableName: this.usersTableName,
        FilterExpression:
          'begins_with(PK, :pkPrefix) AND SK = :sk AND #verificationStatus = :status',
        ExpressionAttributeNames: {
          '#verificationStatus': 'verificationStatus',
        },
        ExpressionAttributeValues: {
          ':pkPrefix': 'USER#',
          ':sk': 'PROFILE',
          ':status': VerificationStatus.Pending,
        },
      });

      const result = await dynamodbClient.send(scanCommand);

      return (result.Items || []).map((item) => this.mapItemToUser(item));
    } catch (error: any) {
      console.error('Error getting pending users:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve pending users',
      );
    }
  }

  /**
   * Verify a user (verify/reject)
   * Requirements: 13.2, 13.3, 13.4, 13.5
   */
  async verifyUser(userId: string, dto: VerifyUserDto): Promise<User> {
    const dynamodbClient = this.awsService.getDynamoDBClient();

    // Validate decision
    const validDecisions = ['Verified', 'Rejected'];
    if (!validDecisions.includes(dto.decision)) {
      throw new BadRequestException(
        `Invalid decision. Must be one of: ${validDecisions.join(', ')}`,
      );
    }

    // Validate rejection reason for Rejected
    if (
      dto.decision === 'Rejected' &&
      (!dto.reason || dto.reason.trim().length === 0)
    ) {
      throw new BadRequestException(
        'Rejection reason is required when decision is Rejected',
      );
    }

    try {
      // First, check if the user exists in UsersTable
      const getCommand = new GetCommand({
        TableName: this.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      });

      const getResult = await dynamodbClient.send(getCommand);

      if (!getResult.Item) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Map decision to verification status
      const newStatus = dto.decision as VerificationStatus;

      // Build update expression
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      // Update verification status
      updateExpressions.push('#verificationStatus = :verificationStatus');
      expressionAttributeNames['#verificationStatus'] = 'verificationStatus';
      expressionAttributeValues[':verificationStatus'] = newStatus;

      // Update or remove rejection reason
      if (dto.decision === 'Rejected') {
        updateExpressions.push('#rejectionReason = :rejectionReason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
        expressionAttributeValues[':rejectionReason'] = dto.reason;
      } else if (dto.decision === 'Verified') {
        // Remove rejection reason if verified
        updateExpressions.push('REMOVE #rejectionReason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
      }

      // Update timestamp
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();

      // Update the user in UsersTable
      const updateCommand = new UpdateCommand({
        TableName: this.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(PK)',
      });

      const result = await dynamodbClient.send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      return this.mapItemToUser(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error verifying user:', error);
      throw new InternalServerErrorException('Failed to verify user');
    }
  }

  /**
   * Map DynamoDB item to User interface
   */
  private mapItemToUser(item: any): User {
    return {
      userId: item.userId,
      email: item.email,
      fullName: item.fullName,
      phoneNumber: item.phoneNumber,
      role: item.role,
      verificationStatus: item.verificationStatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
