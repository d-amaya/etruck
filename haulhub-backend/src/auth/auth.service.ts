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
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
   * Register a new user — three-way check:
   * 1. Active Cognito user → "already registered"
   * 2. Placeholder (unclaimed) → claim it (set password, activate)
   * 3. New → create from scratch
   * Cases 2 and 3 return identical responses to prevent email enumeration.
   */
  async register(registerDto: RegisterDto): Promise<{ message: string; userId: string }> {
    const { email, password, fullName, phoneNumber, role, driverLicenseNumber } = registerDto;

    if (role === UserRole.Driver && !driverLicenseNumber) {
      throw new BadRequestException('Driver license number is required for Driver role');
    }

    // Three-way check
    try {
      const existingUser = await this.awsService.getCognitoClient().send(
        new AdminGetUserCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
        }),
      );

      // User exists in Cognito — check status
      if (existingUser.UserStatus === 'CONFIRMED') {
        throw new ConflictException('An account with this email already exists');
      }

      // Placeholder (FORCE_CHANGE_PASSWORD) — claim it
      const userId = existingUser.UserAttributes?.find(a => a.Name === 'sub')?.Value!;

      await this.awsService.getCognitoClient().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );

      // Update DDB: accountStatus → active, set claimedAt
      await this.awsService.getDynamoDBClient().send(new UpdateCommand({
        TableName: this.configService.v2UsersTableName,
        Key: { PK: `USER#${userId}`, SK: 'METADATA' },
        UpdateExpression: 'SET #status = :active, #claimed = :now, #name = :name, #phone = :phone, #updated = :now',
        ExpressionAttributeNames: {
          '#status': 'accountStatus', '#claimed': 'claimedAt',
          '#name': 'name', '#phone': 'phone', '#updated': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':active': 'active', ':now': new Date().toISOString(),
          ':name': fullName, ':phone': phoneNumber || '',
        },
      }));

      return { message: 'User registered successfully. You can now log in.', userId };
    } catch (error: any) {
      if (error instanceof ConflictException) throw error;

      if (error.name !== 'UserNotFoundException') {
        this.handleCognitoError(error, 'registration');
      }
    }

    // Case 3: New user — create from scratch
    try {
      const createUserResponse = await this.awsService.getCognitoClient().send(
        new AdminCreateUserCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: fullName },
            ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : []),
          ],
          TemporaryPassword: password,
          MessageAction: 'SUPPRESS',
        }),
      );

      await this.awsService.getCognitoClient().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );

      await this.addUserToGroup(email, role);

      const userDetails = await this.awsService.getCognitoClient().send(
        new AdminGetUserCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
        }),
      );
      const userId = userDetails.UserAttributes?.find(a => a.Name === 'sub')?.Value!;

      await this.createUserProfileV2(userId, email, fullName, phoneNumber || '', role, driverLicenseNumber);

      return { message: 'User registered successfully. You can now log in.', userId };
    } catch (error: any) {
      this.handleCognitoError(error, 'registration');
    }
  }

  /**
   * Create a placeholder user in Cognito + DynamoDB (no invitation email).
   * Returns the userId (Cognito sub).
   */
  async createPlaceholder(
    creatorId: string,
    email: string,
    name: string,
    role: UserRole,
  ): Promise<string> {
    // Check if email already exists
    try {
      await this.awsService.getCognitoClient().send(
        new AdminGetUserCommand({
          UserPoolId: this.configService.cognitoUserPoolId,
          Username: email,
        }),
      );
      throw new ConflictException('An account with this email already exists');
    } catch (error: any) {
      if (error instanceof ConflictException) throw error;
      if (error.name !== 'UserNotFoundException') throw error;
    }

    const tempPassword = 'Placeholder1!'; // Never sent — user sets own on claim
    const createResp = await this.awsService.getCognitoClient().send(
      new AdminCreateUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
        ],
        TemporaryPassword: tempPassword,
        MessageAction: 'SUPPRESS',
      }),
    );

    await this.addUserToGroup(email, role);

    const userDetails = await this.awsService.getCognitoClient().send(
      new AdminGetUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: email,
      }),
    );
    const userId = userDetails.UserAttributes?.find(a => a.Name === 'sub')?.Value!;

    const now = new Date().toISOString();
    const gsi1pk = role === UserRole.Carrier ? `CARRIER#${userId}` : 'NONE';
    const item: Record<string, any> = {
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: gsi1pk, GSI1SK: `ROLE#${role.toUpperCase()}#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name, role: role.toUpperCase(),
      accountStatus: 'unclaimed', isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: creatorId, lastModifiedBy: creatorId,
    };
    if (role === UserRole.Carrier) item.carrierId = userId;

    await this.awsService.getDynamoDBClient().send(new PutCommand({
      TableName: this.configService.v2UsersTableName,
      Item: item,
    }));

    return userId;
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
   * Check if user has Carrier role
   * @param user - Decoded JWT token payload
   * @returns true if user is a carrier, false otherwise
   */
  isCarrier(user: any): boolean {
    const role = this.getRole(user);
    return role === UserRole.Carrier;
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
   * Create user profile in v2 DynamoDB table
   */
  private async createUserProfileV2(
    userId: string,
    email: string,
    fullName: string,
    phoneNumber: string,
    role: UserRole,
    driverLicenseNumber?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const gsi1pk = role === UserRole.Carrier ? `CARRIER#${userId}` : 'NONE';

    const item: Record<string, any> = {
      PK: `USER#${userId}`, SK: 'METADATA',
      GSI1PK: gsi1pk, GSI1SK: `ROLE#${role.toUpperCase()}#USER#${userId}`,
      GSI2PK: `EMAIL#${email}`, GSI2SK: `USER#${userId}`,
      userId, email, name: fullName, phone: phoneNumber, role: role.toUpperCase(),
      accountStatus: 'active', isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: userId, lastModifiedBy: userId,
    };
    if (role === UserRole.Carrier) item.carrierId = userId;
    if (role === UserRole.Dispatcher) {
      item.subscribedCarrierIds = new Set<string>();
      item.subscribedAdminIds = new Set<string>();
    }
    if (driverLicenseNumber) item.driverLicenseNumber = driverLicenseNumber;

    await this.awsService.getDynamoDBClient().send(new PutCommand({
      TableName: this.configService.v2UsersTableName,
      Item: item,
    }));
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
