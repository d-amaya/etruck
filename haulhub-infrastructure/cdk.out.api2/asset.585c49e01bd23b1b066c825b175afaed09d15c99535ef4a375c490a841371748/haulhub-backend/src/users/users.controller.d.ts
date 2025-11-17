import { UsersService } from './users.service';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from '@haulhub/shared';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getUserProfile(user: CurrentUserData): Promise<import("@haulhub/shared").User>;
    updateUserProfile(user: CurrentUserData, updateProfileDto: UpdateProfileDto): Promise<import("@haulhub/shared").User>;
    getUserById(userId: string, currentUser: CurrentUserData): Promise<import("@haulhub/shared").User>;
    getCurrentUser(user: CurrentUserData): Promise<{
        userId: string;
        email: string;
        role: string;
        username: string;
    }>;
}
