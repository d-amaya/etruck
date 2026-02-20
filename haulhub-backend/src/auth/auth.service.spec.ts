import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { JwtValidatorService } from './jwt-validator.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@haulhub/shared';

describe('AuthService — Claim Flow', () => {
  let service: AuthService;
  const mockCognitoSend = jest.fn();
  const mockDdbSend = jest.fn();

  beforeEach(async () => {
    mockCognitoSend.mockReset();
    mockDdbSend.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AwsService,
          useValue: {
            getCognitoClient: () => ({ send: mockCognitoSend }),
            getDynamoDBClient: () => ({ send: mockDdbSend }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            cognitoUserPoolId: 'pool-id',
            cognitoClientId: 'client-id',
            v2UsersTableName: 'eTruckyUsers',
          },
        },
        { provide: JwtValidatorService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const registerDto = {
    email: 'test@example.com',
    password: 'Test1234!',
    fullName: 'Test User',
    phoneNumber: '+15551234567',
    role: UserRole.Dispatcher,
  };

  it('should reject registration if Cognito user is CONFIRMED', async () => {
    mockCognitoSend.mockResolvedValueOnce({
      UserStatus: 'CONFIRMED',
      UserAttributes: [{ Name: 'sub', Value: 'user-123' }],
    });

    await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
  });

  it('should claim placeholder if Cognito user is FORCE_CHANGE_PASSWORD', async () => {
    // AdminGetUser returns placeholder
    mockCognitoSend.mockResolvedValueOnce({
      UserStatus: 'FORCE_CHANGE_PASSWORD',
      UserAttributes: [{ Name: 'sub', Value: 'user-123' }],
    });
    // AdminSetUserPassword
    mockCognitoSend.mockResolvedValueOnce({});
    // DDB UpdateCommand
    mockDdbSend.mockResolvedValueOnce({});

    const result = await service.register(registerDto);

    expect(result.userId).toBe('user-123');
    expect(result.message).toContain('registered successfully');
    // Verify DDB update was called to set accountStatus
    expect(mockDdbSend).toHaveBeenCalledTimes(1);
    const updateInput = mockDdbSend.mock.calls[0][0].input;
    expect(updateInput.ExpressionAttributeValues[':active']).toBe('active');
  });

  it('should create new user if Cognito user not found', async () => {
    // AdminGetUser throws UserNotFoundException
    mockCognitoSend.mockRejectedValueOnce({ name: 'UserNotFoundException' });
    // AdminCreateUser
    mockCognitoSend.mockResolvedValueOnce({ User: { Username: 'test@example.com' } });
    // AdminSetUserPassword
    mockCognitoSend.mockResolvedValueOnce({});
    // AdminAddUserToGroup
    mockCognitoSend.mockResolvedValueOnce({});
    // AdminGetUser (to get sub)
    mockCognitoSend.mockResolvedValueOnce({
      UserAttributes: [{ Name: 'sub', Value: 'new-user-456' }],
    });
    // DDB PutCommand
    mockDdbSend.mockResolvedValueOnce({});

    const result = await service.register(registerDto);

    expect(result.userId).toBe('new-user-456');
    expect(result.message).toContain('registered successfully');
  });

  it('should return identical response for placeholder claim and new user', async () => {
    // Placeholder claim
    mockCognitoSend.mockResolvedValueOnce({
      UserStatus: 'FORCE_CHANGE_PASSWORD',
      UserAttributes: [{ Name: 'sub', Value: 'placeholder-1' }],
    });
    mockCognitoSend.mockResolvedValueOnce({});
    mockDdbSend.mockResolvedValueOnce({});
    const claimResult = await service.register(registerDto);

    // Reset
    mockCognitoSend.mockReset();
    mockDdbSend.mockReset();

    // New user
    mockCognitoSend.mockRejectedValueOnce({ name: 'UserNotFoundException' });
    mockCognitoSend.mockResolvedValueOnce({ User: { Username: 'test@example.com' } });
    mockCognitoSend.mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({
      UserAttributes: [{ Name: 'sub', Value: 'new-2' }],
    });
    mockDdbSend.mockResolvedValueOnce({});
    const newResult = await service.register(registerDto);

    // Same message structure (prevents email enumeration)
    expect(claimResult.message).toBe(newResult.message);
  });

  it('should allow Admin to claim an existing placeholder', async () => {
    mockCognitoSend.mockResolvedValueOnce({
      UserStatus: 'FORCE_CHANGE_PASSWORD',
      UserAttributes: [{ Name: 'sub', Value: 'admin-placeholder' }],
    });
    mockCognitoSend.mockResolvedValueOnce({});
    mockDdbSend.mockResolvedValueOnce({});

    const result = await service.register({ ...registerDto, role: UserRole.Admin });
    expect(result.userId).toBe('admin-placeholder');
  });
});
