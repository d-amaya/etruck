import { Test, TestingModule } from '@nestjs/testing';
import { BrokersController } from '../../../src/admin/brokers.controller';
import { BrokersService } from '../../../src/admin/brokers.service';

describe('BrokersController', () => {
  let controller: BrokersController;
  let service: jest.Mocked<BrokersService>;

  const mockBrokersService = {
    getAllBrokers: jest.fn(),
    getBrokerById: jest.fn(),
    createBroker: jest.fn(),
    updateBroker: jest.fn(),
    deleteBroker: jest.fn(),
  };

  const mockBroker = {
    brokerId: 'broker-123',
    brokerName: 'Test Broker',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrokersController],
      providers: [
        {
          provide: BrokersService,
          useValue: mockBrokersService,
        },
      ],
    })
      .overrideGuard(require('../../../src/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../src/auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrokersController>(BrokersController);
    service = module.get(BrokersService) as jest.Mocked<BrokersService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllBrokers', () => {
    it('should return all brokers when activeOnly is not specified', async () => {
      const brokers = [mockBroker, { ...mockBroker, brokerId: 'broker-456', isActive: false }];
      mockBrokersService.getAllBrokers.mockResolvedValue(brokers);

      const result = await controller.getAllBrokers();

      expect(result).toEqual(brokers);
      expect(service.getAllBrokers).toHaveBeenCalledWith(false);
    });

    it('should return only active brokers when activeOnly is true', async () => {
      const activeBrokers = [mockBroker];
      mockBrokersService.getAllBrokers.mockResolvedValue(activeBrokers);

      const result = await controller.getAllBrokers('true');

      expect(result).toEqual(activeBrokers);
      expect(service.getAllBrokers).toHaveBeenCalledWith(true);
    });

    it('should return all brokers when activeOnly is false', async () => {
      const brokers = [mockBroker];
      mockBrokersService.getAllBrokers.mockResolvedValue(brokers);

      const result = await controller.getAllBrokers('false');

      expect(result).toEqual(brokers);
      expect(service.getAllBrokers).toHaveBeenCalledWith(false);
    });
  });

  describe('getBrokerById', () => {
    it('should return a broker by ID', async () => {
      mockBrokersService.getBrokerById.mockResolvedValue(mockBroker);

      const result = await controller.getBrokerById('broker-123');

      expect(result).toEqual(mockBroker);
      expect(service.getBrokerById).toHaveBeenCalledWith('broker-123');
    });
  });

  describe('createBroker', () => {
    const createBrokerDto = {
      brokerName: 'New Broker',
    };

    it('should create a new broker', async () => {
      const newBroker = { ...mockBroker, brokerName: 'New Broker' };
      mockBrokersService.createBroker.mockResolvedValue(newBroker);

      const result = await controller.createBroker(createBrokerDto);

      expect(result).toEqual(newBroker);
      expect(service.createBroker).toHaveBeenCalledWith(createBrokerDto);
    });
  });

  describe('updateBroker', () => {
    const updateBrokerDto = {
      brokerName: 'Updated Broker',
      isActive: false,
    };

    it('should update a broker', async () => {
      const updatedBroker = { ...mockBroker, ...updateBrokerDto };
      mockBrokersService.updateBroker.mockResolvedValue(updatedBroker);

      const result = await controller.updateBroker('broker-123', updateBrokerDto);

      expect(result).toEqual(updatedBroker);
      expect(service.updateBroker).toHaveBeenCalledWith('broker-123', updateBrokerDto);
    });
  });

  describe('deleteBroker', () => {
    it('should delete a broker', async () => {
      mockBrokersService.deleteBroker.mockResolvedValue(undefined);

      await controller.deleteBroker('broker-123');

      expect(service.deleteBroker).toHaveBeenCalledWith('broker-123');
      expect(service.deleteBroker).toHaveBeenCalledTimes(1);
    });
  });
});
