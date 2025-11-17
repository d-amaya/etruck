import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { Lorry, VerifyLorryDto, User, VerifyUserDto } from '@haulhub/shared';
export declare class AdminService {
    private readonly awsService;
    private readonly configService;
    private readonly tableName;
    constructor(awsService: AwsService, configService: ConfigService);
    getPendingLorries(): Promise<Lorry[]>;
    verifyLorry(lorryId: string, dto: VerifyLorryDto): Promise<Lorry>;
    private mapItemToLorry;
    getPendingUsers(): Promise<User[]>;
    verifyUser(userId: string, dto: VerifyUserDto): Promise<User>;
    private mapItemToUser;
}
