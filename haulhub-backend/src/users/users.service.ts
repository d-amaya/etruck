import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * User roles supported by the system
 */
export enum UserRole {
  CARRIER = 'Carrier',
  DISPATCHER = 'Dispatcher',
  DRIVER = 'Driver',
  TRUCK_OWNER = 'TruckOwner',
}

/**
 * DTO for creating a new user
 */
export interface CreateUserDto {
  // Common fields (all roles)
  role: 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ein: string;
  ss: string; // National ID / Social Security

  // Rate (required for all non-carrier roles)
  // DISPATCHER: commission % of broker payment (e.g. 4.5)
  // DRIVER: $/mile (e.g. 0.53)
  // TRUCK_OWNER: % of broker payment (e.g. 12)
  rate: number;

  // Dispatcher-specific (no extra fields beyond rate)

  // Driver-specific
  corpName?: string;
  dob?: string; // ISO date
  cdlClass?: string; // A, B, C
  cdlState?: string;
  cdlIssued?: string; // ISO date
  cdlExpires?: string; // ISO date
  fax?: string;

  // Truck Owner-specific
  company?: string;
}

/**
 * DTO for updating a user
 */
export interface UpdateUserDto {
  // Updatable fields (email, userId, carrierId, role, ein, ss are NOT updatable)
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  rate?: number;

  // Driver-specific updatable fields
  corpName?: string;
  cdlClass?: string;
  cdlState?: string;
  cdlIssued?: string;
  cdlExpires?: string;
  fax?: string;

  // Truck Owner-specific updatable fields
  company?: string;
}

/**
 * User entity stored in DynamoDB
 */
export interface User {
  // Primary keys
  PK: string; // USER#<userId>
  SK: string; // METADATA

  // GSI keys
  GSI1PK: string; // CARRIER#<carrierId>
  GSI1SK: string; // ROLE#<role>#USER#<userId>
  GSI2PK: string; // EMAIL#<email>
  GSI2SK: string; // USER#<userId>

  // Common fields (all users)
  userId: string; // UUID (from Cognito sub)
  carrierId: string; // UUID (self-reference for carriers)
  role: 'CARRIER' | 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
  name: string;
  email: string;
  ein: string; // Employer Identification Number
  ss: string; // Social Security / National ID
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  isActive: boolean;

  // Role-specific fields
  company?: string; // CARRIER only
  rate?: number; // DISPATCHER (commission %), DRIVER ($/mile), TRUCK_OWNER (% of broker payment)
  corpName?: string; // DRIVER only
  dob?: string; // DRIVER only (ISO date)
  cdlClass?: string; // DRIVER only (A, B, C)
  cdlState?: string; // DRIVER only
  cdlIssued?: string; // DRIVER only (ISO date)
  cdlExpires?: string; // DRIVER only (ISO date)
  fax?: string; // DRIVER only
}

