import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto, BulkUpdateDocumentDto, BatchUploadDocumentDto } from './dto';
import { DocumentSearchFilter } from '@haulhub/shared';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() createDocumentDto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.create(createDocumentDto, file);
  }

  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('folderId') folderId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.documentsService.findAll(entityType, entityId, folderId, categoryId);
  }

  @Get('search')
  search(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('folderId') folderId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tags') tags?: string,
    @Query('status') status?: string,
    @Query('mimeTypes') mimeTypes?: string,
    @Query('searchText') searchText?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: DocumentSearchFilter = {};
    
    if (entityType) filter.entityType = entityType as any;
    if (entityId) filter.entityId = entityId;
    if (folderId) filter.folderId = folderId;
    if (categoryId) filter.categoryId = categoryId;
    if (tags) filter.tags = tags.split(',');
    if (status) filter.status = status.split(',') as any;
    if (mimeTypes) filter.mimeTypes = mimeTypes.split(',');
    if (searchText) filter.searchText = searchText;

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.documentsService.search(filter, pageNum, limitNum);
  }

  @Get('stats')
  getStats(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.documentsService.getStats(entityType, entityId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentDto: UpdateDocumentDto) {
    return this.documentsService.update(id, updateDocumentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  @Patch(':id/permissions')
  updatePermissions(
    @Param('id') id: string,
    @Body() permissions: any,
  ) {
    return this.documentsService.updatePermissions(id, permissions);
  }

  @Patch(':id/searchable-content')
  updateSearchableContent(
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    return this.documentsService.updateSearchableContent(id, content);
  }

  @Post('bulk-update')
  bulkUpdate(
    @Body('documentIds') documentIds: string[],
    @Body('updates') updates: BulkUpdateDocumentDto,
  ) {
    if (!documentIds || documentIds.length === 0) {
      throw new BadRequestException('Document IDs are required');
    }
    return this.documentsService.bulkUpdate(documentIds, updates);
  }

  @Post('bulk-delete')
  bulkDelete(@Body('documentIds') documentIds: string[]) {
    if (!documentIds || documentIds.length === 0) {
      throw new BadRequestException('Document IDs are required');
    }
    return this.documentsService.bulkDelete(documentIds);
  }

  @Post('bulk-move')
  bulkMove(
    @Body('documentIds') documentIds: string[],
    @Body('targetFolderId') targetFolderId?: string,
  ) {
    if (!documentIds || documentIds.length === 0) {
      throw new BadRequestException('Document IDs are required');
    }
    return this.documentsService.bulkMove(documentIds, targetFolderId);
  }

  @Post('batch-upload')
  @UseInterceptors(FilesInterceptor('files', 20)) // Max 20 files per batch
  batchUpload(
    @Body() batchUploadDto: BatchUploadDocumentDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }
    if (files.length > 20) {
      throw new BadRequestException('Maximum 20 files allowed per batch upload');
    }
    return this.documentsService.batchUpload(batchUploadDto, files);
  }

  @Get('folders')
  getFolders(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    return this.documentsService.getFolders(entityType, entityId);
  }

  @Post('folders')
  createFolder(
    @Body('name') name: string,
    @Body('entityType') entityType: string,
    @Body('entityId') entityId: string,
    @Body('parentId') parentId?: string,
    @Body('createdBy') createdBy?: string,
  ) {
    if (!name || !entityType || !entityId) {
      throw new BadRequestException('name, entityType, and entityId are required');
    }
    return this.documentsService.createFolder(name, entityType, entityId, parentId, createdBy);
  }

  @Delete('folders/:id')
  deleteFolder(
    @Param('id') id: string,
    @Query('moveToParent') moveToParent?: string,
  ) {
    const shouldMoveToParent = moveToParent === 'true';
    return this.documentsService.deleteFolder(id, shouldMoveToParent);
  }
}