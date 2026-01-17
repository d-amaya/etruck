import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { GetCommand, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import {
  EnhancedDriver,
  UpdateEnhancedDriverDto,
  CDLClass,
  CDLValidation,
  BankingValidation,
  ValidateCDLDto,
  ValidateBankingDto,
  RecordAdvanceDto,
} from '@haulhub/shared';

@Injectable()
export class DriversService {
  private readonly usersTableName: string;

  constructor(
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {
    this.usersTableName = this.configService.usersTableName;
  }

  /**
   * Get enhanced driver profile from DynamoDB
   */
  async getEnhancedDriverProfile(userId: string): Promise<EnhancedDriver> {
    try {
      const getCommand = new GetCommand({
        TableName: this.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
      });

      const result = await this.awsService.getDynamoDBClient().send(getCommand);

      if (!result.Item) {
        throw new NotFoundException('Driver profile not found');
      }

      return this.mapDynamoDBItemToEnhancedDriver(result.Item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error getting enhanced driver profile:', error);
      throw new InternalServerErrorException('Failed to retrieve driver profile');
    }
  }

  /**
   * Update enhanced driver profile in DynamoDB
   */
  async updateEnhancedDriverProfile(
    userId: string,
    updateDto: UpdateEnhancedDriverDto,
  ): Promise<EnhancedDriver> {
    // Validate CDL information if provided
    if (this.hasCDLInfo(updateDto)) {
      const cdlValidation = this.validateCDLInfo({
        cdlClass: updateDto.cdlClass!,
        cdlIssued: updateDto.cdlIssued!,
        cdlExpires: updateDto.cdlExpires!,
        cdlState: updateDto.cdlState!,
      });
      
      if (!cdlValidation.isValid) {
        throw new BadRequestException(`CDL validation failed: ${cdlValidation.errors.join(', ')}`);
      }
    }

    // Validate banking information if provided
    if (updateDto.bankName && updateDto.bankAccountNumber) {
      const bankingValidation = this.validateBankingInfo({
        bankName: updateDto.bankName,
        bankAccountNumber: updateDto.bankAccountNumber,
      });
      
      if (!bankingValidation.isValid) {
        throw new BadRequestException(`Banking validation failed: ${bankingValidation.errors.join(', ')}`);
      }
    }

    // Validate EIN if provided
    if (updateDto.ein) {
      const einValidation = this.validateEIN(updateDto.ein);
      if (!einValidation.isValid) {
        throw new BadRequestException(`EIN validation failed: ${einValidation.errors.join(', ')}`);
      }
    }

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // CDL Information
    this.addUpdateExpression('cdlClass', updateDto.cdlClass, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('cdlIssued', updateDto.cdlIssued, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('cdlExpires', updateDto.cdlExpires, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('cdlState', updateDto.cdlState, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Corporate Information
    this.addUpdateExpression('corpName', updateDto.corpName, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('ein', updateDto.ein, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Personal Information (stored as plain text for now)
    this.addUpdateExpression('dob', updateDto.dob, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('ssn', updateDto.ssn, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Banking Information (stored as plain text for now)
    this.addUpdateExpression('bankName', updateDto.bankName, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('bankAccountNumber', updateDto.bankAccountNumber, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Rate Information
    this.addUpdateExpression('perMileRate', updateDto.perMileRate, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Status
    this.addUpdateExpression('isActive', updateDto.isActive, updateExpressions, expressionAttributeNames, expressionAttributeValues);
    this.addUpdateExpression('notes', updateDto.notes, updateExpressions, expressionAttributeNames, expressionAttributeValues);

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // Only updatedAt, no actual changes
      return this.getEnhancedDriverProfile(userId);
    }

    try {
      const updateCommand = new UpdateCommand({
        TableName: this.usersTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.awsService.getDynamoDBClient().send(updateCommand);

      if (!result.Attributes) {
        throw new NotFoundException('Driver profile not found');
      }

      return this.mapDynamoDBItemToEnhancedDriver(result.Attributes);
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error updating enhanced driver profile:', error);
      throw new InternalServerErrorException('Failed to update driver profile');
    }
  }

  /**
   * Get driver payment history
   */
  async getDriverPaymentHistory(userId: string, startDate?: string, endDate?: string): Promise<any[]> {
    try {
      const queryCommand = new QueryCommand({
        TableName: this.usersTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'PAYMENT#',
        },
        ScanIndexForward: false, // Most recent first
      });

      const result = await this.awsService.getDynamoDBClient().send(queryCommand);
      
      let payments = result.Items || [];

      // Filter by date range if provided
      if (startDate || endDate) {
        payments = payments.filter(payment => {
          const paymentDate = payment.paymentDate;
          if (startDate && paymentDate < startDate) return false;
          if (endDate && paymentDate > endDate) return false;
          return true;
        });
      }

      return payments.map(this.mapDynamoDBItemToPayment);
    } catch (error: any) {
      console.error('Error getting driver payment history:', error);
      throw new InternalServerErrorException('Failed to retrieve payment history');
    }
  }

  /**
   * Get driver advance tracking
   */
  async getDriverAdvances(userId: string): Promise<any[]> {
    try {
      const queryCommand = new QueryCommand({
        TableName: this.usersTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'ADVANCE#',
        },
        ScanIndexForward: false, // Most recent first
      });

      const result = await this.awsService.getDynamoDBClient().send(queryCommand);
      
      return (result.Items || []).map(this.mapDynamoDBItemToAdvance);
    } catch (error: any) {
      console.error('Error getting driver advances:', error);
      throw new InternalServerErrorException('Failed to retrieve advances');
    }
  }

  /**
   * Record a new driver advance payment
   */
  async recordDriverAdvance(userId: string, advanceDto: RecordAdvanceDto): Promise<any> {
    // Validate advance amount
    if (!advanceDto.amount || advanceDto.amount <= 0) {
      throw new BadRequestException('Advance amount must be greater than 0');
    }

    const advanceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const advanceDate = advanceDto.advanceDate || new Date().toISOString();
    const createdAt = new Date().toISOString();

    const advanceRecord = {
      PK: `USER#${userId}`,
      SK: `ADVANCE#${advanceDate}#${advanceId}`,
      advanceId,
      tripId: advanceDto.tripId || null,
      amount: advanceDto.amount,
      advanceDate,
      status: 'Active', // Active, Deducted, Cancelled
      description: advanceDto.description || 'Driver advance payment',
      createdAt,
      updatedAt: createdAt,
    };

    try {
      const putCommand = new PutCommand({
        TableName: this.usersTableName,
        Item: advanceRecord,
      });

      await this.awsService.getDynamoDBClient().send(putCommand);

      return this.mapDynamoDBItemToAdvance(advanceRecord);
    } catch (error: any) {
      console.error('Error recording driver advance:', error);
      throw new InternalServerErrorException('Failed to record advance payment');
    }
  }

  /**
   * Validate CDL information
   */
  validateCDLInfo(cdlInfo: ValidateCDLDto): CDLValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate CDL class
    if (!Object.values(CDLClass).includes(cdlInfo.cdlClass)) {
      errors.push('Invalid CDL class');
    }

    // Validate dates
    const issuedDate = new Date(cdlInfo.cdlIssued);
    const expiresDate = new Date(cdlInfo.cdlExpires);
    const now = new Date();

    if (isNaN(issuedDate.getTime())) {
      errors.push('Invalid CDL issued date');
    }

    if (isNaN(expiresDate.getTime())) {
      errors.push('Invalid CDL expiration date');
    }

    if (issuedDate >= expiresDate) {
      errors.push('CDL issued date must be before expiration date');
    }

    if (expiresDate <= now) {
      warnings.push('CDL is expired or expires soon');
    }

    // Validate state (basic US state abbreviation check)
    const validStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ];

    if (!validStates.includes(cdlInfo.cdlState.toUpperCase())) {
      errors.push('Invalid US state abbreviation');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate EIN (Employer Identification Number)
   */
  validateEIN(ein: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // EIN format: XX-XXXXXXX (9 digits total)
    const einPattern = /^\d{2}-\d{7}$/;
    if (!einPattern.test(ein)) {
      errors.push('EIN must be in format XX-XXXXXXX (e.g., 12-3456789)');
    }

    // Check for invalid prefixes
    const prefix = ein.substring(0, 2);
    const invalidPrefixes = ['00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89'];
    if (invalidPrefixes.includes(prefix)) {
      errors.push('EIN has invalid prefix');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate banking information
   */
  validateBankingInfo(bankingInfo: ValidateBankingDto): BankingValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate bank name
    if (!bankingInfo.bankName || bankingInfo.bankName.trim().length < 2) {
      errors.push('Bank name must be at least 2 characters');
    }

    // Validate account number (basic validation)
    const accountNumber = bankingInfo.bankAccountNumber.replace(/\D/g, '');
    if (accountNumber.length < 8 || accountNumber.length > 17) {
      errors.push('Account number must be between 8 and 17 digits');
    }

    // Check for obviously invalid patterns
    if (/^(\d)\1+$/.test(accountNumber)) {
      errors.push('Account number cannot be all the same digit');
    }

    if (/^(0123456789|1234567890|123456789)/.test(accountNumber)) {
      errors.push('Account number appears to be a test or invalid number');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Helper method to check if CDL info is being updated
   */
  private hasCDLInfo(updateDto: UpdateEnhancedDriverDto): boolean {
    return !!(updateDto.cdlClass && updateDto.cdlIssued && updateDto.cdlExpires && updateDto.cdlState);
  }

  /**
   * Helper method to add update expressions
   */
  private addUpdateExpression(
    field: string,
    value: any,
    updateExpressions: string[],
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, any>,
  ): void {
    if (value !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = value;
    }
  }

  /**
   * Map DynamoDB item to EnhancedDriver interface
   */
  private mapDynamoDBItemToEnhancedDriver(item: any): EnhancedDriver {
    return {
      userId: item.userId,
      email: item.email,
      fullName: item.fullName,
      phoneNumber: item.phoneNumber,
      role: item.role,
      verificationStatus: item.verificationStatus,
      driverLicenseNumber: item.driverLicenseNumber,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      // Enhanced driver fields
      cdlClass: item.cdlClass,
      cdlIssued: item.cdlIssued,
      cdlExpires: item.cdlExpires,
      cdlState: item.cdlState,
      corpName: item.corpName,
      ein: item.ein,
      dob: item.dob,
      ssn: item.ssn,
      bankName: item.bankName,
      bankAccountNumber: item.bankAccountNumber,
      perMileRate: item.perMileRate,
      isActive: item.isActive ?? true,
      notes: item.notes,
    };
  }

  /**
   * Map DynamoDB item to payment record
   */
  private mapDynamoDBItemToPayment(item: any): any {
    return {
      paymentId: item.SK.replace('PAYMENT#', ''),
      tripId: item.tripId,
      amount: item.amount,
      paymentDate: item.paymentDate,
      paymentType: item.paymentType,
      description: item.description,
      createdAt: item.createdAt,
    };
  }

  /**
   * Map DynamoDB item to advance record
   */
  private mapDynamoDBItemToAdvance(item: any): any {
    return {
      advanceId: item.SK.replace('ADVANCE#', ''),
      tripId: item.tripId,
      amount: item.amount,
      advanceDate: item.advanceDate,
      status: item.status,
      description: item.description,
      createdAt: item.createdAt,
    };
  }
}