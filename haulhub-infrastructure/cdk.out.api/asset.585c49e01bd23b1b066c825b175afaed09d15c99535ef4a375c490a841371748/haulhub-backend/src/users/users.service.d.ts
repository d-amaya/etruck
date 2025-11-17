import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { UpdateProfileDto } from '@haulhub/shared';
import { User } from '@haulhub/shared';
export declare class UsersService {
    private readonly awsService;
    private readonly configService;
    constructor(awsService: AwsService, configService: ConfigService);
    getUserProfile(userId: string): Promise<User>;
    updateUserProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<User>;
    getUserById(userId: string): Promise<User>;
    private mapDynamoDBItemToUser;
}
