import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { UserRole } from '@haulhub/shared';

export interface LumperFeeRecord {
  id: string;
  tripId: string;
  amount: number;
  location: string;
  description: string;
  receiptNumber?: string;
  paidAt: Date;
  createdAt: Date;
}

export interface DetentionChargeRecord {
  id: string;
  tripId: string;
  amount: number;
  location: string;
  reason: string;
  startTime: Date;
  endTime: Date;
  hoursDetained: number;
  hourlyRate: number;
  createdAt: Date;
}

export interface AdditionalFeeRecord {
  id: string;
  tripId: string;
  feeType: 'lumper' | 'detention' | 'layover' | 'fuel_surcharge' | 'tolls' | 'permits' | 'other';
  amount: number;
  description: string;
  location?: string;
  receiptNumber?: string;
  paidAt?: Date;
  createdAt: Date;
}

export interface FeesSummary {
  totalLumperFees: number;
  totalDetentionCharges: number;
  totalOtherFees: number;
  totalAllFees: number;
  feesByType: Record<string, number>;
  feesByMonth: Array<{
    month: string;
    lumperFees: number;
    detentionCharges: number;
    otherFees: number;
    total: number;
  }>;
}

export interface CreateFeeDto {
  tripId: string;
  feeType: 'lumper' | 'detention' | 'layover' | 'fuel_surcharge' | 'tolls' | 'permits' | 'other';
  amount: number;
  description: string;
  location?: string;
  receiptNumber?: string;
  paidAt?: Date;
  // Detention-specific fields
  startTime?: Date;
  endTime?: Date;
  hourlyRate?: number;
}

@Injectable()
export class FeesService {
  constructor(private readonly tripsService: TripsService) {}

