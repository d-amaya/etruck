import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { CreateNoteDto, EntityType } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { SearchNotesDto } from './dto/search-notes.dto';
import { Note, NoteHistory } from './interfaces/note.interface';

@Injectable()
export class NotesService {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private configService: ConfigService) {
    const client = new DynamoDBClient({
      region: this.configService.get('AWS_REGION') || 'us-east-1',
    });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = this.configService.get('DYNAMODB_TABLE_NAME') || 'eTrucky-MainTable-dev';
  }

  async createNote(
    createNoteDto: CreateNoteDto,
    userId: string,
    userName: string,
  ): Promise<Note> {
    const noteId = uuidv4();
    const timestamp = new Date().toISOString();

    const note: Note = {
      noteId,
      entityType: createNoteDto.entityType,
      entityId: createNoteDto.entityId,
      content: createNoteDto.content,
      title: createNoteDto.title,
      createdBy: userId,
      createdByName: userName,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `NOTE#${noteId}`,
          SK: 'PROFILE',
          ...note,
          GSI1PK: `ENTITY#${createNoteDto.entityType}#${createNoteDto.entityId}`,
          GSI1SK: `NOTE#${timestamp}#${noteId}`,
        },
      }),
    );

    // Store initial version in history
    await this.storeNoteHistory(note, userId, userName);

    return note;
  }

  async getNoteById(noteId: string, userId: string, userRole: string): Promise<Note> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `NOTE#${noteId}`,
          SK: 'PROFILE',
        },
      }),
    );

    if (!result.Item) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    const note = result.Item as Note;

    // Check access permissions
    await this.checkNoteAccess(note, userId, userRole);

    return note;
  }

  async getNotesByEntity(
    entityType: EntityType,
    entityId: string,
    userId: string,
    userRole: string,
  ): Promise<Note[]> {
    // Check if user has access to this entity
    await this.checkEntityAccess(entityType, entityId, userId, userRole);

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `ENTITY#${entityType}#${entityId}`,
        },
        ScanIndexForward: false, // Most recent first
      }),
    );

    return (result.Items || []) as Note[];
  }

  async updateNote(
    noteId: string,
    updateNoteDto: UpdateNoteDto,
    userId: string,
    userName: string,
    userRole: string,
  ): Promise<Note> {
    // Get existing note
    const existingNote = await this.getNoteById(noteId, userId, userRole);

    const timestamp = new Date().toISOString();
    const newVersion = existingNote.version + 1;

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updateNoteDto.content !== undefined) {
      updateExpressions.push('#content = :content');
      expressionAttributeNames['#content'] = 'content';
      expressionAttributeValues[':content'] = updateNoteDto.content;
    }

    if (updateNoteDto.title !== undefined) {
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = updateNoteDto.title;
    }

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    updateExpressions.push('#version = :version');
    expressionAttributeNames['#version'] = 'version';
    expressionAttributeValues[':version'] = newVersion;

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `NOTE#${noteId}`,
          SK: 'PROFILE',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    const updatedNote = result.Attributes as Note;

    // Store version in history
    await this.storeNoteHistory(updatedNote, userId, userName);

    return updatedNote;
  }

  async deleteNote(noteId: string, userId: string, userRole: string): Promise<void> {
    // Check access before deleting
    await this.getNoteById(noteId, userId, userRole);

    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `NOTE#${noteId}`,
          SK: 'PROFILE',
        },
      }),
    );

    // Also delete history
    await this.deleteNoteHistory(noteId);
  }

  async getNoteHistory(noteId: string, userId: string, userRole: string): Promise<NoteHistory[]> {
    // Check access to the note
    await this.getNoteById(noteId, userId, userRole);

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `NOTE#${noteId}`,
          ':sk': 'VERSION#',
        },
        ScanIndexForward: false, // Most recent first
      }),
    );

    return (result.Items || []) as NoteHistory[];
  }

  async searchNotes(
    searchDto: SearchNotesDto,
    userId: string,
    userRole: string,
  ): Promise<Note[]> {
    let notes: Note[] = [];

    if (searchDto.entityType && searchDto.entityId) {
      // Search by specific entity
      notes = await this.getNotesByEntity(
        searchDto.entityType,
        searchDto.entityId,
        userId,
        userRole,
      );
    } else if (searchDto.entityType && searchDto.entityIds) {
      // Search by multiple entities of same type
      const promises = searchDto.entityIds.map((entityId) =>
        this.getNotesByEntity(searchDto.entityType!, entityId, userId, userRole),
      );
      const results = await Promise.all(promises);
      notes = results.flat();
    } else {
      // Get all notes user has access to (based on role)
      notes = await this.getAllAccessibleNotes(userId, userRole);
    }

    // Filter by search term if provided
    if (searchDto.searchTerm) {
      const searchLower = searchDto.searchTerm.toLowerCase();
      notes = notes.filter(
        (note) =>
          note.content.toLowerCase().includes(searchLower) ||
          note.title?.toLowerCase().includes(searchLower),
      );
    }

    return notes;
  }

  private async storeNoteHistory(
    note: Note,
    userId: string,
    userName: string,
  ): Promise<void> {
    const history: NoteHistory = {
      noteId: note.noteId,
      version: note.version,
      content: note.content,
      title: note.title,
      updatedBy: userId,
      updatedByName: userName,
      updatedAt: note.updatedAt,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `NOTE#${note.noteId}`,
          SK: `VERSION#${String(note.version).padStart(10, '0')}`,
          ...history,
        },
      }),
    );
  }

  private async deleteNoteHistory(noteId: string): Promise<void> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `NOTE#${noteId}`,
          ':sk': 'VERSION#',
        },
      }),
    );

    if (result.Items && result.Items.length > 0) {
      // Delete all history items
      const deletePromises = result.Items.map((item) =>
        this.docClient.send(
          new DeleteCommand({
            TableName: this.tableName,
            Key: {
              PK: item.PK,
              SK: item.SK,
            },
          }),
        ),
      );
      await Promise.all(deletePromises);
    }
  }

  private async checkNoteAccess(note: Note, userId: string, userRole: string): Promise<void> {
    // Admin can access all notes
    if (userRole === 'admin') {
      return;
    }

    // Check if user has access to the entity this note belongs to
    await this.checkEntityAccess(note.entityType, note.entityId, userId, userRole);
  }

  private async checkEntityAccess(
    entityType: EntityType,
    entityId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    // Admin can access everything
    if (userRole === 'admin') {
      return;
    }

    // Get the entity to check ownership
    const entity = await this.getEntity(entityType, entityId);

    if (!entity) {
      throw new NotFoundException(`${entityType} with ID ${entityId} not found`);
    }

    // Check ownership based on entity type and user role
    const hasAccess = this.checkOwnership(entity, userId, userRole);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to notes for this entity');
    }
  }

  private async getEntity(entityType: EntityType, entityId: string): Promise<any> {
    let pk: string;

    switch (entityType) {
      case EntityType.DRIVER:
      case EntityType.DISPATCHER:
      case EntityType.USER:
        pk = `USER#${entityId}`;
        break;
      case EntityType.TRUCK:
        pk = `TRUCK#${entityId}`;
        break;
      case EntityType.TRAILER:
        pk = `TRAILER#${entityId}`;
        break;
      case EntityType.TRIP:
        pk = `TRIP#${entityId}`;
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: pk,
          SK: 'PROFILE',
        },
      }),
    );

    return result.Item;
  }

  private checkOwnership(entity: any, userId: string, userRole: string): boolean {
    // Dispatcher can access their own entities
    if (userRole === 'dispatcher') {
      // For trips, check if dispatcher created it
      if (entity.dispatcherId === userId) {
        return true;
      }
      // For drivers, trucks, trailers - check if dispatcher manages them
      if (entity.managedBy === userId) {
        return true;
      }
    }

    // Truck owner can access their own vehicles
    if (userRole === 'truck_owner') {
      if (entity.ownerId === userId) {
        return true;
      }
    }

    // Driver can access their own profile and assigned trips
    if (userRole === 'driver') {
      if (entity.userId === userId || entity.driverId === userId) {
        return true;
      }
    }

    // User can access their own profile
    if (entity.userId === userId) {
      return true;
    }

    return false;
  }

  private async getAllAccessibleNotes(userId: string, userRole: string): Promise<Note[]> {
    // This is a simplified implementation
    // In production, you'd want to query based on user's accessible entities
    // For now, return empty array for non-admin users
    if (userRole !== 'admin') {
      return [];
    }

    // Admin can see all notes - scan the table (not recommended for production)
    // In production, implement proper pagination and filtering
    return [];
  }
}
