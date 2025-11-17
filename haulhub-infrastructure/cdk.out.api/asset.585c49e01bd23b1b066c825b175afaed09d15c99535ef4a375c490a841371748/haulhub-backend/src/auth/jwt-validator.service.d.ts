import { ConfigService } from '../config/config.service';
export declare class JwtValidatorService {
    private readonly configService;
    private jwksClient;
    constructor(configService: ConfigService);
    private initializeJwksClient;
    validateToken(token: string): Promise<any>;
    private getSigningKey;
}
