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
  @Roles(UserRole.LorryOwner, UserRole.TruckOwner)
  async registerLorry(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RegisterLorryDto,
  ): Promise<Lorry> {
    return this.lorriesService.registerLorry(user.userId, dto);
  }

  /**
   * GET /lorries
   * Get all lorries for the current owner or carrier
   * Requirements: 6.4
   * 
   * - Truck owners see only their trucks (filtered by truckOwnerId)
   * - Dispatchers see all trucks in their carrier (filtered by carrierId)
   * - Carriers see all trucks in their organization (filtered by carrierId)
   */
  @Get()
  @Roles(UserRole.TruckOwner, UserRole.LorryOwner, UserRole.Dispatcher, UserRole.Carrier)
  async getLorries(@CurrentUser() user: CurrentUserData): Promise<Lorry[]> {
    // Truck owners query by their userId
    if (user.role === UserRole.TruckOwner || user.role === UserRole.LorryOwner) {
      return this.lorriesService.getLorriesByOwner(user.userId);
    }
    
    // Dispatchers and Carriers query by their carrierId
    if (user.role === UserRole.Dispatcher || user.role === UserRole.Carrier) {
      return this.lorriesService.getTrucksByCarrier(user.carrierId);
    }
    
    return [];
  }

  /**
   * GET /lorries/trailers
   * Get all trailers for the current carrier
   * Requirements: 3.2.1
   * 
   * - Dispatchers see all trailers in their carrier (filtered by carrierId)
   */
  @Get('trailers')
  @Roles(UserRole.Dispatcher, UserRole.Carrier)
  async getTrailers(@CurrentUser() user: CurrentUserData): Promise<any[]> {
    return this.lorriesService.getTrailersByCarrier(user.carrierId);
  }

  /**
   * GET /lorries/drivers
   * Get all drivers for the current carrier
   * 
   * - Dispatchers see all drivers in their carrier (filtered by carrierId)
   */
  @Get('drivers')
  @Roles(UserRole.Dispatcher, UserRole.Carrier)
  async getDrivers(@CurrentUser() user: CurrentUserData): Promise<any[]> {
    return this.lorriesService.getDriversByCarrier(user.carrierId);
  }

  /**
   * GET /lorries/:id
   * Get a specific lorry with authorization check
   * Requirements: 6.4, 19.2
   */
  @Get(':id')
  @Roles(UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Admin)
  async getLorryById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') lorryId: string,
  ): Promise<Lorry> {
    // For lorry/truck owners, verify they own the lorry
    if (user.role === UserRole.LorryOwner || user.role === UserRole.TruckOwner) {
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
  @Roles(UserRole.LorryOwner, UserRole.TruckOwner)
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
  @Roles(UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Admin)
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
  @Roles(UserRole.LorryOwner, UserRole.TruckOwner, UserRole.Admin)
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
