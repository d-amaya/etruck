import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { AuthResponse, RefreshAuthResponse } from './interfaces/auth-response.interface';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(registerDto: RegisterDto): Promise<{
        message: string;
        userId: string;
    }>;
    login(loginDto: LoginDto): Promise<AuthResponse>;
    refresh(refreshTokenDto: RefreshTokenDto): Promise<RefreshAuthResponse>;
    logout(authorization?: string): Promise<{
        message: string;
    }>;
}
