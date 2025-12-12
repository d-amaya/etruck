import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto, EntityType } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { SearchNotesDto } from './dto/search-notes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async createNote(@Body() createNoteDto: CreateNoteDto, @Request() req) {
    return this.notesService.createNote(
      createNoteDto,
      req.user.userId,
      req.user.name || req.user.email,
    );
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async getNoteById(@Param('id') id: string, @Request() req) {
    return this.notesService.getNoteById(id, req.user.userId, req.user.role);
  }

  @Get('entity/:entityType/:entityId')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async getNotesByEntity(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Request() req,
  ) {
    return this.notesService.getNotesByEntity(
      entityType,
      entityId,
      req.user.userId,
      req.user.role,
    );
  }

  @Put(':id')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async updateNote(
    @Param('id') id: string,
    @Body() updateNoteDto: UpdateNoteDto,
    @Request() req,
  ) {
    return this.notesService.updateNote(
      id,
      updateNoteDto,
      req.user.userId,
      req.user.name || req.user.email,
      req.user.role,
    );
  }

  @Delete(':id')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async deleteNote(@Param('id') id: string, @Request() req) {
    await this.notesService.deleteNote(id, req.user.userId, req.user.role);
    return { message: 'Note deleted successfully' };
  }

  @Get(':id/history')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async getNoteHistory(@Param('id') id: string, @Request() req) {
    return this.notesService.getNoteHistory(id, req.user.userId, req.user.role);
  }

  @Post('search')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.LorryOwner, UserRole.Driver)
  async searchNotes(@Body() searchDto: SearchNotesDto, @Request() req) {
    return this.notesService.searchNotes(searchDto, req.user.userId, req.user.role);
  }
}
