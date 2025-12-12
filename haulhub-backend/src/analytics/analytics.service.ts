import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { Trip, TripStatus, UserRole } from '@haulhub/shared';

export interface FleetOverview {
  drivers: {
    total: number;
    active: number;
    onTrip: number;
    utilization: number;
  };
  vehicles: {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    utilization: number;
  };
  trips: {
    total: number;
    completed: number;
    inProgress: number;
    planned: number;
  };
}

export interface TripAnalytics {
  totalTrips: number;
  completedTrips: number;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  averageDistance: number;
  averageRevenue: number;
  onTimeDeliveryRate: number;
  fuelEfficiency: number;
}

export interface DriverPerformance {
  driverId: string;
  driverName: string;
  totalTrips: number;
  completedTrips: number;
  totalDistance: number;
  totalRevenue: number;
  averageRevenue: number;
  onTimeDeliveryRate: number;
}

export interface VehicleUtilization {
  vehicleId: string;
  vehicleName: string;
  totalTrips: number;
  totalDistance: number;
  totalRevenue: number;
  utilizationRate: number;
  averageRevenuePerTrip: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tripsService: TripsService,
    private readonly usersService: UsersService,
  ) {}

  async getFleetOverview(): Promise<FleetOverview> {
    // Note: This is a simplified implementation that queries trips
    // In a production system, you'd want to cache these metrics or use a separate analytics table
    
    try {
      // Get all trips to calculate metrics
      // We'll scan the trips table to get counts by status
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: 'SK = :metadata',
        ExpressionAttributeValues: {
          ':metadata': 'METADATA',
        },
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate trip metrics
      const totalTrips = trips.length;
      const completedTrips = trips.filter(t => t.status === TripStatus.Delivered || t.status === TripStatus.Paid).length;
      const inProgressTrips = trips.filter(t => t.status === TripStatus.PickedUp || t.status === TripStatus.InTransit).length;
      const plannedTrips = trips.filter(t => t.status === TripStatus.Scheduled).length;
      
      // Calculate unique drivers and vehicles
      const uniqueDrivers = new Set(trips.map(t => t.driverId));
      const uniqueVehicles = new Set(trips.map(t => t.lorryId));
      
      // Calculate drivers on trip (currently in PickedUp or InTransit status)
      const driversOnTrip = new Set(
        trips
          .filter(t => t.status === TripStatus.PickedUp || t.status === TripStatus.InTransit)
          .map(t => t.driverId)
      );
      
      // Calculate vehicles in use
      const vehiclesInUse = new Set(
        trips
          .filter(t => t.status === TripStatus.PickedUp || t.status === TripStatus.InTransit)
          .map(t => t.lorryId)
      );
      
      const totalDrivers = uniqueDrivers.size;
      const totalVehicles = uniqueVehicles.size;
      const activeDrivers = driversOnTrip.size;
      const vehiclesActive = vehiclesInUse.size;
      
      return {
        drivers: {
          total: totalDrivers,
          active: activeDrivers,
          onTrip: activeDrivers,
          utilization: totalDrivers > 0 ? (activeDrivers / totalDrivers) * 100 : 0,
        },
        vehicles: {
          total: totalVehicles,
          available: totalVehicles - vehiclesActive,
          inUse: vehiclesActive,
          maintenance: 0, // Not tracked yet
          utilization: totalVehicles > 0 ? (vehiclesActive / totalVehicles) * 100 : 0,
        },
        trips: {
          total: totalTrips,
          completed: completedTrips,
          inProgress: inProgressTrips,
          planned: plannedTrips,
        },
      };
    } catch (error) {
      console.error('Error getting fleet overview:', error);
      // Return empty data on error
      return {
        drivers: {
          total: 0,
          active: 0,
          onTrip: 0,
          utilization: 0,
        },
        vehicles: {
          total: 0,
          available: 0,
          inUse: 0,
          maintenance: 0,
          utilization: 0,
        },
        trips: {
          total: 0,
          completed: 0,
          inProgress: 0,
          planned: 0,
        },
      };
    }
  }

  async getTripAnalytics(startDate?: Date, endDate?: Date): Promise<TripAnalytics> {
    try {
      // Get all trips within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build filter expression
      let filterExpression = 'SK = :metadata';
      const expressionAttributeValues: any = {
        ':metadata': 'METADATA',
      };
      
      if (startDate && endDate) {
        filterExpression += ' AND scheduledPickupDatetime BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      } else if (startDate) {
        filterExpression += ' AND scheduledPickupDatetime >= :startDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
      } else if (endDate) {
        filterExpression += ' AND scheduledPickupDatetime <= :endDate';
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      }
      
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate analytics
      const totalTrips = trips.length;
      const completedTrips = trips.filter(t => t.status === TripStatus.Delivered || t.status === TripStatus.Paid).length;
      
      const totalRevenue = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
      const totalExpenses = trips.reduce((sum, trip) => 
        sum + trip.driverPayment + trip.lorryOwnerPayment + (trip.lumperFees || 0) + (trip.detentionFees || 0), 0
      );
      const totalProfit = totalRevenue - totalExpenses;
      
      const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
      const averageDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
      const averageRevenue = totalTrips > 0 ? totalRevenue / totalTrips : 0;
      
      // Calculate on-time delivery rate (trips delivered vs scheduled)
      // For now, we'll consider all delivered trips as on-time since we don't track actual vs scheduled delivery
      const onTimeDeliveryRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
      
      // Fuel efficiency placeholder (miles per gallon) - not tracked yet
      const fuelEfficiency = 0;
      
      return {
        totalTrips,
        completedTrips,
        totalRevenue,
        totalExpenses,
        totalProfit,
        averageDistance,
        averageRevenue,
        onTimeDeliveryRate,
        fuelEfficiency,
      };
    } catch (error) {
      console.error('Error getting trip analytics:', error);
      return {
        totalTrips: 0,
        completedTrips: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        totalProfit: 0,
        averageDistance: 0,
        averageRevenue: 0,
        onTimeDeliveryRate: 0,
        fuelEfficiency: 0,
      };
    }
  }

  async getDriverPerformance(startDate?: Date, endDate?: Date): Promise<DriverPerformance[]> {
    try {
      // Get all trips within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build filter expression
      let filterExpression = 'SK = :metadata';
      const expressionAttributeValues: any = {
        ':metadata': 'METADATA',
      };
      
      if (startDate && endDate) {
        filterExpression += ' AND scheduledPickupDatetime BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      } else if (startDate) {
        filterExpression += ' AND scheduledPickupDatetime >= :startDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
      } else if (endDate) {
        filterExpression += ' AND scheduledPickupDatetime <= :endDate';
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      }
      
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by driver
      const driverMap = new Map<string, {
        driverName: string;
        trips: Trip[];
      }>();
      
      for (const trip of trips) {
        if (!driverMap.has(trip.driverId)) {
          driverMap.set(trip.driverId, {
            driverName: trip.driverName,
            trips: [],
          });
        }
        driverMap.get(trip.driverId)!.trips.push(trip);
      }
      
      // Calculate performance metrics for each driver
      const performance: DriverPerformance[] = [];
      
      for (const [driverId, data] of driverMap.entries()) {
        const totalTrips = data.trips.length;
        const completedTrips = data.trips.filter(t => 
          t.status === TripStatus.Delivered || t.status === TripStatus.Paid
        ).length;
        
        const totalDistance = data.trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        const totalRevenue = data.trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
        const averageRevenue = totalTrips > 0 ? totalRevenue / totalTrips : 0;
        
        // On-time delivery rate (completed vs total)
        const onTimeDeliveryRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
        
        performance.push({
          driverId,
          driverName: data.driverName,
          totalTrips,
          completedTrips,
          totalDistance,
          totalRevenue,
          averageRevenue,
          onTimeDeliveryRate,
        });
      }
      
      // Sort by total revenue descending
      performance.sort((a, b) => b.totalRevenue - a.totalRevenue);
      
      return performance;
    } catch (error) {
      console.error('Error getting driver performance:', error);
      return [];
    }
  }

  async getVehicleUtilization(startDate?: Date, endDate?: Date): Promise<VehicleUtilization[]> {
    try {
      // Get all trips within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build filter expression
      let filterExpression = 'SK = :metadata';
      const expressionAttributeValues: any = {
        ':metadata': 'METADATA',
      };
      
      if (startDate && endDate) {
        filterExpression += ' AND scheduledPickupDatetime BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      } else if (startDate) {
        filterExpression += ' AND scheduledPickupDatetime >= :startDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
      } else if (endDate) {
        filterExpression += ' AND scheduledPickupDatetime <= :endDate';
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      }
      
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by vehicle
      const vehicleMap = new Map<string, Trip[]>();
      
      for (const trip of trips) {
        if (!vehicleMap.has(trip.lorryId)) {
          vehicleMap.set(trip.lorryId, []);
        }
        vehicleMap.get(trip.lorryId)!.push(trip);
      }
      
      // Calculate utilization metrics for each vehicle
      const utilization: VehicleUtilization[] = [];
      
      // Calculate total days in the date range for utilization rate
      const totalDays = startDate && endDate 
        ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        : 30; // Default to 30 days if no range specified
      
      for (const [vehicleId, vehicleTrips] of vehicleMap.entries()) {
        const totalTrips = vehicleTrips.length;
        const totalDistance = vehicleTrips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        const totalRevenue = vehicleTrips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
        
        // Calculate utilization rate (days with trips / total days)
        const uniqueDays = new Set(
          vehicleTrips.map(trip => trip.scheduledPickupDatetime.split('T')[0])
        );
        const utilizationRate = totalDays > 0 ? (uniqueDays.size / totalDays) * 100 : 0;
        
        const averageRevenuePerTrip = totalTrips > 0 ? totalRevenue / totalTrips : 0;
        
        utilization.push({
          vehicleId,
          vehicleName: vehicleId, // Using ID as name since we don't have vehicle names yet
          totalTrips,
          totalDistance,
          totalRevenue,
          utilizationRate,
          averageRevenuePerTrip,
        });
      }
      
      // Sort by utilization rate descending
      utilization.sort((a, b) => b.utilizationRate - a.utilizationRate);
      
      return utilization;
    } catch (error) {
      console.error('Error getting vehicle utilization:', error);
      return [];
    }
  }

  async getRevenueAnalytics(startDate?: Date, endDate?: Date) {
    try {
      // Get all trips within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build filter expression
      let filterExpression = 'SK = :metadata';
      const expressionAttributeValues: any = {
        ':metadata': 'METADATA',
      };
      
      if (startDate && endDate) {
        filterExpression += ' AND scheduledPickupDatetime BETWEEN :startDate AND :endDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      } else if (startDate) {
        filterExpression += ' AND scheduledPickupDatetime >= :startDate';
        expressionAttributeValues[':startDate'] = startDate.toISOString();
      } else if (endDate) {
        filterExpression += ' AND scheduledPickupDatetime <= :endDate';
        expressionAttributeValues[':endDate'] = endDate.toISOString();
      }
      
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by month
      const monthlyMap = new Map<string, {
        revenue: number;
        expenses: number;
        profit: number;
      }>();
      
      for (const trip of trips) {
        const date = new Date(trip.scheduledPickupDatetime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            revenue: 0,
            expenses: 0,
            profit: 0,
          });
        }
        
        const monthData = monthlyMap.get(monthKey)!;
        monthData.revenue += trip.brokerPayment;
        monthData.expenses += trip.driverPayment + trip.lorryOwnerPayment + (trip.lumperFees || 0) + (trip.detentionFees || 0);
        monthData.profit = monthData.revenue - monthData.expenses;
      }
      
      // Sort months chronologically
      const sortedMonths = Array.from(monthlyMap.keys()).sort();
      
      // Build monthly data array
      const monthlyData = sortedMonths.map(monthKey => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const data = monthlyMap.get(monthKey)!;
        return {
          month: monthName,
          revenue: data.revenue,
          expenses: data.expenses,
          profit: data.profit,
        };
      });
      
      // Calculate totals
      const totalRevenue = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
      const totalExpenses = trips.reduce((sum, trip) => 
        sum + trip.driverPayment + trip.lorryOwnerPayment + (trip.lumperFees || 0) + (trip.detentionFees || 0), 0
      );
      const totalProfit = totalRevenue - totalExpenses;
      const averageMonthlyRevenue = monthlyData.length > 0 ? totalRevenue / monthlyData.length : 0;
      
      return {
        monthlyData,
        totalRevenue,
        totalExpenses,
        totalProfit,
        averageMonthlyRevenue,
      };
    } catch (error) {
      console.error('Error getting revenue analytics:', error);
      return {
        monthlyData: [],
        totalRevenue: 0,
        totalExpenses: 0,
        totalProfit: 0,
        averageMonthlyRevenue: 0,
      };
    }
  }

  async getMaintenanceAlerts() {
    try {
      // Get all trips to identify vehicles and drivers that need attention
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const scanCommand = new ScanCommand({
        TableName: tripsTableName,
        FilterExpression: 'SK = :metadata',
        ExpressionAttributeValues: {
          ':metadata': 'METADATA',
        },
      });
      
      const result = await dynamodbClient.send(scanCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate vehicle usage metrics
      const vehicleUsage = new Map<string, {
        totalDistance: number;
        tripCount: number;
        lastTripDate: Date;
      }>();
      
      for (const trip of trips) {
        if (!vehicleUsage.has(trip.lorryId)) {
          vehicleUsage.set(trip.lorryId, {
            totalDistance: 0,
            tripCount: 0,
            lastTripDate: new Date(trip.scheduledPickupDatetime),
          });
        }
        
        const usage = vehicleUsage.get(trip.lorryId)!;
        usage.totalDistance += trip.distance || 0;
        usage.tripCount += 1;
        
        const tripDate = new Date(trip.scheduledPickupDatetime);
        if (tripDate > usage.lastTripDate) {
          usage.lastTripDate = tripDate;
        }
      }
      
      // Generate alerts for vehicles with high mileage or inactive
      const vehicleAlerts: any[] = [];
      const now = new Date();
      
      for (const [vehicleId, usage] of vehicleUsage.entries()) {
        // Alert if vehicle has high mileage (>50,000 miles)
        if (usage.totalDistance > 50000) {
          vehicleAlerts.push({
            vehicleId,
            alertType: 'high_mileage',
            message: `Vehicle ${vehicleId} has accumulated ${usage.totalDistance.toFixed(0)} miles`,
            severity: 'warning',
          });
        }
        
        // Alert if vehicle hasn't been used in 30 days
        const daysSinceLastTrip = Math.floor((now.getTime() - usage.lastTripDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastTrip > 30) {
          vehicleAlerts.push({
            vehicleId,
            alertType: 'inactive',
            message: `Vehicle ${vehicleId} has been inactive for ${daysSinceLastTrip} days`,
            severity: 'info',
          });
        }
      }
      
      // Calculate driver metrics
      const driverUsage = new Map<string, {
        tripCount: number;
        lastTripDate: Date;
        driverName: string;
      }>();
      
      for (const trip of trips) {
        if (!driverUsage.has(trip.driverId)) {
          driverUsage.set(trip.driverId, {
            tripCount: 0,
            lastTripDate: new Date(trip.scheduledPickupDatetime),
            driverName: trip.driverName,
          });
        }
        
        const usage = driverUsage.get(trip.driverId)!;
        usage.tripCount += 1;
        
        const tripDate = new Date(trip.scheduledPickupDatetime);
        if (tripDate > usage.lastTripDate) {
          usage.lastTripDate = tripDate;
        }
      }
      
      // Generate alerts for inactive drivers
      const driverAlerts: any[] = [];
      
      for (const [driverId, usage] of driverUsage.entries()) {
        // Alert if driver hasn't been assigned a trip in 30 days
        const daysSinceLastTrip = Math.floor((now.getTime() - usage.lastTripDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastTrip > 30) {
          driverAlerts.push({
            driverId,
            driverName: usage.driverName,
            alertType: 'inactive',
            message: `Driver ${usage.driverName} has been inactive for ${daysSinceLastTrip} days`,
            severity: 'info',
          });
        }
      }
      
      return {
        vehicleAlerts,
        driverAlerts,
      };
    } catch (error) {
      console.error('Error getting maintenance alerts:', error);
      return {
        vehicleAlerts: [],
        driverAlerts: [],
      };
    }
  }
}
