import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotesService } from './notes.service';
import { EntityType } from './dto/create-note.dto';

describe('NotesService', () => {
  let service: NotesService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockDynamoDBClient: any;

  beforeEach(async () => {
    mockDynamoDBClient = {
      send: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'AWS_REGION') return 'us-east-1';
        if (key === 'DYNAMODB_TABLE_NAME') return 'test-table';
        return null;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
    // Replace the docClient with our mock
    (service as any).docClient = mockDynamoDBClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      const createNoteDto = {
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'This is a test note',
        title: 'Test Note',
      };

      mockDynamoDBClient.send.mockResolvedValue({});

      const result = await service.createNote(
        createNoteDto,
        'user-123',
        'John Doe',
      );

      expect(result).toMatchObject({
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'This is a test note',
        title: 'Test Note',
        createdBy: 'user-123',
        createdByName: 'John Doe',
        version: 1,
      });
      expect(result.noteId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(2); // Note + history
    });

    it('should create a note without title', async () => {
      const createNoteDto = {
        entityType: EntityType.DRIVER,
        entityId: 'driver-123',
        content: 'Driver note content',
      };

      mockDynamoDBClient.send.mockResolvedValue({});

      const result = await service.createNote(
        createNoteDto,
        'user-123',
        'John Doe',
      );

      expect(result.title).toBeUndefined();
      expect(result.content).toBe('Driver note content');
    });
  });

  describe('getNoteById', () => {
    it('should return a note when found and user has access', async () => {
      const mockNote = {
        noteId: 'note-123',
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'Test content',
        createdBy: 'user-123',
        createdByName: 'John Doe',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        version: 1,
      };

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockNote }) // Get note
        .mockResolvedValueOnce({ Item: mockEntity }); // Get entity for access check

      const result = await service.getNoteById('note-123', 'user-123', 'dispatcher');

      expect(result).toEqual(mockNote);
    });

    it('should throw NotFoundException when note not found', async () => {
      mockDynamoDBClient.send.mockResolvedValue({ Item: null });

      await expect(
        service.getNoteById('nonexistent', 'user-123', 'dispatcher'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getNotesByEntity', () => {
    it('should return all notes for an entity', async () => {
      const mockNotes = [
        {
          noteId: 'note-1',
          entityType: EntityType.TRUCK,
          entityId: 'truck-123',
          content: 'Note 1',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          noteId: 'note-2',
          entityType: EntityType.TRUCK,
          entityId: 'truck-123',
          content: 'Note 2',
          createdAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockEntity = {
        truckId: 'truck-123',
        ownerId: 'user-123',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockEntity }) // Access check
        .mockResolvedValueOnce({ Items: mockNotes }); // Query notes

      const result = await service.getNotesByEntity(
        EntityType.TRUCK,
        'truck-123',
        'user-123',
        'truck_owner',
      );

      expect(result).toEqual(mockNotes);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no notes exist', async () => {
      const mockEntity = {
        truckId: 'truck-123',
        ownerId: 'user-123',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockEntity })
        .mockResolvedValueOnce({ Items: [] });

      const result = await service.getNotesByEntity(
        EntityType.TRUCK,
        'truck-123',
        'user-123',
        'truck_owner',
      );

      expect(result).toEqual([]);
    });
  });

  describe('updateNote', () => {
    it('should update note content and increment version', async () => {
      const existingNote = {
        noteId: 'note-123',
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'Old content',
        createdBy: 'user-123',
        createdByName: 'John Doe',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        version: 1,
      };

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      const updatedNote = {
        ...existingNote,
        content: 'New content',
        version: 2,
        updatedAt: expect.any(String),
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: existingNote }) // Get existing note
        .mockResolvedValueOnce({ Item: mockEntity }) // Access check
        .mockResolvedValueOnce({ Attributes: updatedNote }) // Update
        .mockResolvedValueOnce({}); // Store history

      const result = await service.updateNote(
        'note-123',
        { content: 'New content' },
        'user-123',
        'John Doe',
        'dispatcher',
      );

      expect(result.content).toBe('New content');
      expect(result.version).toBe(2);
    });
  });

  describe('deleteNote', () => {
    it('should delete note and its history', async () => {
      const mockNote = {
        noteId: 'note-123',
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'Test content',
        createdBy: 'user-123',
        version: 1,
      };

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      const mockHistory = [
        { PK: 'NOTE#note-123', SK: 'VERSION#0000000001' },
      ];

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockNote }) // Get note
        .mockResolvedValueOnce({ Item: mockEntity }) // Access check
        .mockResolvedValueOnce({}) // Delete note
        .mockResolvedValueOnce({ Items: mockHistory }) // Query history
        .mockResolvedValueOnce({}); // Delete history

      await service.deleteNote('note-123', 'user-123', 'dispatcher');

      expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(5);
    });
  });

  describe('searchNotes', () => {
    it('should search notes by content', async () => {
      const mockNotes = [
        {
          noteId: 'note-1',
          content: 'This contains the search term',
          title: 'Note 1',
        },
        {
          noteId: 'note-2',
          content: 'This also has the search term',
          title: 'Note 2',
        },
        {
          noteId: 'note-3',
          content: 'This does not match',
          title: 'Note 3',
        },
      ];

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockEntity })
        .mockResolvedValueOnce({ Items: mockNotes });

      const result = await service.searchNotes(
        {
          entityType: EntityType.TRIP,
          entityId: 'trip-123',
          searchTerm: 'search term',
        },
        'user-123',
        'dispatcher',
      );

      expect(result).toHaveLength(2);
      expect(result.every((note) => note.content.includes('search term'))).toBe(true);
    });

    it('should search notes by title', async () => {
      const mockNotes = [
        {
          noteId: 'note-1',
          content: 'Content 1',
          title: 'Important Note',
        },
        {
          noteId: 'note-2',
          content: 'Content 2',
          title: 'Regular Note',
        },
      ];

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockEntity })
        .mockResolvedValueOnce({ Items: mockNotes });

      const result = await service.searchNotes(
        {
          entityType: EntityType.TRIP,
          entityId: 'trip-123',
          searchTerm: 'important',
        },
        'user-123',
        'dispatcher',
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Important Note');
    });
  });

  describe('getNoteHistory', () => {
    it('should return note version history', async () => {
      const mockNote = {
        noteId: 'note-123',
        entityType: EntityType.TRIP,
        entityId: 'trip-123',
        content: 'Current content',
        createdBy: 'user-123',
        version: 3,
      };

      const mockEntity = {
        tripId: 'trip-123',
        dispatcherId: 'user-123',
      };

      const mockHistory = [
        {
          noteId: 'note-123',
          version: 3,
          content: 'Version 3 content',
          updatedAt: '2024-01-03T00:00:00Z',
        },
        {
          noteId: 'note-123',
          version: 2,
          content: 'Version 2 content',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        {
          noteId: 'note-123',
          version: 1,
          content: 'Version 1 content',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: mockNote }) // Get note
        .mockResolvedValueOnce({ Item: mockEntity }) // Access check
        .mockResolvedValueOnce({ Items: mockHistory }); // Query history

      const result = await service.getNoteHistory('note-123', 'user-123', 'dispatcher');

      expect(result).toEqual(mockHistory);
      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(3); // Most recent first
    });
  });
});
