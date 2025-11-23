import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { CreateBrokerDto, UpdateBrokerDto, Broker } from '@haulhub/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BrokersService {
  private readonly brokersTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.brokersTableName = this.configService.brokersTableName;
  }

  /**
   * Get all brokers (optionally filter by active status)
   */
  async getAllBrokers(activeOnly: boolean = false): Promise<Broker[]> {
    try {
      const scanCommand = new ScanCommand({
        TableName: this.brokersTableName,
      });

      const result = await this.awsService.getDynamoDBClient().send(scanCommand);

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      let brokers = result.Items.map((item) => this.mapDynamoDBItemToBroker(item));

      // Filter by active status if requested
      if (activeOnly) {
        brokers = brokers.filter((broker) => broker.isActive);
      }

      return brokers;
    } catch (error: any) {
      console.error('Error getting brokers:', error);
      throw new InternalServerErrorException('Failed to retrieve brokers');
    }
  }

  /**
   * Get broker by ID
   */
  async getBrokerById(brokerId: string): Promise<Broker> {
    try {
      const getCommand = new GetCommand({
        TableName: this.brokersTableName,
        Key: {
          PK: `BROKER#${brokerId}`,
          SK: 'METADATA',
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(getCommand);

      if (!result.Item) {
        throw new NotFoundException(`Broker with ID ${brokerId} not found`);
      }

      return this.mapDynamoDBItemToBroker(result.Item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error getting broker:', error);
      throw new InternalServerErrorException('Failed to retrieve broker');
    }
  }

  /**
   * Create a new broker
   */
  async createBroker(createBrokerDto: CreateBrokerDto): Promise<Broker> {
    const brokerId = uuidv4();
    const now = new Date().toISOString();

    const broker: Broker = {
      brokerId,
      brokerName: createBrokerDto.brokerName,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const putCommand = new PutCommand({
        TableName: this.brokersTableName,
        Item: {
          PK: `BROKER#${brokerId}`,
          SK: 'METADATA',
          ...broker,
        },
      });

      await this.awsService.getDynamoDBClient().send(putCommand);

      return broker;
    } catch (error: any) {
      console.error('Error creating broker:', error);
      throw new InternalServerErrorException('Failed to create broker');
    }
  }

  /**
   * Update broker
   */
  async updateBroker(
    brokerId: string,
    updateBrokerDto: UpdateBrokerDto,
  ): Promise<Broker> {
    const { brokerName, isActive } = updateBrokerDto;

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (brokerName !== undefined) {
      updateExpressions.push('#brokerName = :brokerName');
      expressionAttributeNames['#brokerName'] = 'brokerName';
      expressionAttributeValues[':brokerName'] = brokerName;
    }

    if (isActive !== undefined) {
      updateExpressions.push('#isActive = :isActive');
      expressionAttributeNames['#isActive'] = 'isActive';
      expressionAttributeValues[':isActive'] = isActive;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // Only updatedAt, no actual changes
      return this.getBrokerById(brokerId);
    }

    try {
      const updateCommand = new UpdateCommand({
        TableName: this.brokersTableName,
        Key: {
          PK: `BROKER#${brokerId}`,
          SK: 'METADATA',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(PK)',
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException(`Broker with ID ${brokerId} not found`);
      }

      return this.mapDynamoDBItemToBroker(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Broker with ID ${brokerId} not found`);
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating broker:', error);
      throw new InternalServerErrorException('Failed to update broker');
    }
  }

  /**
   * Delete broker (soft delete by setting isActive to false)
   */
  async deleteBroker(brokerId: string): Promise<void> {
    try {
      const updateCommand = new UpdateCommand({
        TableName: this.brokersTableName,
        Key: {
          PK: `BROKER#${brokerId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#isActive': 'isActive',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':isActive': false,
          ':updatedAt': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_exists(PK)',
      });

      await this.awsService.getDynamoDBClient().send(updateCommand);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundException(`Broker with ID ${brokerId} not found`);
      }
      console.error('Error deleting broker:', error);
      throw new InternalServerErrorException('Failed to delete broker');
    }
  }

  /**
   * Map DynamoDB item to Broker interface
   */
  private mapDynamoDBItemToBroker(item: any): Broker {
    return {
      brokerId: item.brokerId,
      brokerName: item.brokerName,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
