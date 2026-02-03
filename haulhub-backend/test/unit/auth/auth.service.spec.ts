import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../../../src/auth/auth.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';
import { UserRole } from '@haulhub/shared';

describe('AuthService', () => {
  let service: AuthService;
  let awsService: jest.Mocked<AwsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockCognitoClient = {
    send: jest.fn(),
  };

  const mockDynamoDBClient = {
    send: jest.fn(),
  };

  const mockJwtValidatorService = {
    validateToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AwsService,
          useValue: {
            getCognitoClient: jest.fn(() => mockCognitoClient),
            getDynamoDBClient: jest.fn(() => mockDynamoDBClient),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            awsRegion: 'us-east-1',
            cognitoUserPoolId: 'us-east-1_test',
            cognitoClientId: 'test-client-id',
            usersTableName: 'eTrucky-Users',
          },
        },
        {
          provide: require('../../../src/auth/jwt-validator.service').JwtValidatorService,
          useValue: mockJwtValidatorService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    awsService = module.get(AwsService) as jest.Mocked<AwsService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockCognitoClient.send.mockReset();
    mockDynamoDBClient.send.mockReset();
    mockJwtValidatorService.validateToken.mockReset();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher,
    };

    it('should register a user successfully', async () => {
      mockCognitoClient.send
        .mockResolvedValueOnce({ 
          User: { Username: 'test@example.com' }
        }) // AdminCreateUserCommand
        .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand
        .mockResolvedValueOnce({}) // AdminAddUserToGroupCommand
        .mockResolvedValueOnce({
          UserAttributes: [
            { Name: 'sub', Value: 'user-123' },
            { Name: 'email', Value: 'test@example.com' },
          ]
        }); // AdminGetUserCommand

      mockDynamoDBClient.send.mockResolvedValueOnce({});

      const result = await service.register(registerDto);

      expect(result).toEqual({
        message: 'User registered successfully. You can now log in.',
        userId: 'user-123',
      });
      expect(mockCognitoClient.send).toHaveBeenCalledTimes(4);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException when email already exists', async () => {
      const error = new Error('User already exists');
      error.name = 'UsernameExistsException';
      // SignUpCommand fails with UsernameExistsException
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockCognitoClient.send).toHaveBeenCalledTimes(1); // Only SignUpCommand called
    });

    it('should throw BadRequestException for invalid password', async () => {
      const error = new Error('Password does not meet requirements');
      error.name = 'InvalidPasswordException';
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully and return tokens', async () => {
      mockCognitoClient.send
        .mockResolvedValueOnce({
          AuthenticationResult: {
            AccessToken: 'access-token',
            RefreshToken: 'refresh-token',
            ExpiresIn: 3600,
          },
        }) // InitiateAuthCommand
        .mockResolvedValueOnce({
          UserAttributes: [
            { Name: 'sub', Value: 'user-123' },
            { Name: 'email', Value: 'test@example.com' },
            { Name: 'name', Value: 'Test User' },
          ],
        }) // AdminGetUserCommand
        .mockResolvedValueOnce({
          Groups: [{ GroupName: UserRole.Dispatcher }],
        }); // AdminListGroupsForUserCommand

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User',
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const error = new Error('Incorrect username or password');
      error.name = 'NotAuthorizedException';
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for unconfirmed user', async () => {
      const error = new Error('User is not confirmed');
      error.name = 'UserNotConfirmedException';
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should refresh access token successfully', async () => {
      const mockAccessToken = Buffer.from(
        JSON.stringify({
          header: { alg: 'RS256', kid: 'test-kid' },
          payload: {
            sub: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            'custom:role': UserRole.Dispatcher,
          },
        }),
      ).toString('base64');

      // Create a proper JWT-like token (header.payload.signature)
      const jwtToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
        JSON.stringify({
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          'custom:role': UserRole.Dispatcher,
        }),
      ).toString('base64')}.signature`;

      mockCognitoClient.send.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: jwtToken,
          ExpiresIn: 3600,
        },
      });

      const result = await service.refreshToken(refreshTokenDto);

      expect(result).toMatchObject({
        accessToken: jwtToken,
        expiresIn: 3600,
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const error = new Error('Invalid refresh token');
      error.name = 'NotAuthorizedException';
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.refreshToken(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockCognitoClient.send.mockResolvedValueOnce({});

      const result = await service.logout('access-token');

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(mockCognitoClient.send).toHaveBeenCalledTimes(1);
    });

    it('should handle logout errors', async () => {
      const error = new Error('Token is invalid');
      error.name = 'NotAuthorizedException';
      mockCognitoClient.send.mockRejectedValueOnce(error);

      await expect(service.logout('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getCarrierId', () => {
    it('should extract carrierId from JWT token payload', () => {
      const user = {
        'custom:carrierId': 'carrier-123',
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getCarrierId(user);

      expect(result).toBe('carrier-123');
    });

    it('should return null when carrierId is not present', () => {
      const user = {
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getCarrierId(user);

      expect(result).toBeNull();
    });
  });

  describe('getNationalId', () => {
    it('should extract nationalId from JWT token payload', () => {
      const user = {
        'custom:nationalId': 'DL123456',
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getNationalId(user);

      expect(result).toBe('DL123456');
    });

    it('should return null when nationalId is not present', () => {
      const user = {
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getNationalId(user);

      expect(result).toBeNull();
    });
  });

  describe('getRole', () => {
    it('should extract role from cognito:groups', () => {
      const user = {
        'cognito:groups': [UserRole.Dispatcher, UserRole.Driver],
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getRole(user);

      expect(result).toBe(UserRole.Dispatcher);
    });

    it('should return null when cognito:groups is not present', () => {
      const user = {
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getRole(user);

      expect(result).toBeNull();
    });

    it('should return null when cognito:groups is empty', () => {
      const user = {
        'cognito:groups': [],
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getRole(user);

      expect(result).toBeNull();
    });

    it('should return null when cognito:groups is not an array', () => {
      const user = {
        'cognito:groups': 'Dispatcher',
        sub: 'user-123',
        email: 'test@example.com',
      };

      const result = service.getRole(user);

      expect(result).toBeNull();
    });
  });

  describe('validateCarrierMembership', () => {
    it('should return true when user belongs to the carrier', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'METADATA',
          userId: 'user-123',
          carrierId: 'carrier-123',
          role: UserRole.Dispatcher,
        },
      });

      const result = await service.validateCarrierMembership('user-123', 'carrier-123');

      expect(result).toBe(true);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should return false when user belongs to a different carrier', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'METADATA',
          userId: 'user-123',
          carrierId: 'carrier-456',
          role: UserRole.Dispatcher,
        },
      });

      const result = await service.validateCarrierMembership('user-123', 'carrier-123');

      expect(result).toBe(false);
    });

    it('should return false when user is not found', async () => {
      mockDynamoDBClient.send.mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await service.validateCarrierMembership('user-123', 'carrier-123');

      expect(result).toBe(false);
    });

    it('should throw InternalServerErrorException on DynamoDB error', async () => {
      mockDynamoDBClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(
        service.validateCarrierMembership('user-123', 'carrier-123')
      ).rejects.toThrow('Failed to validate carrier membership');
    });
  });
});
