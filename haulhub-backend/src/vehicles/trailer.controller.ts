import { 
  Controller, 
  Post, 
  Get, 
  Patch, 
  Param, 
  Body, 
  Query, 
  UseGuards,
  Request
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TrailerService } from './trailer.service';
import { 
  RegisterTrailerDto, 
  UpdateTrailerDto, 
  VerifyTrailerDto, 
  UpdateTrailerStatusDto,
  Trailer 
} from '@haulhub/shared';

@Controller('trailers')
@UseGuards(JwtAuthGuard)
export class TrailerController {
  constructor(private readonly trailerService: TrailerService) {}

  @Post()
  async registerTrailer(
    @Request() req: any,
    @Body() registerTrailerDto: RegisterTrailerDto,
  ): Promise<Trailer> {
    return this.trailerService.registerTrailer(req.user.userId, registerTrailerDto);
  }

  @Get()
  async getTrailers(
    @Request() req: any,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<Trailer[]> {
    const isActiveOnly = activeOnly === 'true';
    return this.trailerService.getTrailersByOwner(req.user.userId, isActiveOnly);
  }

  @Get(':id')
  async getTrailer(@Param('id') trailerId: string): Promise<Trailer> {
    return this.trailerService.getTrailer(trailerId);
  }

  @Patch(':id')
  async updateTrailer(
    @Param('id') trailerId: string,
    @Body() updateTrailerDto: UpdateTrailerDto,
  ): Promise<Trailer> {
    return this.trailerService.updateTrailer(trailerId, updateTrailerDto);
  }

  @Patch(':id/status')
  async updateTrailerStatus(
    @Param('id') trailerId: string,
    @Body() updateStatusDto: UpdateTrailerStatusDto,
  ): Promise<Trailer> {
    return this.trailerService.updateTrailerStatus(trailerId, updateStatusDto);
  }

  @Patch(':id/verify')
  async verifyTrailer(
    @Param('id') trailerId: string,
    @Body() verifyTrailerDto: VerifyTrailerDto,
  ): Promise<Trailer> {
    return this.trailerService.verifyTrailer(trailerId, verifyTrailerDto);
  }
}