import { BrokersService } from './brokers.service';
import { CreateBrokerDto, UpdateBrokerDto, Broker } from '@haulhub/shared';
export declare class BrokersController {
    private readonly brokersService;
    constructor(brokersService: BrokersService);
    getAllBrokers(activeOnly?: string): Promise<Broker[]>;
    getBrokerById(id: string): Promise<Broker>;
    createBroker(createBrokerDto: CreateBrokerDto): Promise<Broker>;
    updateBroker(id: string, updateBrokerDto: UpdateBrokerDto): Promise<Broker>;
    deleteBroker(id: string): Promise<void>;
}
