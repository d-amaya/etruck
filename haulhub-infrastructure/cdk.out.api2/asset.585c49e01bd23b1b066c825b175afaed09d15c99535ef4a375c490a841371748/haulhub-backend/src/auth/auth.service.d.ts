import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { JwtValidatorService } from './jwt-validator.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { AuthResponse, RefreshAuthResponse } from './interfaces/auth-response.interface';
export declare class AuthService {
    private readonly awsService;
    private readonly configService;
    private readonly jwtValidatorService;
    constructor(awsService: AwsService, configService: ConfigService, jwtValidatorService: JwtValidatorService);
    register(registerDto: RegisterDto): Promise<{
        message: string;
        userId: string;
    }>;
    login(loginDto: LoginDto): Promise<AuthResponse>;
    refreshToken(refreshTokenDto: RefreshTokenDto): Promise<RefreshAuthResponse>;
    logout(accessToken: string): Promise<{
        message: string;
    }>;
    validateToken(token: string): Promise<any>;
    private addUserToGroup;
    private createUserProfile;
    private getUserDetails;
    private decodeToken;
    private handleCognitoError;
}
