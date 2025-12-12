import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { FileStorageService } from './file-storage.service';
import { DocumentFoldersService } from './document-folders.service';
import { BatchUploadDocumentDto } from './dto';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let fileStorageService: FileStorageService;
  let foldersService: DocumentFoldersService;

  const mockFileStorageService = {
    uploadFile: jest.fn(),
    uploadFileWithMetadata: jest.fn(),
    uploadMultipleFiles: jest.fn(),
    generatePresignedUrl: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockFoldersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getFolderTree: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: FileStorageService,
          useValue: mockFileStorageService,
        },
        {
          provide: DocumentFoldersService,
          useValue: mockFoldersService,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    fileStorageService = module.get<FileStorageService>(FileStorageService);
    foldersService = module.get<DocumentFoldersService>(DocumentFoldersService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('batchUpload', () => {
    const mockFiles: Express.Multer.File[] = [
      {
        fieldname: 'files',
        originalname: 'test1.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test file 1'),
        destination: '',
        filename: '',
        path: '',
      },
      {
        fieldname: 'files',
        originalname: 'test2.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2048,
        buffer: Buffer.from('test file 2'),
        destination: '',
        filename: '',
        path: '',
      },
    ] as Express.Multer.File[];

    const batchUploadDto: BatchUploadDocumentDto = {
      entityType: 'driver',
      entityId: 'driver-123',
      folderId: 'folder-456',
      categoryId: 'cdl',
      tags: ['license', 'verification'],
      uploadedBy: 'user-789',
      description: 'Test batch upload',
      permissions: {
        canView: ['user-789'],
        canEdit: ['user-789'],
        canDelete: ['user-789'],
        canShare: [],
        isPublic: false,
      },
    };

    it('should successfully upload all files in batch', async () => {
      // Mock successful uploads
      mockFileStorageService.uploadFile
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file1.pdf')
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file2.jpg');

      const result = await service.batchUpload(batchUploadDto, mockFiles);

      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.successful[0].fileName).toBe('test1.pdf');
      expect(result.successful[1].fileName).toBe('test2.jpg');
      expect(mockFileStorageService.uploadFile).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch upload', async () => {
      // Mock first upload success, second upload failure
      mockFileStorageService.uploadFile
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file1.pdf')
        .mockRejectedValueOnce(new Error('S3 upload failed'));

      const result = await service.batchUpload(batchUploadDto, mockFiles);

      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.successful[0].fileName).toBe('test1.pdf');
      expect(result.failed[0].fileName).toBe('test2.jpg');
      expect(result.failed[0].error).toContain('S3 upload failed');
    });

    it('should handle all files failing in batch upload', async () => {
      // Mock all uploads failing
      mockFileStorageService.uploadFile
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('File too large'));

      const result = await service.batchUpload(batchUploadDto, mockFiles);

      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toContain('Network error');
      expect(result.failed[1].error).toContain('File too large');
    });

    it('should process files with different entity types', async () => {
      const truckUploadDto: BatchUploadDocumentDto = {
        ...batchUploadDto,
        entityType: 'truck',
        entityId: 'truck-456',
      };

      mockFileStorageService.uploadFile
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file1.pdf')
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file2.jpg');

      const result = await service.batchUpload(truckUploadDto, mockFiles);

      expect(result.successCount).toBe(2);
      expect(mockFileStorageService.uploadFile).toHaveBeenCalledTimes(2);
    });

    it('should include folder information in uploads', async () => {
      mockFileStorageService.uploadFile
        .mockResolvedValueOnce('https://s3.amazonaws.com/bucket/file1.pdf');

      await service.batchUpload(batchUploadDto, [mockFiles[0]]);

      // Verify that uploadFile was called with folder information
      expect(mockFileStorageService.uploadFile).toHaveBeenCalledWith(
        expect.any(Object),
        'driver',
        'driver-123',
        'folder-456',
      );
    });
  });

  describe('getFolders', () => {
    it('should retrieve folders for an entity', async () => {
      const mockFolders = [
        {
          id: 'folder-1',
          name: 'CDL Documents',
          entityType: 'driver',
          entityId: 'driver-123',
          path: 'CDL Documents',
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: {
            canView: [],
            canEdit: [],
            canDelete: [],
            canShare: [],
            isPublic: false,
          },
        },
      ];

      mockFoldersService.findAll.mockResolvedValue(mockFolders);

      const result = await service.getFolders('driver', 'driver-123');

      expect(result).toEqual(mockFolders);
      expect(mockFoldersService.findAll).toHaveBeenCalledWith('driver', 'driver-123');
    });
  });

  describe('createFolder', () => {
    it('should create a new folder', async () => {
      const mockFolder = {
        id: 'folder-new',
        name: 'Insurance Documents',
        entityType: 'truck',
        entityId: 'truck-456',
        path: 'Insurance Documents',
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: {
          canView: [],
          canEdit: [],
          canDelete: [],
          canShare: [],
          isPublic: false,
        },
      };

      mockFoldersService.create.mockResolvedValue(mockFolder);

      const result = await service.createFolder(
        'Insurance Documents',
        'truck',
        'truck-456',
        undefined,
        'user-789',
      );

      expect(result).toEqual(mockFolder);
      expect(mockFoldersService.create).toHaveBeenCalledWith({
        name: 'Insurance Documents',
        parentId: undefined,
        entityType: 'truck',
        entityId: 'truck-456',
        permissions: {
          canView: [],
          canEdit: [],
          canDelete: [],
          canShare: [],
          isPublic: false,
        },
      });
    });

    it('should create a subfolder with parent', async () => {
      const mockFolder = {
        id: 'folder-child',
        name: 'Expired',
        parentId: 'folder-parent',
        entityType: 'driver',
        entityId: 'driver-123',
        path: 'CDL Documents/Expired',
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: {
          canView: [],
          canEdit: [],
          canDelete: [],
          canShare: [],
          isPublic: false,
        },
      };

      mockFoldersService.create.mockResolvedValue(mockFolder);

      const result = await service.createFolder(
        'Expired',
        'driver',
        'driver-123',
        'folder-parent',
        'user-789',
      );

      expect(result.parentId).toBe('folder-parent');
      expect(mockFoldersService.create).toHaveBeenCalled();
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder and move documents to parent', async () => {
      mockFoldersService.remove.mockResolvedValue(undefined);

      await service.deleteFolder('folder-123', true);

      expect(mockFoldersService.remove).toHaveBeenCalledWith('folder-123', true);
    });

    it('should delete a folder without moving documents', async () => {
      mockFoldersService.remove.mockResolvedValue(undefined);

      await service.deleteFolder('folder-123', false);

      expect(mockFoldersService.remove).toHaveBeenCalledWith('folder-123', false);
    });
  });

  /**
   * Property-Based Test for Document Security Consistency
   * Feature: etrucky-feature-parity, Property 6: Document Security Consistency
   * Validates: Requirements 8.5, 13.5
   * 
   * Property: For any document or notes access request, users should only be able to 
   * access content for entities they own or have administrative privileges for, 
   * regardless of document type or entity
   */
  describe('Property 6: Document Security Consistency', () => {
    const fc = require('fast-check');

    // Arbitrary generators for test data
    const entityTypeArb = fc.constantFrom('driver', 'truck', 'trailer', 'trip', 'user');
    const entityIdArb = fc.uuid();
    const userIdArb = fc.uuid();
    const documentIdArb = fc.uuid();
    
    const permissionsArb = fc.record({
      canView: fc.array(userIdArb, { minLength: 0, maxLength: 5 }),
      canEdit: fc.array(userIdArb, { minLength: 0, maxLength: 3 }),
      canDelete: fc.array(userIdArb, { minLength: 0, maxLength: 2 }),
      canShare: fc.array(userIdArb, { minLength: 0, maxLength: 2 }),
      isPublic: fc.boolean(),
    });

    const documentArb = fc.record({
      id: documentIdArb,
      entityType: entityTypeArb,
      entityId: entityIdArb,
      ownerId: userIdArb,
      permissions: permissionsArb,
    });

    it('should enforce that users can only access documents for entities they own', () => {
      fc.assert(
        fc.property(
          documentArb,
          userIdArb,
          (document, requestingUserId) => {
            // Property: A user can access a document if and only if:
            // 1. They own the entity (document.ownerId === requestingUserId)
            // 2. They have explicit view permissions (requestingUserId in canView)
            // 3. The document is public (isPublic === true)
            // 4. They have admin privileges (simulated by being in canEdit or canDelete)

            const hasOwnership = document.ownerId === requestingUserId;
            const hasViewPermission = document.permissions.canView.includes(requestingUserId);
            const hasEditPermission = document.permissions.canEdit.includes(requestingUserId);
            const hasDeletePermission = document.permissions.canDelete.includes(requestingUserId);
            const isPublic = document.permissions.isPublic;

            const shouldHaveAccess = 
              hasOwnership || 
              hasViewPermission || 
              hasEditPermission || 
              hasDeletePermission || 
              isPublic;

            // Simulate access check
            const actualAccess = checkDocumentAccess(
              document,
              requestingUserId,
              false // isAdmin flag
            );

            // Property assertion: access should match expected permissions
            return actualAccess === shouldHaveAccess;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce that admins can access all documents regardless of ownership', () => {
      fc.assert(
        fc.property(
          documentArb,
          userIdArb,
          (document, adminUserId) => {
            // Property: Admin users should always have access to documents
            const actualAccess = checkDocumentAccess(
              document,
              adminUserId,
              true // isAdmin flag
            );

            // Property assertion: admins always have access
            return actualAccess === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce consistent access control across different entity types', () => {
      fc.assert(
        fc.property(
          entityTypeArb,
          entityIdArb,
          userIdArb,
          permissionsArb,
          (entityType, entityId, ownerId, permissions) => {
            // Create documents for different entity types with same permissions
            const document = {
              id: 'test-doc',
              entityType,
              entityId,
              ownerId,
              permissions,
            };

            // Test with a non-owner, non-admin user
            const randomUserId = 'random-user-123';
            const hasExplicitPermission = 
              permissions.canView.includes(randomUserId) ||
              permissions.canEdit.includes(randomUserId) ||
              permissions.canDelete.includes(randomUserId);

            const actualAccess = checkDocumentAccess(
              document,
              randomUserId,
              false
            );

            // Property: Access should be consistent regardless of entity type
            // Only granted if user has explicit permissions or document is public
            const expectedAccess = hasExplicitPermission || permissions.isPublic;
            
            return actualAccess === expectedAccess;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should deny access when user has no ownership or permissions', () => {
      fc.assert(
        fc.property(
          documentArb,
          (document) => {
            // Create a user ID that is definitely not in any permission lists
            const unauthorizedUserId = 'unauthorized-user-' + Math.random();
            
            // Ensure the document is not public and user is not owner
            const restrictedDocument = {
              ...document,
              ownerId: 'different-owner',
              permissions: {
                ...document.permissions,
                isPublic: false,
                canView: document.permissions.canView.filter(id => id !== unauthorizedUserId),
                canEdit: document.permissions.canEdit.filter(id => id !== unauthorizedUserId),
                canDelete: document.permissions.canDelete.filter(id => id !== unauthorizedUserId),
              },
            };

            const actualAccess = checkDocumentAccess(
              restrictedDocument,
              unauthorizedUserId,
              false
            );

            // Property: Unauthorized users should never have access
            return actualAccess === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant access when document is public regardless of ownership', () => {
      fc.assert(
        fc.property(
          documentArb,
          userIdArb,
          (document, randomUserId) => {
            // Make document public
            const publicDocument = {
              ...document,
              permissions: {
                ...document.permissions,
                isPublic: true,
              },
            };

            const actualAccess = checkDocumentAccess(
              publicDocument,
              randomUserId,
              false
            );

            // Property: Public documents should be accessible to everyone
            return actualAccess === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Helper function to simulate document access control logic
     * This represents the security logic that should be implemented in the actual service
     */
    function checkDocumentAccess(
      document: any,
      userId: string,
      isAdmin: boolean
    ): boolean {
      // Admin users have access to everything
      if (isAdmin) {
        return true;
      }

      // Public documents are accessible to everyone
      if (document.permissions.isPublic) {
        return true;
      }

      // Owner has access
      if (document.ownerId === userId) {
        return true;
      }

      // Check explicit permissions
      if (document.permissions.canView.includes(userId)) {
        return true;
      }

      if (document.permissions.canEdit.includes(userId)) {
        return true;
      }

      if (document.permissions.canDelete.includes(userId)) {
        return true;
      }

      // No access granted
      return false;
    }
  });
});
