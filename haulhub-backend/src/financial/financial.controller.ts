import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@haulhub/shared';

@Controller('financial')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  /**
   * GET /financial/outstanding-payments
   * Get outstanding payments and invoice status
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  @Get('outstanding-payments')
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  async getOutstandingPayments(@CurrentUser() user: CurrentUserData) {
    return await this.financialService.getOutstandingPayments(user.userId, user.role as UserRole);
  }
}