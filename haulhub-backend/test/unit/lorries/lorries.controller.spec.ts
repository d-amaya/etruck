import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { LorriesController } from '../../../src/lorries/lorries.controller';
import { LorriesService } from '../../../src/lorries/lorries.service';
import { UserRole, LorryVerificationStatus } from '@haulhub/shared';
import { CurrentUserData } from '../../../src/auth/decorators/current-user.decorator';

describe('LorriesController', () => {
  let controller: LorriesController;
  let service: jest.Mocked<LorriesService>;

  const mockLorriesService = {
    registerLorry: jest.fn(),
    getLorriesByOwner: jest.fn(),
    getLorryByIdAndOwner: jest.fn(),
    generateUploadUrl: jest.fn(),
    getDocuments: jest.fn(),
    generateViewUrl: jest.fn(),
  };

  const mockLorry = {
    lorryId: 'ABC-1234',
    ownerId: 'owner-123',
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2020,
    verificationStatus: LorryVerificationStatus.Pending,
    verificationDocuments: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockOwnerUser: CurrentUserData = {
    userId: 'owner-123',
    email: 'owner@example.com',
    role: UserRole.LorryOwner,
    username: 'owner',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LorriesController],
      providers: [
        {
          provide: LorriesService,
          useValue: mockLorriesService,
        },
      ],
    })
      .overrideGuard(require('../../../src/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../src/auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LorriesController>(LorriesController);
    service = module.get(LorriesService) as jest.Mocked<LorriesService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerLorry', () => {
    const registerDto = {
      lorryId: 'ABC-1234',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2020,
    };

    it('should register a lorry', async () => {
      mockLorriesService.registerLorry.mockResolvedValue(mockLorry);

      const result = await controller.registerLorry(mockOwnerUser, registerDto);

      expect(result).toEqual(mockLorry);
      expect(service.registerLorry).toHaveBeenCalledWith('owner-123', registerDto);
    });
  });

  describe('getLorries', () => {
    it('should get all lorries for current owner', async () => {
      mockLorriesService.getLorriesByOwner.mockResolvedValue([mockLorry]);

      const result = await controller.getLorries(mockOwnerUser);

      expect(result).toEqual([mockLorry]);
      expect(service.getLorriesByOwner).toHaveBeenCalledWith('owner-123');
    });
  });

  describe('getLorryById', () => {
    it('should get lorry by ID for owner', async () => {
      mockLorriesService.getLorryByIdAndOwner.mockResolvedValue(mockLorry);

      const result = await controller.getLorryById(mockOwnerUser, 'ABC-1234');

      expect(result).toEqual(mockLorry);
      expect(service.getLorryByIdAndOwner).toHaveBeenCalledWith('ABC-1234', 'owner-123');
    });

    it('should throw ForbiddenException when owner does not own lorry', async () => {
      mockLorriesService.getLorryByIdAndOwner.mockResolvedValue(null);

      await expect(controller.getLorryById(mockOwnerUser, 'ABC-1234')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('uploadDocument', () => {
    const uploadDto = {
      fileName: 'registration.pdf',
      fileSize: 1024000,
      contentType: 'application/pdf',
    };

    it('should generate presigned URL for document upload', async () => {
      const presignedResponse = {
        uploadUrl: 'https://s3.amazonaws.com/...',
        documentId: 'doc-123',
        expiresIn: 900,
      };

      mockLorriesService.generateUploadUrl.mockResolvedValue(presignedResponse);

      const result = await controller.uploadDocument(mockOwnerUser, 'ABC-1234', uploadDto);

      expect(result).toEqual(presignedResponse);
      expect(service.generateUploadUrl).toHaveBeenCalledWith(
        'ABC-1234',
        'owner-123',
        uploadDto,
        UserRole.LorryOwner,
      );
    });
  });

  describe('getDocuments', () => {
    it('should get all documents for a lorry', async () => {
      const documents = [
        {
          documentId: 'doc-123',
          fileName: 'registration.pdf',
          fileSize: 1024000,
          contentType: 'application/pdf',
          uploadedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockLorriesService.getDocuments.mockResolvedValue(documents);

      const result = await controller.getDocuments(mockOwnerUser, 'ABC-1234');

      expect(result).toEqual(documents);
      expect(service.getDocuments).toHaveBeenCalledWith(
        'ABC-1234',
        'owner-123',
        UserRole.LorryOwner,
      );
    });
  });

  describe('viewDocument', () => {
    it('should generate presigned URL for viewing document', async () => {
      const viewUrl = 'https://s3.amazonaws.com/view-url';
      mockLorriesService.generateViewUrl.mockResolvedValue(viewUrl);

      const result = await controller.viewDocument(mockOwnerUser, 'ABC-1234', 'doc-123');

      expect(result).toEqual({ viewUrl });
      expect(service.generateViewUrl).toHaveBeenCalledWith(
        'ABC-1234',
        'doc-123',
        'owner-123',
        UserRole.LorryOwner,
      );
    });
  });
});
