import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@haulhub/shared';
import { BadRequestException } from '@nestjs/common';

describe('UsersService — v2 Methods', () => {
  let service: UsersService;
  const mockDdbSend = jest.fn();
  const mockCreatePlaceholder = jest.fn();

  beforeEach(async () => {
    mockDdbSend.mockReset();
    mockCreatePlaceholder.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: AwsService,
          useValue: {
            getCognitoClient: () => ({ send: jest.fn() }),
            getDynamoDBClient: () => ({ send: mockDdbSend }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            v2UsersTableName: 'eTruckyUsers',
            v2TrucksTableName: 'eTruckyTrucks',
            v2TrailersTableName: 'eTruckyTrailers',
            cognitoUserPoolId: 'pool-id',
            usersTableName: 'old-table',
          },
        },
        {
          provide: AuthService,
          useValue: { createPlaceholder: mockCreatePlaceholder },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── resolveEntities ─────────────────────────────────────────

  describe('resolveEntities', () => {
    it('should return correct display info for users', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Responses: {
          eTruckyUsers: [
            { PK: 'USER#u1', name: 'Alice', role: 'DISPATCHER' },
          ],
        },
      });
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyTrucks: [] } });
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyTrailers: [] } });

      const result = await service.resolveEntities(['u1']);
      expect(result['u1']).toEqual({ name: 'Alice', type: 'dispatcher' });
    });

    it('should return correct display info for trucks', async () => {
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyUsers: [] } });
      mockDdbSend.mockResolvedValueOnce({
        Responses: {
          eTruckyTrucks: [{ PK: 'TRUCK#t1', plate: 'ABC-123', brand: 'Peterbilt' }],
        },
      });

      const result = await service.resolveEntities(['t1']);
      expect(result['t1']).toEqual({ name: 'ABC-123', type: 'truck', plate: 'ABC-123', brand: 'Peterbilt', year: undefined });
    });

    it('should return Unknown for non-existent UUIDs', async () => {
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyUsers: [] } });
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyTrucks: [] } });
      mockDdbSend.mockResolvedValueOnce({ Responses: { eTruckyTrailers: [] } });

      const result = await service.resolveEntities(['nonexistent']);
      expect(result['nonexistent']).toEqual({ name: 'Unknown', type: 'unknown' });
    });

    it('should return empty object for empty input', async () => {
      const result = await service.resolveEntities([]);
      expect(result).toEqual({});
      expect(mockDdbSend).not.toHaveBeenCalled();
    });
  });

  // ── getSubscriptions ────────────────────────────────────────

  describe('getSubscriptions', () => {
    it('should return subscription lists', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          subscribedAdminIds: ['a1', 'a2'],
          subscribedCarrierIds: ['c1'],
        },
      });

      const result = await service.getSubscriptions('user-1');
      expect(result.subscribedAdminIds).toEqual(['a1', 'a2']);
      expect(result.subscribedCarrierIds).toEqual(['c1']);
    });

    it('should return empty arrays if no subscriptions', async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: {} });

      const result = await service.getSubscriptions('user-1');
      expect(result.subscribedAdminIds).toEqual([]);
      expect(result.subscribedCarrierIds).toEqual([]);
    });
  });

  // ── updateSubscriptions ─────────────────────────────────────

  describe('updateSubscriptions', () => {
    it('should add carrier subscription', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Attributes: {
          subscribedAdminIds: new Set([]),
          subscribedCarrierIds: new Set(['c1']),
        },
      });

      const result = await service.updateSubscriptions('user-1', {
        addCarrierIds: ['c1'],
      });

      const updateInput = mockDdbSend.mock.calls[0][0].input;
      expect(updateInput.UpdateExpression).toContain('ADD');
      expect(result.subscribedCarrierIds).toContain('c1');
    });

    it('should return current subscriptions if no updates', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: { subscribedAdminIds: [], subscribedCarrierIds: [] },
      });

      const result = await service.updateSubscriptions('user-1', {});
      expect(result.subscribedAdminIds).toEqual([]);
    });
  });

  // ── createPlaceholderUser ───────────────────────────────────

  describe('createPlaceholderUser', () => {
    it('should create placeholder and auto-subscribe creator for Carrier', async () => {
      mockCreatePlaceholder.mockResolvedValueOnce('carrier-new');
      // updateSubscriptions DDB call
      mockDdbSend.mockResolvedValueOnce({
        Attributes: {
          subscribedCarrierIds: new Set(['carrier-new']),
          subscribedAdminIds: new Set([]),
        },
      });

      const result = await service.createPlaceholderUser(
        'disp-1', 'carrier@test.com', 'New Carrier', UserRole.Carrier,
      );

      expect(result.userId).toBe('carrier-new');
      expect(mockCreatePlaceholder).toHaveBeenCalledWith(
        'disp-1', 'carrier@test.com', 'New Carrier', UserRole.Carrier,
      );
      // Verify auto-subscribe was called
      expect(mockDdbSend).toHaveBeenCalled();
    });

    it('should create placeholder and auto-subscribe creator for Admin', async () => {
      mockCreatePlaceholder.mockResolvedValueOnce('admin-new');
      mockDdbSend.mockResolvedValueOnce({
        Attributes: {
          subscribedAdminIds: new Set(['admin-new']),
          subscribedCarrierIds: new Set([]),
        },
      });

      const result = await service.createPlaceholderUser(
        'disp-1', 'admin@test.com', 'New Admin', UserRole.Admin,
      );

      expect(result.userId).toBe('admin-new');
    });
  });
});
