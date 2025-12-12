import { EntityType } from '../dto/create-note.dto';

export interface Note {
  noteId: string;
  entityType: EntityType;
  entityId: string;
  content: string;
  title?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface NoteHistory {
  noteId: string;
  version: number;
  content: string;
  title?: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}