/**
 * Service for managing users (dispatchers, drivers, truck owners) for carriers
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new user in Cognito and DynamoDB
   * @param carrierId - The carrier creating the user
   * @param dto - User creation data
   * @returns Created user and temporary password
   */
  async createUser(
    carrierId: string,
    dto: CreateUserDto,
  ): Promise<{ user: User; temporaryPassword: string }> {
    // Validate required fields based on role
    this.validateRequiredFields(dto);

    // Check email uniqueness
    const emailExists = await this.checkEmailExists(dto.email);
    if (emailExists) {
      throw new BadRequestException(`A user with email ${dto.email} already exists`);
    }

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();

    // Generate UUID for userId (will be replaced with Cognito sub)
    let userId: string;

    // Format phone to E.164 format for Cognito (remove all non-digits, add +1 if not present)
    const cleanPhone = dto.phone.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;
    
    console.log('Phone conversion:', { original: dto.phone, clean: cleanPhone, e164: e164Phone });

    try {
      // Create user in Cognito
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: dto.email,
        UserAttributes: [
          { Name: 'email', Value: dto.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: dto.name },
          { Name: 'phone_number', Value: e164Phone },
          { Name: 'custom:carrierId', Value: carrierId },
          { Name: 'custom:nationalId', Value: dto.ss },
          { Name: 'custom:role', Value: dto.role },
        ],
        TemporaryPassword: temporaryPassword,
        MessageAction: 'SUPPRESS', // Don't send welcome email
      });

      const createUserResponse = await this.awsService.getCognitoClient().send(createUserCommand);

      // Set permanent password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: dto.email,
        Password: temporaryPassword,
        Permanent: true,
      });
      await this.awsService.getCognitoClient().send(setPasswordCommand);

      // Add user to role group
      await this.addUserToGroup(dto.email, dto.role);

      // Get the actual user sub (UUID) from Cognito
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: dto.email,
      });
      const userDetails = await this.awsService.getCognitoClient().send(getUserCommand);
      userId = userDetails.UserAttributes?.find((attr) => attr.Name === 'sub')?.Value!;

      // Store user in DynamoDB
      const user = await this.storeUserInDynamoDB(userId, carrierId, dto);

      return { user, temporaryPassword };
    } catch (error: any) {
      console.error('Error creating user:', error);
      console.error('Error details:', { name: error.name, message: error.message, fault: error.$fault });
      
      // Handle Cognito-specific errors
      if (error.name === 'UsernameExistsException') {
        throw new BadRequestException(`A user with email ${dto.email} already exists`);
      }
      
      if (error.name === 'InvalidParameterException') {
        // Extract the actual error message from Cognito
        const message = error.message || error.$metadata?.message || 'Invalid user data provided';
        throw new BadRequestException(message);
      }
      
      // Pass through any error message we have
      const errorMessage = error.message || error.$metadata?.message || 'Failed to create user in authentication system';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  /**
   * Get users by carrier with optional role filter and search
   * @param carrierId - The carrier ID
   * @param role - Optional role filter
   * @param search - Optional search term for name/email
   * @returns List of users
   */
  async getUsersByCarrier(
    carrierId: string,
    role?: string,
    search?: string,
  ): Promise<User[]> {
    try {
      let queryCommand: QueryCommand;

      if (role) {
        // Query by carrier and role using GSI1
        queryCommand = new QueryCommand({
          TableName: this.configService.usersTableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :role)',
          ExpressionAttributeValues: {
            ':pk': `CARRIER#${carrierId}`,
            ':role': `ROLE#${role}#`,
          },
        });
      } else {
        // Query all users for carrier using GSI1
        queryCommand = new QueryCommand({
          TableName: this.configService.usersTableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `CARRIER#${carrierId}`,
          },
        });
      }

      const result = await this.awsService.getDynamoDBClient().send(queryCommand);
      let users = (result.Items || []) as User[];

      // Apply client-side search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(
          (user) =>
            user.name.toLowerCase().includes(searchLower) ||
            user.email.toLowerCase().includes(searchLower),
        );
      }

      return users;
    } catch (error: any) {
      console.error('Error querying users by carrier:', error);
      throw new InternalServerErrorException('Failed to retrieve users');
    }
  }

  /**
   * Get user by ID with carrier validation
   * @param userId - The user ID
   * @param carrierId - The carrier ID for validation
   * @returns User entity
   */
  async getUserById(userId: string, carrierId: string): Promise<User> {
    try {
      const getCommand = new GetCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA',
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(getCommand);

      if (!result.Item) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      const user = result.Item as User;

      // Validate carrier membership
      if (user.carrierId !== carrierId) {
        throw new ForbiddenException('You do not have permission to access this user');
      }

      return user;
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error('Error getting user by ID:', error);
      throw new InternalServerErrorException('Failed to retrieve user');
    }
  }

  /**
   * Update user details
   * @param userId - The user ID
   * @param carrierId - The carrier ID for validation
   * @param dto - Update data
   * @returns Updated user
   */
  async updateUser(userId: string, carrierId: string, dto: UpdateUserDto): Promise<User> {
    // First, get the user to validate carrier membership
    const existingUser = await this.getUserById(userId, carrierId);

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Map of allowed fields to update
    const allowedFields = [
      'name',
      'phone',
      'address',
      'city',
      'state',
      'zip',
      'rate',
      'corpName',
      'cdlClass',
      'cdlState',
      'cdlIssued',
      'cdlExpires',
      'fax',
      'company',
    ];

    // Build update expression for provided fields
    Object.keys(dto).forEach((key) => {
      if (allowedFields.includes(key) && dto[key as keyof UpdateUserDto] !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = dto[key as keyof UpdateUserDto];
      }
    });

    if (updateExpressions.length === 0) {
      // No fields to update, return existing user
      return existingUser;
    }

    try {
      const updateCommand = new UpdateCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);
      return result.Attributes as User;
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  /**
   * Deactivate user (soft delete)
   * @param userId - The user ID
   * @param carrierId - The carrier ID for validation
   * @returns Updated user
   */
  async deactivateUser(userId: string, carrierId: string): Promise<User> {
    // Validate carrier membership
    await this.getUserById(userId, carrierId);

    try {
      const updateCommand = new UpdateCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET isActive = :isActive',
        ExpressionAttributeValues: {
          ':isActive': false,
        },
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);
      return result.Attributes as User;
    } catch (error: any) {
      console.error('Error deactivating user:', error);
      throw new InternalServerErrorException('Failed to deactivate user');
    }
  }

  /**
   * Reactivate user
   * @param userId - The user ID
   * @param carrierId - The carrier ID for validation
   * @returns Updated user
   */
  async reactivateUser(userId: string, carrierId: string): Promise<User> {
    // Validate carrier membership
    await this.getUserById(userId, carrierId);

    try {
      const updateCommand = new UpdateCommand({
        TableName: this.configService.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET isActive = :isActive',
        ExpressionAttributeValues: {
          ':isActive': true,
        },
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);
      return result.Attributes as User;
    } catch (error: any) {
      console.error('Error reactivating user:', error);
      throw new InternalServerErrorException('Failed to reactivate user');
    }
  }

  /**
   * Validate required fields based on role
   */
  private validateRequiredFields(dto: CreateUserDto): void {
    // Common required fields
    const commonFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'ein', 'ss'];
    for (const field of commonFields) {
      if (!dto[field as keyof CreateUserDto]) {
        throw new BadRequestException(`${field} is required`);
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Rate is required for all roles
    if (dto.rate === undefined || dto.rate === null || isNaN(Number(dto.rate)) || Number(dto.rate) <= 0) {
      throw new BadRequestException('rate is required and must be a positive number');
    }

    // Role-specific validation
    if (dto.role === 'DRIVER') {
      const driverFields = ['cdlClass'];
      for (const field of driverFields) {
        if (!dto[field as keyof CreateUserDto]) {
          throw new BadRequestException(`${field} is required for Driver role`);
        }
      }
    } else if (dto.role === 'TRUCK_OWNER') {
      if (!dto.company) {
        throw new BadRequestException('company is required for Truck Owner role');
      }
    }
  }

  /**
   * Check if email already exists
   */
  private async checkEmailExists(email: string): Promise<boolean> {
    try {
      const queryCommand = new QueryCommand({
        TableName: this.configService.usersTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :email',
        ExpressionAttributeValues: {
          ':email': `EMAIL#${email}`,
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(queryCommand);
      return (result.Items?.length || 0) > 0;
    } catch (error: any) {
      console.error('Error checking email existence:', error);
      // If query fails, assume email doesn't exist to allow creation attempt
      return false;
    }
  }

  /**
   * Store user in DynamoDB
   */
  private async storeUserInDynamoDB(
    userId: string,
    carrierId: string,
    dto: CreateUserDto,
  ): Promise<User> {
    const user: User = {
      // Primary keys
      PK: `USER#${userId}`,
      SK: 'METADATA',

      // GSI keys
      GSI1PK: `CARRIER#${carrierId}`,
      GSI1SK: `ROLE#${dto.role}#USER#${userId}`,
      GSI2PK: `EMAIL#${dto.email}`,
      GSI2SK: `USER#${userId}`,

      // Common fields
      userId,
      carrierId,
      role: dto.role,
      name: dto.name,
      email: dto.email,
      ein: dto.ein,
      ss: dto.ss,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      phone: dto.phone,
      isActive: true, // Default to active
    };

    // Add role-specific fields
    if (dto.role === 'DISPATCHER' && dto.rate !== undefined) {
      user.rate = dto.rate;
    } else if (dto.role === 'DRIVER') {
      user.rate = dto.rate;
      user.corpName = dto.corpName;
      user.dob = dto.dob;
      user.cdlClass = dto.cdlClass;
      user.cdlState = dto.cdlState;
      user.cdlIssued = dto.cdlIssued;
      user.cdlExpires = dto.cdlExpires;
      user.fax = dto.fax;
    } else if (dto.role === 'TRUCK_OWNER') {
      user.company = dto.company;
    }

    try {
      const putCommand = new PutCommand({
        TableName: this.configService.usersTableName,
        Item: user,
      });

      await this.awsService.getDynamoDBClient().send(putCommand);
      return user;
    } catch (error: any) {
      console.error('Error storing user in DynamoDB:', error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  /**
   * Add user to Cognito group based on role
   */
  private async addUserToGroup(username: string, role: string): Promise<void> {
    try {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: this.configService.cognitoUserPoolId,
        Username: username,
        GroupName: role,
      });

      await this.awsService.getCognitoClient().send(addToGroupCommand);
    } catch (error: any) {
      // Log error but don't fail user creation - group can be added later by admin
      console.error('Error adding user to group (non-fatal):', error);
    }
  }

  /**
   * Generate a temporary password
   * Format: 8 characters with uppercase, lowercase, number, and special character
   */
  private generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    // Ensure at least one of each type
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining characters
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}
