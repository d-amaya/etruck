import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { CreateBrokerDto, UpdateBrokerDto, Broker } from '@haulhub/shared';
export declare class BrokersService {
    private readonly awsService;
    private readonly configService;
    constructor(awsService: AwsService, configService: ConfigService);
    getAllBrokers(activeOnly?: boolean): Promise<Broker[]>;
    getBrokerById(brokerId: string): Promise<Broker>;
    createBroker(createBrokerDto: CreateBrokerDto): Promise<Broker>;
    updateBroker(brokerId: string, updateBrokerDto: UpdateBrokerDto): Promise<Broker>;
    deleteBroker(brokerId: string): Promise<void>;
    seedBrokers(): Promise<void>;
    private mapDynamoDBItemToBroker;
}
