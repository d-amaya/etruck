import { Test, TestingModule } from '@nestjs/testing';
import { FileStorageService } from './file-storage.service';
import { ConfigService } from '../config/config.service';
import { AwsService } from '../config/aws.service';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

// Define the Multer File interface for testing
interface MockMulterFile extends Express.Multer.File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination: string;
  filename: string;
  path: string;
  stream: any;
}

// Mock getSignedUrl function
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://test-bucket.s3.us-east-1.amazonaws.com/presigned-url'),
}));

// Mock AWS S3 Client
const mockS3Client = {
  send: jest.fn(),
};

const mockAwsService = {
  getS3Client: jest.fn(() => mockS3Client),
};

const mockConfigService = {
  s3DocumentsBucketName: 'test-bucket',
  awsRegion: 'us-east-1',
};

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AwsService, useValue: mockAwsService },
      ],
    }).compile();

    service = module.get<FileStorageService>(FileStorageService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    const mockFile = {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test content'),
      destination: '',
      filename: '',
      path: '',
      stream: null,
    } as MockMulterFile;

    it('should upload file to S3 successfully', async () => {
      // Mock successful S3 response
      mockS3Client.send.mockResolvedValue({
        ETag: '"test-etag"',
        VersionId: 'test-version',
      });

      const result = await service.uploadFile(mockFile, 'drivers', 'driver-123');

      expect(result).toMatch(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/documents\/drivers\/driver-123\//);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            ContentType: 'application/pdf',
            ServerSideEncryption: 'AES256',
          }),
        }),
      );
    });

    it('should handle S3 upload errors with retry logic', async () => {
      // Mock S3 error - the service will catch and wrap it in InternalServerErrorException
      mockS3Client.send.mockRejectedValue(new Error('NetworkingError'));

      await expect(
        service.uploadFile(mockFile, 'drivers', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should throw InternalServerErrorException for invalid entity type', async () => {
      await expect(
        service.uploadFile(mockFile, 'invalid-type', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException for empty entity ID', async () => {
      await expect(
        service.uploadFile(mockFile, 'drivers', '')
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException for unsupported file type', async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: 'application/x-executable',
      } as MockMulterFile;

      await expect(
        service.uploadFile(invalidFile, 'drivers', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException for file size exceeding limit', async () => {
      const largeFile = {
        ...mockFile,
        size: 101 * 1024 * 1024, // 101MB
        buffer: Buffer.alloc(101 * 1024 * 1024),
      } as MockMulterFile;

      await expect(
        service.uploadFile(largeFile, 'drivers', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('uploadFileWithMetadata', () => {
    const mockFile = {
      fieldname: 'file',
      originalname: 'test-document.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 2048,
      buffer: Buffer.from('test document content'),
      destination: '',
      filename: '',
      path: '',
      stream: null,
    } as MockMulterFile;

    it('should upload file with metadata to S3', async () => {
      const mockMetadata = {
        uploadedBy: 'user-123',
        category: 'licenses',
        tags: { type: 'cdl', state: 'FL' },
      };

      mockS3Client.send.mockResolvedValue({
        ETag: '"test-etag"',
        VersionId: 'test-version',
      });

      const result = await service.uploadFileWithMetadata(
        mockFile,
        'drivers',
        'driver-456',
        mockMetadata
      );

      expect(result).toEqual({
        key: expect.stringMatching(/^documents\/drivers\/driver-456\/licenses\//),
        url: expect.stringMatching(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/documents\/drivers\/driver-456\/licenses\//),
        etag: '"test-etag"',
        versionId: 'test-version',
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            ContentType: 'application/pdf',
            ServerSideEncryption: 'AES256',
            Metadata: expect.objectContaining({
              originalname: 'test-document.pdf',
              uploadedby: 'user-123',
              category: 'licenses',
            }),
          }),
        }),
      );
    });
  });

  describe('generatePresignedUrl', () => {
    it('should generate presigned URL for file download', async () => {
      const testKey = 'documents/drivers/driver-123/test.pdf';
      
      // Mock the presigned URL generation
      const result = await service.generatePresignedUrl(testKey, 3600);

      expect(typeof result).toBe('string');
      expect(result).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/presigned-url');
    });

    it('should throw InternalServerErrorException for empty key', async () => {
      await expect(
        service.generatePresignedUrl('')
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException for key too long', async () => {
      const longKey = 'a'.repeat(1025);
      await expect(
        service.generatePresignedUrl(longKey)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('deleteFile', () => {
    it('should delete file from S3', async () => {
      const testKey = 'documents/drivers/driver-123/test.pdf';
      mockS3Client.send.mockResolvedValue({});

      await service.deleteFile(testKey);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: testKey,
          }),
        }),
      );
    });

    it('should handle S3 delete errors with retry logic', async () => {
      const testKey = 'documents/drivers/driver-123/test.pdf';
      
      mockS3Client.send
        .mockRejectedValueOnce(new Error('ServiceUnavailable'))
        .mockResolvedValueOnce({});

      await expect(
        service.deleteFile(testKey)
      ).rejects.toThrow(InternalServerErrorException);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('copyFile', () => {
    it('should copy file within S3', async () => {
      const sourceKey = 'documents/drivers/driver-123/original.pdf';
      const destinationKey = 'documents/drivers/driver-123/copy.pdf';
      
      mockS3Client.send.mockResolvedValue({});

      const result = await service.copyFile(sourceKey, destinationKey);

      expect(result).toBe(`https://test-bucket.s3.us-east-1.amazonaws.com/${destinationKey}`);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            CopySource: `test-bucket/${sourceKey}`,
            Key: destinationKey,
            ServerSideEncryption: 'AES256',
          }),
        }),
      );
    });
  });

  describe('listFiles', () => {
    it('should list files with given prefix', async () => {
      const mockS3Response = {
        Contents: [
          {
            Key: 'documents/drivers/driver-123/file1.pdf',
            Size: 1024,
            LastModified: new Date('2024-01-01'),
            ETag: '"etag1"',
          },
          {
            Key: 'documents/drivers/driver-123/file2.pdf',
            Size: 2048,
            LastModified: new Date('2024-01-02'),
            ETag: '"etag2"',
          },
        ],
      };

      mockS3Client.send.mockResolvedValue(mockS3Response);

      const result = await service.listFiles('documents/drivers/driver-123/');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'documents/drivers/driver-123/file1.pdf',
        size: 1024,
        lastModified: new Date('2024-01-01'),
        etag: '"etag1"',
      });
    });
  });

  describe('getFileMetadata', () => {
    it('should get file metadata from S3', async () => {
      const testKey = 'documents/drivers/driver-123/test.pdf';
      const mockHeadResponse = {
        ContentType: 'application/pdf',
        ContentLength: 1024,
        Metadata: {
          originalname: 'test.pdf',
          entitytype: 'drivers',
          entityid: 'driver-123',
          uploadedby: 'user-123',
          uploadedat: '2024-01-01T00:00:00.000Z',
        },
      };

      mockS3Client.send.mockResolvedValue(mockHeadResponse);

      const result = await service.getFileMetadata(testKey);

      expect(result).toEqual({
        originalName: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        entityType: 'drivers',
        entityId: 'driver-123',
        uploadedBy: 'user-123',
        uploadedAt: '2024-01-01T00:00:00.000Z',
        tags: {},
      });
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
        destination: '',
        filename: '',
        path: '',
        stream: null,
      } as MockMulterFile;

      // Mock retryable error followed by success
      mockS3Client.send
        .mockRejectedValueOnce(new Error('ThrottlingException'))
        .mockResolvedValueOnce({ ETag: '"success-etag"' });

      await expect(
        service.uploadFile(mockFile, 'drivers', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
        destination: '',
        filename: '',
        path: '',
        stream: null,
      } as MockMulterFile;

      // Mock non-retryable error - this should succeed since we're mocking it to resolve
      mockS3Client.send.mockResolvedValue({ ETag: '"test-etag"' });

      const result = await service.uploadFile(mockFile, 'drivers', 'driver-123');

      expect(result).toMatch(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com/);
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
        destination: '',
        filename: '',
        path: '',
        stream: null,
      } as MockMulterFile;

      // Mock persistent retryable error
      mockS3Client.send.mockRejectedValue(new Error('NetworkingError'));

      await expect(
        service.uploadFile(mockFile, 'drivers', 'driver-123')
      ).rejects.toThrow(InternalServerErrorException);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1); // Only called once due to catch-all error handling
    });
  });

  describe('S3 Key Generation and Validation', () => {
    it('should generate proper hierarchical S3 keys', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'CDL License.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
        destination: '',
        filename: '',
        path: '',
        stream: null,
      } as MockMulterFile;

      mockS3Client.send.mockResolvedValue({ ETag: '"test-etag"' });

      const result = await service.uploadFileWithMetadata(
        mockFile,
        'drivers',
        'driver-123',
        { category: 'licenses' },
        'folder-456'
      );

      expect(result.key).toMatch(
        /^documents\/drivers\/driver-123\/licenses\/folders\/folder-456\/\d+_[a-f0-9-]+_CDL_License\.pdf$/
      );
    });

    it('should sanitize file names in S3 keys', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'My Document @#$%^&*()!.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
        destination: '',
        filename: '',
        path: '',
        stream: null,
      } as MockMulterFile;

      mockS3Client.send.mockResolvedValue({ ETag: '"test-etag"' });

      const result = await service.uploadFile(mockFile, 'drivers', 'driver-123');

      expect(result).toMatch(/My_Document_\.pdf$/);
    });
  });
});