  /**
   * Record a new additional fee
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async recordFee(userId: string, userRole: UserRole, createFeeDto: CreateFeeDto): Promise<AdditionalFeeRecord> {
    // Verify user has access to the trip
    await this.tripsService.getTripById(createFeeDto.tripId, userId, userRole);

    const feeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    let hoursDetained = 0;
    if (createFeeDto.feeType === 'detention' && createFeeDto.startTime && createFeeDto.endTime) {
      const startTime = new Date(createFeeDto.startTime);
      const endTime = new Date(createFeeDto.endTime);
      hoursDetained = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      // If hourly rate is provided, calculate amount based on hours
      if (createFeeDto.hourlyRate && !createFeeDto.amount) {
        createFeeDto.amount = hoursDetained * createFeeDto.hourlyRate;
      }
    }

    const feeRecord: AdditionalFeeRecord = {
      id: feeId,
      tripId: createFeeDto.tripId,
      feeType: createFeeDto.feeType,
      amount: createFeeDto.amount,
      description: createFeeDto.description,
      location: createFeeDto.location,
      receiptNumber: createFeeDto.receiptNumber,
      paidAt: createFeeDto.paidAt || now,
      createdAt: now,
    };

    // In a real implementation, this would be stored in DynamoDB
    // For now, we'll return the created record
    return feeRecord;
  }

  /**
   * Get fees for a specific trip
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async getTripFees(tripId: string, userId: string, userRole: UserRole): Promise<AdditionalFeeRecord[]> {
    // Verify user has access to the trip
    await this.tripsService.getTripById(tripId, userId, userRole);

    // In a real implementation, this would query DynamoDB
    // For now, return mock data
    return [
      {
        id: 'fee-1',
        tripId,
        feeType: 'lumper',
        amount: 150.00,
        description: 'Unloading assistance at warehouse',
        location: 'Dallas, TX',
        receiptNumber: 'LMP-001',
        paidAt: new Date('2024-01-15T10:30:00Z'),
        createdAt: new Date('2024-01-15T10:30:00Z'),
      },
      {
        id: 'fee-2',
        tripId,
        feeType: 'detention',
        amount: 200.00,
        description: 'Delayed loading - 4 hours @ $50/hr',
        location: 'Houston, TX',
        paidAt: new Date('2024-01-15T14:00:00Z'),
        createdAt: new Date('2024-01-15T14:00:00Z'),
      },
    ];
  }

  /**
   * Get fees summary for user
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async getFeesSummary(
    userId: string,
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date
  ): Promise<FeesSummary> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    // In a real implementation, this would aggregate actual fee records
    // For now, calculate from trip data
    const totalLumperFees = trips.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const totalDetentionCharges = trips.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const totalOtherFees = 0; // Other fees not yet implemented
    const totalAllFees = totalLumperFees + totalDetentionCharges + totalOtherFees;

    // Group by fee type
    const feesByType: Record<string, number> = {
      lumper: totalLumperFees,
      detention: totalDetentionCharges,
      layover: 0,
      fuel_surcharge: 0,
      tolls: 0,
      permits: 0,
      other: totalOtherFees,
    };

    // Group by month
    const monthlyData = new Map<string, {
      lumperFees: number;
      detentionCharges: number;
      otherFees: number;
    }>();

    trips.forEach(trip => {
      const date = new Date(trip.scheduledPickupDatetime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, {
          lumperFees: 0,
          detentionCharges: 0,
          otherFees: 0,
        });
      }
      
      const data = monthlyData.get(monthKey)!;
      data.lumperFees += trip.lumperFees || 0;
      data.detentionCharges += trip.detentionFees || 0;
      data.otherFees += 0; // Other fees not yet implemented
    });

    const feesByMonth = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        lumperFees: data.lumperFees,
        detentionCharges: data.detentionCharges,
        otherFees: data.otherFees,
        total: data.lumperFees + data.detentionCharges + data.otherFees,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalLumperFees,
      totalDetentionCharges,
      totalOtherFees,
      totalAllFees,
      feesByType,
      feesByMonth,
    };
  }

  /**
   * Get lumper fee statistics
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async getLumperFeeStatistics(
    userId: string,
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalAmount: number;
    averageAmount: number;
    feeCount: number;
    topLocations: Array<{
      location: string;
      amount: number;
      count: number;
    }>;
  }> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    const tripsWithLumperFees = trips.filter(trip => trip.lumperFees && trip.lumperFees > 0);
    const totalAmount = tripsWithLumperFees.reduce((sum, trip) => sum + (trip.lumperFees || 0), 0);
    const feeCount = tripsWithLumperFees.length;
    const averageAmount = feeCount > 0 ? totalAmount / feeCount : 0;

    // Group by location (using dropoff location as proxy)
    const locationData = new Map<string, { amount: number; count: number }>();
    tripsWithLumperFees.forEach(trip => {
      const location = trip.dropoffLocation;
      if (!locationData.has(location)) {
        locationData.set(location, { amount: 0, count: 0 });
      }
      const data = locationData.get(location)!;
      data.amount += trip.lumperFees || 0;
      data.count += 1;
    });

    const topLocations = Array.from(locationData.entries())
      .map(([location, data]) => ({ location, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      totalAmount,
      averageAmount,
      feeCount,
      topLocations,
    };
  }

  /**
   * Get detention charge statistics
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async getDetentionChargeStatistics(
    userId: string,
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalAmount: number;
    averageAmount: number;
    chargeCount: number;
    averageHoursDetained: number;
    topLocations: Array<{
      location: string;
      amount: number;
      count: number;
    }>;
  }> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    const tripsWithDetentionCharges = trips.filter(trip => trip.detentionFees && trip.detentionFees > 0);
    const totalAmount = tripsWithDetentionCharges.reduce((sum, trip) => sum + (trip.detentionFees || 0), 0);
    const chargeCount = tripsWithDetentionCharges.length;
    const averageAmount = chargeCount > 0 ? totalAmount / chargeCount : 0;

    // Estimate average hours detained (assuming $50/hour rate)
    const estimatedHourlyRate = 50;
    const averageHoursDetained = averageAmount > 0 ? averageAmount / estimatedHourlyRate : 0;

    // Group by location (using pickup location as proxy)
    const locationData = new Map<string, { amount: number; count: number }>();
    tripsWithDetentionCharges.forEach(trip => {
      const location = trip.pickupLocation;
      if (!locationData.has(location)) {
        locationData.set(location, { amount: 0, count: 0 });
      }
      const data = locationData.get(location)!;
      data.amount += trip.detentionFees || 0;
      data.count += 1;
    });

    const topLocations = Array.from(locationData.entries())
      .map(([location, data]) => ({ location, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      totalAmount,
      averageAmount,
      chargeCount,
      averageHoursDetained,
      topLocations,
    };
  }

  /**
   * Update an existing fee record
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async updateFee(
    feeId: string,
    userId: string,
    userRole: UserRole,
    updateData: Partial<CreateFeeDto>
  ): Promise<AdditionalFeeRecord> {
    // In a real implementation, this would:
    // 1. Get the existing fee record
    // 2. Verify user has access to the associated trip
    // 3. Update the record in DynamoDB
    // 4. Return the updated record

    // For now, return a mock updated record
    return {
      id: feeId,
      tripId: updateData.tripId || 'trip-123',
      feeType: updateData.feeType || 'lumper',
      amount: updateData.amount || 150.00,
      description: updateData.description || 'Updated fee description',
      location: updateData.location,
      receiptNumber: updateData.receiptNumber,
      paidAt: updateData.paidAt || new Date(),
      createdAt: new Date('2024-01-15T10:30:00Z'),
    };
  }

  /**
   * Delete a fee record
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async deleteFee(feeId: string, userId: string, userRole: UserRole): Promise<void> {
    // In a real implementation, this would:
    // 1. Get the existing fee record
    // 2. Verify user has access to the associated trip
    // 3. Delete the record from DynamoDB

    // For now, just return success
    return;
  }
}