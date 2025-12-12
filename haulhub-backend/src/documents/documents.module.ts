import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentFoldersService } from './document-folders.service';
import { FileStorageService } from './file-storage.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentFoldersService,
    FileStorageService,
  ],
  exports: [
    DocumentsService,
    DocumentFoldersService,
    FileStorageService,
  ],
})
export class DocumentsModule {}