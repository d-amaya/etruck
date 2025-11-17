import { AdminService } from './admin.service';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Lorry, VerifyLorryDto, User, VerifyUserDto } from '@haulhub/shared';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getDashboard(user: CurrentUserData): Promise<{
        message: string;
        adminUser: {
            userId: string;
            email: string;
            role: string;
        };
    }>;
    getPendingLorries(): Promise<Lorry[]>;
    verifyLorry(lorryId: string, dto: VerifyLorryDto): Promise<Lorry>;
    getPendingUsers(): Promise<User[]>;
    verifyUser(userId: string, dto: VerifyUserDto): Promise<User>;
}
