import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  GlobalSignOutCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { JwtValidatorService } from './jwt-validator.service';
import { RegisterDto, LoginDto, RefreshTokenDto, AuthResponse } from '@haulhub/shared';
import { RefreshAuthResponse } from './interfaces/auth-response.interface';
import { UserRole } from '@haulhub/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
    private readonly jwtValidatorService: JwtValidatorService,
  ) {}

  /**
   * Register a new user in Cognito and create user profile in DynamoDB
   */
  async register(registerDto: RegisterDto): Promise<{ message: string; userId: string }> {
    const { email, password, fullName, phoneNumber, role, driverLicenseNumber } = registerDto;

    // Validate driver license number for Driver role
    if (role === UserRole.Driver && !driverLicenseNumber) {
      throw new BadRequestException('Driver license number is required for Driver role');
    }

    // Prevent Admin role registration via public API
    if (role === UserRole.Admin) {
      throw new BadRequestException('Admin users cannot be created through registration. Contact system administrator.');
    }

    try {
      // Create user in Cognito using AdminCreateUser for immediate group assignment
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' }, // Auto-verify email
          { Name: 'name', Value: fullName },
          { Name: 'phone_number', Value: phoneNumber },
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS', // Don't send welcome email, we'll handle password setting
      });

      const createUserResponse = await this.awsService.getCognitoClient().send(createUserCommand);
      const userId = createUserResponse.User?.Username!;

      // Set permanent password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      });
      await this.awsService.getCognitoClient().send(setPasswordCommand);

      // Add user to role group
      await this.addUserToGroup(email, role);

      // Get the actual user sub (UUID)
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: email,
      });
      const userDetails = await this.awsService.getCognitoClient().send(getUserCommand);
      const actualUserId = userDetails.UserAttributes?.find(attr => attr.Name === 'sub')?.Value!;

      // Create user profile in DynamoDB
      await this.createUserProfile(actualUserId, email, fullName, phoneNumber, role, driverLicenseNumber);

      return {
        message: 'User registered successfully. You can now log in.',
        userId: actualUserId,
      };
    } catch (error: any) {
      this.handleCognitoError(error, 'registration');
    }
  }

  /**
   * Authenticate user and return tokens
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    try {
      // Authenticate with Cognito
      const authCommand = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.configService.cognitoClientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const authResponse = await this.awsService.getCognitoClient().send(authCommand);

      if (!authResponse.AuthenticationResult) {
        throw new UnauthorizedException('Authentication failed');
      }

      const { AccessToken, RefreshToken, ExpiresIn } = authResponse.AuthenticationResult;

      // Get user details from Cognito (includes custom attributes)
      const userDetails = await this.getUserDetails(email);

      return {
        accessToken: AccessToken!,
        refreshToken: RefreshToken!,
        expiresIn: ExpiresIn!,
        userId: userDetails.userId,
        role: userDetails.role,
        email: userDetails.email,
        fullName: userDetails.fullName,
        carrierId: userDetails.carrierId,  // Include in login response for frontend
        nationalId: userDetails.nationalId,
      };
    } catch (error: any) {
      this.handleCognitoError(error, 'login');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<RefreshAuthResponse> {
    const { refreshToken } = refreshTokenDto;

    try {
      const authCommand = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: this.configService.cognitoClientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      });

      const authResponse = await this.awsService.getCognitoClient().send(authCommand);

      if (!authResponse.AuthenticationResult) {
        throw new UnauthorizedException('Token refresh failed');
      }

      const { AccessToken, ExpiresIn } = authResponse.AuthenticationResult;

      // Decode access token to get user info (in production, use a JWT library)
      // For now, we'll extract from the token payload
      const tokenPayload = this.decodeToken(AccessToken!);

      return {
        accessToken: AccessToken!,
        expiresIn: ExpiresIn!,
        userId: tokenPayload.sub,
        role: tokenPayload['custom:role'] as UserRole,
        email: tokenPayload.email,
        fullName: tokenPayload.name,
      };
    } catch (error: any) {
      this.handleCognitoError(error, 'token refresh');
    }
  }

  /**
   * Logout user by invalidating all tokens
   */
  async logout(accessToken: string): Promise<{ message: string }> {
    try {
      const signOutCommand = new GlobalSignOutCommand({
        AccessToken: accessToken,
      });

      await this.awsService.getCognitoClient().send(signOutCommand);

      return { message: 'Logged out successfully' };
    } catch (error: any) {
      this.handleCognitoError(error, 'logout');
    }
  }

  /**
   * Validate Cognito JWT token
   * Delegates to JwtValidatorService for better testability
   */
  async validateToken(token: string): Promise<any> {
    return this.jwtValidatorService.validateToken(token);
  }

  /**
   * Extract carrierId from JWT token
   * @param user - Decoded JWT token payload
   * @returns carrierId from custom:carrierId attribute
   */
  getCarrierId(user: any): string | null {
    return user['custom:carrierId'] || null;
  }

  /**
   * Extract nationalId from JWT token
   * @param user - Decoded JWT token payload
   * @returns nationalId from custom:nationalId attribute
   */
  getNationalId(user: any): string | null {
    return user['custom:nationalId'] || null;
  }

  /**
   * Extract role from JWT token
   * @param user - Decoded JWT token payload
   * @returns role from cognito:groups attribute (first group)
   */
  getRole(user: any): UserRole | null {
    const groups = user['cognito:groups'];
    if (Array.isArray(groups) && groups.length > 0) {
      return groups[0] as UserRole;
    }
    return null;
  }

  /**
   * Validate that a user belongs to a specific carrier
   * @param userId - The user's ID to validate
   * @param expectedCarrierId - The carrier ID the user should belong to
   * @returns true if user belongs to carrier, false otherwise
   * @throws InternalServerErrorException if query fails
   */
  async validateCarrierMembership(userId: string, expectedCarrierId: string): Promise<boolean> {
    try {
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA',
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(getCommand);

      if (!result.Item) {
        return false;
      }

      return result.Item.carrierId === expectedCarrierId;
    } catch (error: any) {
      console.error('Error validating carrier membership:', error);
      throw new InternalServerErrorException('Failed to validate carrier membership');
    }
  }

  /**
   * Add user to Cognito group based on role
   */
  private async addUserToGroup(username: string, role: UserRole): Promise<void> {
    try {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: username,
        GroupName: role,
      });

      await this.awsService.getCognitoClient().send(addToGroupCommand);
    } catch (error: any) {
      // Log error but don't fail registration - group can be added later by admin
      console.error('Error adding user to group (non-fatal):', error);
      // Don't throw error here, as user is already created
    }
  }

  /**
   * Create user profile in DynamoDB
   */
  private async createUserProfile(
    userId: string,
    email: string,
    fullName: string,
    phoneNumber: string,
    role: UserRole,
    driverLicenseNumber?: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const item: any = {
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
    };

    // Add driver license number if provided (for Driver role)
    if (driverLicenseNumber) {
      item.driverLicenseNumber = driverLicenseNumber;
    }

    const putCommand = new PutCommand({
      TableName: this.configService.usersTableName,
      Item: item,
    });

    try {
      await this.awsService.getDynamoDBClient().send(putCommand);
    } catch (error: any) {
      console.error('Error creating user profile in DynamoDB:', error);
      throw new InternalServerErrorException('Failed to create user profile');
    }
  }

  /**
   * Get user details from Cognito (public method for JWT guard)
   */
  async getUserDetailsByUsername(username: string): Promise<{
    userId: string;
    email: string;
    fullName: string;
    role: UserRole;
    carrierId?: string;
    nationalId?: string;
  }> {
    return this.getUserDetails(username);
  }

  /**
   * Get user details from Cognito (private implementation)
   */
  private async getUserDetails(username: string): Promise<{
    userId: string;
    email: string;
    fullName: string;
    role: UserRole;
    carrierId?: string;
    nationalId?: string;
  }> {
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: username,
      });

      const userResponse = await this.awsService.getCognitoClient().send(getUserCommand);

      const attributes = userResponse.UserAttributes || [];
      const getAttributeValue = (name: string) =>
        attributes.find((attr) => attr.Name === name)?.Value || '';

      // Get user's groups to determine role
      const listGroupsCommand = new AdminListGroupsForUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: username,
      });

      const groupsResponse = await this.awsService.getCognitoClient().send(listGroupsCommand);
      const groups = groupsResponse.Groups || [];
      
      // Get the first group as the role (users should only be in one role group)
      const role = groups.length > 0 ? (groups[0].GroupName as UserRole) : ('' as UserRole);

      let carrierId = getAttributeValue('custom:carrierId') || undefined;
      
      // Special case: For carriers, carrierId should equal userId (self-reference)
      // If it's a placeholder value, use userId instead
      if (role === UserRole.Carrier && (!carrierId || carrierId === 'TEMP' || carrierId === 'SELF')) {
        carrierId = getAttributeValue('sub');
      }

      return {
        userId: getAttributeValue('sub'),
        email: getAttributeValue('email'),
        fullName: getAttributeValue('name'),
        role,
        carrierId,
        nationalId: getAttributeValue('custom:nationalId') || undefined,
      };
    } catch (error: any) {
      console.error('Error getting user details:', error);
      throw new InternalServerErrorException('Failed to retrieve user details');
    }
  }

  /**
   * Decode JWT token (basic implementation)
   * In production, use a proper JWT library like jsonwebtoken
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Handle Cognito errors and throw appropriate NestJS exceptions
   */
  private handleCognitoError(error: any, operation: string): never {
    console.error(`Cognito error during ${operation}:`, error);

    const errorCode = error.name || error.code;
    const errorMessage = error.message || 'An error occurred';

    switch (errorCode) {
      case 'UsernameExistsException':
        throw new ConflictException('An account with this email already exists');

      case 'InvalidPasswordException':
        throw new BadRequestException('Password does not meet requirements. Must be at least 8 characters.');

      case 'InvalidParameterException':
        throw new BadRequestException(errorMessage);

      case 'NotAuthorizedException':
        throw new UnauthorizedException('Invalid email or password');

      case 'UserNotFoundException':
        throw new UnauthorizedException('Invalid email or password');

      case 'UserNotConfirmedException':
        throw new UnauthorizedException('Please verify your email before logging in');

      case 'TooManyRequestsException':
        throw new BadRequestException('Too many requests. Please try again later.');

      case 'CodeMismatchException':
        throw new BadRequestException('Invalid verification code');

      case 'ExpiredCodeException':
        throw new BadRequestException('Verification code has expired');

      default:
        throw new InternalServerErrorException(`Authentication service error: ${errorMessage}`);
    }
  }
}
