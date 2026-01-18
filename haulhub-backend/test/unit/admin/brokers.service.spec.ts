import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { BrokersService } from '../../../src/admin/brokers.service';
import { AwsService } from '../../../src/config/aws.service';
import { ConfigService } from '../../../src/config/config.service';

describe('BrokersService', () => {
  let service: BrokersService;
  let awsService: AwsService;
  let configService: ConfigService;

  const mockDynamoDBClient = {
    send: jest.fn(),
  };

  const mockAwsService = {
    getDynamoDBClient: jest.fn(() => mockDynamoDBClient),
  };

  const mockConfigService = {
    brokersTableName: 'test-brokers-table',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokersService,
        {
          provide: AwsService,
          useValue: mockAwsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<BrokersService>(BrokersService);
    awsService = module.get<AwsService>(AwsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllBrokers', () => {
    it('should return all brokers', async () => {
      const mockBrokers = [
        {
          brokerId: 'broker-1',
          brokerName: 'Test Broker 1',
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          brokerId: 'broker-2',
          brokerName: 'Test Broker 2',
          isActive: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDynamoDBClient.send.mockResolvedValue({
        Items: mockBrokers,
      });

      const result = await service.getAllBrokers();

      expect(result).toEqual(mockBrokers);
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should filter active brokers when activeOnly is true', async () => {
      const mockBrokers = [
        {
          brokerId: 'broker-1',
          brokerName: 'Test Broker 1',
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          brokerId: 'broker-2',
          brokerName: 'Test Broker 2',
          isActive: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDynamoDBClient.send.mockResolvedValue({
        Items: mockBrokers,
      });

      const result = await service.getAllBrokers(true);

      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
    });

    it('should return empty array when no brokers exist', async () => {
      mockDynamoDBClient.send.mockResolvedValue({
        Items: [],
      });

      const result = await service.getAllBrokers();

      expect(result).toEqual([]);
    });
  });

  describe('getBrokerById', () => {
    it('should return broker by ID', async () => {
      const mockBroker = {
        brokerId: 'broker-1',
        brokerName: 'Test Broker',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBClient.send.mockResolvedValue({
        Item: mockBroker,
      });

      const result = await service.getBrokerById('broker-1');

      expect(result).toEqual(mockBroker);
    });

    it('should throw NotFoundException when broker not found', async () => {
      mockDynamoDBClient.send.mockResolvedValue({
        Item: undefined,
      });

      await expect(service.getBrokerById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createBroker', () => {
    it('should create a new broker', async () => {
      const createDto = {
        brokerName: 'New Broker',
      };

      mockDynamoDBClient.send.mockResolvedValue({});

      const result = await service.createBroker(createDto);

      expect(result.brokerName).toBe(createDto.brokerName);
      expect(result.isActive).toBe(true);
      expect(result.brokerId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('updateBroker', () => {
    it('should update broker name', async () => {
      const updateDto = {
        brokerName: 'Updated Broker',
      };

      const updatedBroker = {
        brokerId: 'broker-1',
        brokerName: 'Updated Broker',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      mockDynamoDBClient.send.mockResolvedValue({
        Attributes: updatedBroker,
      });

      const result = await service.updateBroker('broker-1', updateDto);

      expect(result.brokerName).toBe(updateDto.brokerName);
    });

    it('should throw NotFoundException when broker not found', async () => {
      const updateDto = {
        brokerName: 'Updated Broker',
      };

      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockDynamoDBClient.send.mockRejectedValue(error);

      await expect(service.updateBroker('non-existent', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteBroker', () => {
    it('should soft delete broker', async () => {
      mockDynamoDBClient.send.mockResolvedValue({});

      await service.deleteBroker('broker-1');

      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when broker not found', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockDynamoDBClient.send.mockRejectedValue(error);

      await expect(service.deleteBroker('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
