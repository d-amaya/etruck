"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
const jwt_validator_service_1 = require("./jwt-validator.service");
const shared_1 = require("@haulhub/shared");
let AuthService = class AuthService {
    constructor(awsService, configService, jwtValidatorService) {
        this.awsService = awsService;
        this.configService = configService;
        this.jwtValidatorService = jwtValidatorService;
    }
    async register(registerDto) {
        const { email, password, fullName, phoneNumber, role } = registerDto;
        if (role === shared_1.UserRole.Admin) {
            throw new common_1.BadRequestException('Admin users cannot be created through registration. Contact system administrator.');
        }
        try {
            const signUpCommand = new client_cognito_identity_provider_1.SignUpCommand({
                ClientId: this.configService.cognitoClientId,
                Username: email,
                Password: password,
                UserAttributes: [
                    { Name: 'email', Value: email },
                    { Name: 'name', Value: fullName },
                    { Name: 'phone_number', Value: phoneNumber },
                    { Name: 'custom:role', Value: role },
                ],
            });
            const signUpResponse = await this.awsService.getCognitoClient().send(signUpCommand);
            const userId = signUpResponse.UserSub;
            await this.addUserToGroup(email, role);
            await this.createUserProfile(userId, email, fullName, phoneNumber, role);
            return {
                message: 'User registered successfully. Please check your email for verification.',
                userId,
            };
        }
        catch (error) {
            this.handleCognitoError(error, 'registration');
        }
    }
    async login(loginDto) {
        const { email, password } = loginDto;
        try {
            const authCommand = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
                ClientId: this.configService.cognitoClientId,
                AuthParameters: {
                    USERNAME: email,
                    PASSWORD: password,
                },
            });
            const authResponse = await this.awsService.getCognitoClient().send(authCommand);
            if (!authResponse.AuthenticationResult) {
                throw new common_1.UnauthorizedException('Authentication failed');
            }
            const { AccessToken, RefreshToken, ExpiresIn } = authResponse.AuthenticationResult;
            const userDetails = await this.getUserDetails(email);
            return {
                accessToken: AccessToken,
                refreshToken: RefreshToken,
                expiresIn: ExpiresIn,
                userId: userDetails.userId,
                role: userDetails.role,
                email: userDetails.email,
                fullName: userDetails.fullName,
            };
        }
        catch (error) {
            this.handleCognitoError(error, 'login');
        }
    }
    async refreshToken(refreshTokenDto) {
        const { refreshToken } = refreshTokenDto;
        try {
            const authCommand = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.REFRESH_TOKEN_AUTH,
                ClientId: this.configService.cognitoClientId,
                AuthParameters: {
                    REFRESH_TOKEN: refreshToken,
                },
            });
            const authResponse = await this.awsService.getCognitoClient().send(authCommand);
            if (!authResponse.AuthenticationResult) {
                throw new common_1.UnauthorizedException('Token refresh failed');
            }
            const { AccessToken, ExpiresIn } = authResponse.AuthenticationResult;
            const tokenPayload = this.decodeToken(AccessToken);
            return {
                accessToken: AccessToken,
                expiresIn: ExpiresIn,
                userId: tokenPayload.sub,
                role: tokenPayload['custom:role'],
                email: tokenPayload.email,
                fullName: tokenPayload.name,
            };
        }
        catch (error) {
            this.handleCognitoError(error, 'token refresh');
        }
    }
    async logout(accessToken) {
        try {
            const signOutCommand = new client_cognito_identity_provider_1.GlobalSignOutCommand({
                AccessToken: accessToken,
            });
            await this.awsService.getCognitoClient().send(signOutCommand);
            return { message: 'Logged out successfully' };
        }
        catch (error) {
            this.handleCognitoError(error, 'logout');
        }
    }
    async validateToken(token) {
        return this.jwtValidatorService.validateToken(token);
    }
    async addUserToGroup(username, role) {
        try {
            const addToGroupCommand = new client_cognito_identity_provider_1.AdminAddUserToGroupCommand({
                UserPoolId: this.configService.cognitoUserPoolId,
                Username: username,
                GroupName: role,
            });
            await this.awsService.getCognitoClient().send(addToGroupCommand);
        }
        catch (error) {
            console.error('Error adding user to group:', error);
        }
    }
    async createUserProfile(userId, email, fullName, phoneNumber, role) {
        const now = new Date().toISOString();
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: this.configService.dynamodbTableName,
            Item: {
                PK: `USER#${userId}`,
                SK: 'PROFILE',
                userId,
                email,
                fullName,
                phoneNumber,
                role,
                verificationStatus: 'Pending',
                createdAt: now,
                updatedAt: now,
            },
        });
        try {
            await this.awsService.getDynamoDBClient().send(putCommand);
        }
        catch (error) {
            console.error('Error creating user profile in DynamoDB:', error);
            throw new common_1.InternalServerErrorException('Failed to create user profile');
        }
    }
    async getUserDetails(username) {
        try {
            const getUserCommand = new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: this.configService.cognitoUserPoolId,
                Username: username,
            });
            const userResponse = await this.awsService.getCognitoClient().send(getUserCommand);
            const attributes = userResponse.UserAttributes || [];
            const getAttributeValue = (name) => attributes.find((attr) => attr.Name === name)?.Value || '';
            return {
                userId: getAttributeValue('sub'),
                email: getAttributeValue('email'),
                fullName: getAttributeValue('name'),
                role: getAttributeValue('custom:role'),
            };
        }
        catch (error) {
            console.error('Error getting user details:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve user details');
        }
    }
    decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }
            const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
            return JSON.parse(payload);
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
    handleCognitoError(error, operation) {
        console.error(`Cognito error during ${operation}:`, error);
        const errorCode = error.name || error.code;
        const errorMessage = error.message || 'An error occurred';
        switch (errorCode) {
            case 'UsernameExistsException':
                throw new common_1.ConflictException('An account with this email already exists');
            case 'InvalidPasswordException':
                throw new common_1.BadRequestException('Password does not meet requirements. Must be at least 8 characters.');
            case 'InvalidParameterException':
                throw new common_1.BadRequestException(errorMessage);
            case 'NotAuthorizedException':
                throw new common_1.UnauthorizedException('Invalid email or password');
            case 'UserNotFoundException':
                throw new common_1.UnauthorizedException('Invalid email or password');
            case 'UserNotConfirmedException':
                throw new common_1.UnauthorizedException('Please verify your email before logging in');
            case 'TooManyRequestsException':
                throw new common_1.BadRequestException('Too many requests. Please try again later.');
            case 'CodeMismatchException':
                throw new common_1.BadRequestException('Invalid verification code');
            case 'ExpiredCodeException':
                throw new common_1.BadRequestException('Verification code has expired');
            default:
                throw new common_1.InternalServerErrorException(`Authentication service error: ${errorMessage}`);
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService,
        jwt_validator_service_1.JwtValidatorService])
], AuthService);
//# sourceMappingURL=auth.service.js.map