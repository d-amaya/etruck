import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { Broker } from '@haulhub/shared';

@Injectable()
export class BrokersService {
  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {}

  async getAllBrokers(activeOnly = false): Promise<Broker[]> {
    const result = await this.awsService.getDynamoDBClient().send(
      new ScanCommand({ TableName: this.configService.v2BrokersTableName }),
    );
    let brokers = (result.Items || []).map(i => this.toBroker(i));
    if (activeOnly) brokers = brokers.filter(b => b.isActive);
    return brokers;
  }

  async getBrokerById(brokerId: string): Promise<Broker> {
    const result = await this.awsService.getDynamoDBClient().send(
      new GetCommand({
        TableName: this.configService.v2BrokersTableName,
        Key: { PK: `BROKER#${brokerId}`, SK: 'METADATA' },
      }),
    );
    if (!result.Item) throw new NotFoundException(`Broker ${brokerId} not found`);
    return this.toBroker(result.Item);
  }

  private toBroker(item: any): Broker {
    return {
      brokerId: item.brokerId,
      brokerName: item.brokerName,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
