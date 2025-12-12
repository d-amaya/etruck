import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { LorriesService } from './lorries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  RegisterLorryDto,
  Lorry,
  UploadDocumentDto,
  PresignedUrlResponse,
  LorryDocumentMetadata,
} from '@haulhub/shared';

@Controller('lorries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LorriesController {
  constructor(private readonly lorriesService: LorriesService) {}

  /**
   * POST /lorries
   * Register a new lorry (Lorry Owner only)
   * Requirements: 6.1, 6.2, 6.3
   */
  @Post()
  @Roles(UserRole.LorryOwner)
  async registerLorry(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RegisterLorryDto,
  ): Promise<Lorry> {
    return this.lorriesService.registerLorry(user.userId, dto);
  }

  /**
   * GET /lorries
   * Get all lorries for the current owner
   * Requirements: 6.4
   */
  @Get()
  @Roles(UserRole.LorryOwner)
  async getLorries(@CurrentUser() user: CurrentUserData): Promise<Lorry[]> {
    return this.lorriesService.getLorriesByOwner(user.userId);
  }

  /**
   * GET /lorries/:id
   * Get a specific lorry with authorization check
   * Requirements: 6.4, 19.2
   */
  @Get(':id')
  @Roles(UserRole.LorryOwner, UserRole.Admin)
  async getLorryById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') lorryId: string,
  ): Promise<Lorry> {
    // For lorry owners, verify they own the lorry
    if (user.role === UserRole.LorryOwner) {
      const lorry = await this.lorriesService.getLorryByIdAndOwner(
        lorryId,
        user.userId,
      );

      if (!lorry) {
        throw new ForbiddenException(
          'You do not have permission to access this lorry',
        );
      }

      return lorry;
    }

    // For admin, we need to find the lorry
    // Note: This is a limitation of the current design - we need ownerId to query
    // For now, admin access will be implemented in task 13
    throw new ForbiddenException(
      'Admin access to lorries will be implemented in task 13',
    );
  }

  /**
   * POST /lorries/:id/documents
   * Generate presigned URL for document upload
   * Requirements: 6.5, 15.1, 15.2
   */
  @Post(':id/documents')
  @Roles(UserRole.LorryOwner)
  async uploadDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id') lorryId: string,
    @Body() dto: UploadDocumentDto,
  ): Promise<PresignedUrlResponse> {
    return this.lorriesService.generateUploadUrl(
      lorryId,
      user.userId,
      dto,
      user.role as UserRole,
    );
  }

  /**
   * GET /lorries/:id/documents
   * Get all documents for a lorry
   * Requirements: 15.4
   */
  @Get(':id/documents')
  @Roles(UserRole.LorryOwner, UserRole.Admin)
  async getDocuments(
    @CurrentUser() user: CurrentUserData,
    @Param('id') lorryId: string,
  ): Promise<LorryDocumentMetadata[]> {
    return this.lorriesService.getDocuments(
      lorryId,
      user.userId,
      user.role as UserRole,
    );
  }

  /**
   * GET /lorries/:id/documents/:docId
   * Generate presigned URL for document viewing
   * Requirements: 15.3, 15.4
   */
  @Get(':id/documents/:docId')
  @Roles(UserRole.LorryOwner, UserRole.Admin)
  async viewDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id') lorryId: string,
    @Param('docId') documentId: string,
  ): Promise<{ viewUrl: string }> {
    const viewUrl = await this.lorriesService.generateViewUrl(
      lorryId,
      documentId,
      user.userId,
      user.role as UserRole,
    );

    return { viewUrl };
  }
}
