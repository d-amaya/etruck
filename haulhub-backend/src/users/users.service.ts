import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { UpdateProfileDto } from '@haulhub/shared';
import { User } from '@haulhub/shared';

@Injectable()
export class UsersService {
  private readonly usersTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.usersTableName = this.configService.usersTableName;
  }

  /**
   * Get user profile from DynamoDB
   */
  async getUserProfile(userId: string): Promise<User> {
    try {
      const getCommand = new GetCommand({
        TableName: this.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(getCommand);

      if (!result.Item) {
        throw new NotFoundException('User profile not found');
      }

      return this.mapDynamoDBItemToUser(result.Item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error getting user profile:', error);
      throw new InternalServerErrorException('Failed to retrieve user profile');
    }
  }

  /**
   * Update user profile in DynamoDB
   */
  async updateUserProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const { fullName, phoneNumber } = updateProfileDto;

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (fullName !== undefined) {
      updateExpressions.push('#fullName = :fullName');
      expressionAttributeNames['#fullName'] = 'fullName';
      expressionAttributeValues[':fullName'] = fullName;
    }

    if (phoneNumber !== undefined) {
      updateExpressions.push('#phoneNumber = :phoneNumber');
      expressionAttributeNames['#phoneNumber'] = 'phoneNumber';
      expressionAttributeValues[':phoneNumber'] = phoneNumber;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // Only updatedAt, no actual changes
      return this.getUserProfile(userId);
    }

    try {
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
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException('User profile not found');
      }

      return this.mapDynamoDBItemToUser(result.Attributes);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating user profile:', error);
      throw new InternalServerErrorException('Failed to update user profile');
    }
  }

  /**
   * Get user by ID (admin function)
   */
  async getUserById(userId: string): Promise<User> {
    return this.getUserProfile(userId);
  }

  /**
   * Map DynamoDB item to User interface
   */
  private mapDynamoDBItemToUser(item: any): User {
    return {
      userId: item.userId,
      email: item.email,
      fullName: item.fullName,
      phoneNumber: item.phoneNumber,
      role: item.role,
      verificationStatus: item.verificationStatus,
      driverLicenseNumber: item.driverLicenseNumber,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
