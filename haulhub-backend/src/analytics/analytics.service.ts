import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { Trip, TripStatus } from '@haulhub/shared';

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

export interface DispatcherPerformance {
  dispatcherId: string;
  dispatcherName: string;
  totalTrips: number;
  completedTrips: number;
  totalRevenue: number;
  totalProfit: number;
  averageProfit: number;
  completionRate: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tripsService: TripsService,
  ) {}

  /**
   * Helper to format date for GSI query without mutating original
   */
  private formatDateForGSI(date: Date, isStart: boolean): string {
    const dateCopy = new Date(date);
    if (isStart) {
      dateCopy.setUTCHours(0, 0, 0, 0);
    } else {
      dateCopy.setUTCHours(23, 59, 59, 999);
    }
    return dateCopy.toISOString().split('.')[0] + 'Z#' + (isStart ? '' : 'ZZZZ');
  }

  async getFleetOverview(dispatcherId: string): Promise<FleetOverview> {
    // Note: This is a simplified implementation that queries trips
    // In a production system, you'd want to cache these metrics or use a separate analytics table
    
    try {
      // Get all trips for this dispatcher using GSI1
      // This replaces the SCAN operation with a Query operation
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Query GSI1 for all trips for this dispatcher
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :dispatcherPK',
        ExpressionAttributeValues: {
          ':dispatcherPK': `DISPATCHER#${dispatcherId}`,
        },
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate trip metrics
      const totalTrips = trips.length;
      const completedTrips = trips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
      const inProgressTrips = trips.filter(t => t.orderStatus === 'Picked Up' || t.orderStatus === 'In Transit').length;
      const plannedTrips = trips.filter(t => t.orderStatus === 'Scheduled').length;
      
      // Calculate unique drivers and vehicles
      const uniqueDrivers = new Set(trips.map(t => t.driverId));
      const uniqueVehicles = new Set(trips.map(t => t.truckId));
      
      // Calculate drivers on trip (currently in PickedUp or InTransit status)
      const driversOnTrip = new Set(
        trips
          .filter(t => t.orderStatus === 'Picked Up' || t.orderStatus === 'In Transit')
          .map(t => t.driverId)
      );
      
      // Calculate vehicles in use
      const vehiclesInUse = new Set(
        trips
          .filter(t => t.orderStatus === 'Picked Up' || t.orderStatus === 'In Transit')
          .map(t => t.truckId)
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

  async getUnifiedAnalytics(userId: string, userRole: string, startDate?: Date, endDate?: Date) {
    try {
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';

      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');

      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };

      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        expressionAttributeValues[':startDate'] = this.formatDateForGSI(startDate, true);
        expressionAttributeValues[':endDate'] = this.formatDateForGSI(endDate, false);
      }

      const allTrips: any[] = [];
      let lastKey: any = undefined;
      do {
        const cmd = new QueryCommand({
          TableName: tripsTableName,
          IndexName: indexName,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          ExclusiveStartKey: lastKey,
        });
        const result = await dynamodbClient.send(cmd);
        allTrips.push(...(result.Items || []).map(item => this.tripsService['mapItemToTrip'](item)));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      const trips = allTrips;

      // Trip Analytics
      const totalTrips = trips.length;
      const completedTrips = trips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
      const totalRevenue = trips.reduce((s, t) => s + (t.brokerPayment || 0), 0);
      const totalFuelCost = trips.reduce((s, t) => {
        if (t.fuelCost) return s + t.fuelCost;
        if (t.fuelGasAvgCost && t.fuelGasAvgGallxMil) return s + ((t.mileageOrder + t.mileageEmpty) * t.fuelGasAvgGallxMil * t.fuelGasAvgCost);
        return s;
      }, 0);
      const totalExpenses = trips.reduce((s, t) => s + (t.driverPayment || 0) + (t.truckOwnerPayment || 0) + (t.lumperValue || 0) + (t.detentionValue || 0), 0) + totalFuelCost;
      const totalDistance = trips.reduce((s, t) => s + (t.mileageOrder || 0) + (t.mileageEmpty || 0), 0);

      const tripAnalytics: TripAnalytics = {
        totalTrips,
        completedTrips,
        totalRevenue,
        totalExpenses,
        totalProfit: totalRevenue - totalExpenses,
        averageDistance: totalTrips > 0 ? totalDistance / totalTrips : 0,
        averageRevenue: totalTrips > 0 ? totalRevenue / totalTrips : 0,
        onTimeDeliveryRate: totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0,
        fuelEfficiency: totalDistance > 0 ? totalFuelCost / totalDistance : 0,
      };

      // Driver Performance
      const driverMap = new Map<string, any[]>();
      trips.forEach(t => {
        if (!driverMap.has(t.driverId)) driverMap.set(t.driverId, []);
        driverMap.get(t.driverId)!.push(t);
      });
      const driverPerformance: DriverPerformance[] = Array.from(driverMap.entries()).map(([driverId, dTrips]) => {
        const completed = dTrips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
        const dist = dTrips.reduce((s, t) => s + (t.mileageOrder || 0) + (t.mileageEmpty || 0), 0);
        const rev = dTrips.reduce((s, t) => s + (t.brokerPayment || 0), 0);
        return {
          driverId, driverName: driverId,
          totalTrips: dTrips.length, completedTrips: completed,
          totalDistance: dist, totalRevenue: rev,
          averageRevenue: dTrips.length > 0 ? rev / dTrips.length : 0,
          onTimeDeliveryRate: dTrips.length > 0 ? (completed / dTrips.length) * 100 : 0,
        };
      });

      // Vehicle Utilization
      const truckMap = new Map<string, any[]>();
      trips.forEach(t => {
        if (!truckMap.has(t.truckId)) truckMap.set(t.truckId, []);
        truckMap.get(t.truckId)!.push(t);
      });
      const vehicleUtilization: VehicleUtilization[] = Array.from(truckMap.entries()).map(([vehicleId, vTrips]) => {
        const dist = vTrips.reduce((s, t) => s + (t.mileageOrder || 0) + (t.mileageEmpty || 0), 0);
        const rev = vTrips.reduce((s, t) => s + (t.brokerPayment || 0), 0);
        return {
          vehicleId, vehicleName: vehicleId,
          totalTrips: vTrips.length, totalDistance: dist, totalRevenue: rev,
          utilizationRate: 0, averageRevenuePerTrip: vTrips.length > 0 ? rev / vTrips.length : 0,
        };
      });

      // Broker Analytics
      const brokerMap = new Map<string, any[]>();
      trips.forEach(t => {
        if (!brokerMap.has(t.brokerId)) brokerMap.set(t.brokerId, []);
        brokerMap.get(t.brokerId)!.push(t);
      });
      const brokerAnalytics = Array.from(brokerMap.entries()).map(([brokerId, bTrips]) => {
        const rev = bTrips.reduce((s, t) => s + (t.brokerPayment || 0), 0);
        const dist = bTrips.reduce((s, t) => s + (t.mileageOrder || 0) + (t.mileageEmpty || 0), 0);
        const completed = bTrips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
        return {
          brokerId, brokerName: brokerId,
          tripCount: bTrips.length, totalRevenue: rev, averageRevenue: bTrips.length > 0 ? rev / bTrips.length : 0,
          totalDistance: dist, completedTrips: completed,
          completionRate: bTrips.length > 0 ? (completed / bTrips.length) * 100 : 0,
        };
      });

      // Fuel Analytics (with per-vehicle breakdown)
      const tripsWithFuel = trips.filter(t => t.fuelGasAvgCost && t.fuelGasAvgGallxMil);
      const vehicleFuelMap = new Map<string, any[]>();
      tripsWithFuel.forEach(t => {
        if (!vehicleFuelMap.has(t.truckId)) vehicleFuelMap.set(t.truckId, []);
        vehicleFuelMap.get(t.truckId)!.push(t);
      });
      const vehicleFuelEfficiency = Array.from(vehicleFuelMap.entries()).map(([vehicleId, vTrips]) => {
        const vDist = vTrips.reduce((s, t) => s + (t.mileageOrder || 0) + (t.mileageEmpty || 0), 0);
        const vGallons = vTrips.reduce((s, t) => s + ((t.mileageOrder || 0) + (t.mileageEmpty || 0)) * (t.fuelGasAvgGallxMil || 0), 0);
        const vCost = vTrips.reduce((s, t) => s + ((t.mileageOrder || 0) + (t.mileageEmpty || 0)) * (t.fuelGasAvgGallxMil || 0) * (t.fuelGasAvgCost || 0), 0);
        const avgGPM = vDist > 0 ? vGallons / vDist : 0;
        return {
          vehicleId, totalTrips: vTrips.length, totalDistance: vDist,
          totalGallons: vGallons, totalFuelCost: vCost,
          averageGallonsPerMile: avgGPM, averageMPG: avgGPM > 0 ? 1 / avgGPM : 0,
        };
      }).sort((a, b) => b.averageMPG - a.averageMPG);

      const totalGallons = tripsWithFuel.reduce((s, t) => s + ((t.mileageOrder || 0) + (t.mileageEmpty || 0)) * (t.fuelGasAvgGallxMil || 0), 0);
      const avgGPM = totalDistance > 0 ? totalGallons / totalDistance : 0;
      const avgFuelPrice = totalGallons > 0 ? totalFuelCost / totalGallons : 0;

      const fuelAnalytics = {
        totalFuelCost,
        averageFuelCostPerMile: totalDistance > 0 ? totalFuelCost / totalDistance : 0,
        averageFuelCostPerTrip: totalTrips > 0 ? totalFuelCost / totalTrips : 0,
        averageFuelCost: totalTrips > 0 ? totalFuelCost / totalTrips : 0,
        averageFuelPrice: avgFuelPrice,
        averageGallonsPerMile: avgGPM,
        totalGallonsUsed: totalGallons,
        totalTripsWithFuelData: tripsWithFuel.length,
        tripsWithFuelData: tripsWithFuel.length,
        totalTrips,
        vehicleFuelEfficiency,
      };

      // Dispatcher Performance (carrier only)
      let dispatcherPerformance: DispatcherPerformance[] = [];
      if (isCarrier) {
        const dispMap = new Map<string, any[]>();
        trips.forEach(t => {
          if (!dispMap.has(t.dispatcherId)) dispMap.set(t.dispatcherId, []);
          dispMap.get(t.dispatcherId)!.push(t);
        });
        dispatcherPerformance = Array.from(dispMap.entries()).map(([dispatcherId, dTrips]) => {
          const completed = dTrips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
          const rev = dTrips.reduce((s, t) => s + (t.brokerPayment || 0), 0);
          const exp = dTrips.reduce((s, t) => s + (t.driverPayment || 0) + (t.truckOwnerPayment || 0) + (t.lumperValue || 0) + (t.detentionValue || 0), 0);
          const profit = rev - exp;
          return {
            dispatcherId, dispatcherName: dispatcherId,
            totalTrips: dTrips.length, completedTrips: completed,
            totalRevenue: rev, totalProfit: profit,
            averageProfit: dTrips.length > 0 ? profit / dTrips.length : 0,
            completionRate: dTrips.length > 0 ? (completed / dTrips.length) * 100 : 0,
          };
        });
      }

      return {
        tripAnalytics,
        driverPerformance,
        vehicleUtilization,
        brokerAnalytics,
        fuelAnalytics,
        dispatcherPerformance,
      };
    } catch (error) {
      console.error('Error in getUnifiedAnalytics:', error);
      return {
        tripAnalytics: { totalTrips: 0, completedTrips: 0, totalRevenue: 0, totalExpenses: 0, totalProfit: 0, averageDistance: 0, averageRevenue: 0, onTimeDeliveryRate: 0, fuelEfficiency: 0 },
        driverPerformance: [],
        vehicleUtilization: [],
        brokerAnalytics: [],
        fuelAnalytics: { totalFuelCost: 0, averageFuelCostPerMile: 0, averageFuelCostPerTrip: 0, tripsWithFuelData: 0, totalTrips: 0 },
        dispatcherPerformance: [],
      };
    }
  }

  async getTripAnalytics(userId: string, userRole: string, startDate?: Date, endDate?: Date): Promise<TripAnalytics> {
    try {
      // Determine which GSI to use based on user role
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';
      
      // Get all trips for this user within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };
      
      // Add date range to KeyConditionExpression
      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ` AND ${skAttribute} >= :startDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ` AND ${skAttribute} <= :endDate`;
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate analytics
      const totalTrips = trips.length;
      const completedTrips = trips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
      
      const totalRevenue = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
      
      // Calculate total fuel costs from trip data
      const totalFuelCost = trips.reduce((sum, trip) => {
        if (trip.fuelCost) {
          return sum + trip.fuelCost;
        } else if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil) {
          const totalMiles = trip.mileageOrder + trip.mileageEmpty;
          return sum + (totalMiles * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost);
        }
        return sum;
      }, 0);
      
      const totalExpenses = trips.reduce((sum, trip) => 
        sum + trip.driverPayment + trip.truckOwnerPayment + trip.lumperValue + trip.detentionValue, 0
      ) + totalFuelCost;
      
      const totalProfit = totalRevenue - totalExpenses;
      
      const totalDistance = trips.reduce((sum, trip) => sum + trip.mileageOrder, 0);
      const averageDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
      const averageRevenue = totalTrips > 0 ? totalRevenue / totalTrips : 0;
      
      // Calculate on-time delivery rate (trips delivered vs scheduled)
      // For now, we'll consider all delivered trips as on-time since we don't track actual vs scheduled delivery
      const onTimeDeliveryRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
      
      // Calculate average fuel efficiency (gallons per mile)
      const tripsWithFuelData = trips.filter(t => t.fuelGasAvgGallxMil);
      const avgFuelEfficiency = tripsWithFuelData.length > 0
        ? tripsWithFuelData.reduce((sum, t) => sum + (t.fuelGasAvgGallxMil || 0), 0) / tripsWithFuelData.length
        : 0;
      
      return {
        totalTrips,
        completedTrips,
        totalRevenue,
        totalExpenses,
        totalProfit,
        averageDistance,
        averageRevenue,
        onTimeDeliveryRate,
        fuelEfficiency: avgFuelEfficiency,
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

  async getDriverPerformance(userId: string, userRole: string, startDate?: Date, endDate?: Date): Promise<DriverPerformance[]> {
    try {
      // Determine which GSI to use based on user role
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';
      
      // Get all trips for this user within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };
      
      // Add date range to KeyConditionExpression
      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ` AND ${skAttribute} >= :startDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ` AND ${skAttribute} <= :endDate`;
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by driver
      const driverMap = new Map<string, {
        trips: Trip[];
      }>();
      
      for (const trip of trips) {
        if (!driverMap.has(trip.driverId)) {
          driverMap.set(trip.driverId, {
            trips: [],
          });
        }
        driverMap.get(trip.driverId)!.trips.push(trip);
      }
      
      // Calculate performance metrics for each driver
      const performance: DriverPerformance[] = [];
      
      // Fetch driver details for all drivers
      const driverIds = Array.from(driverMap.keys());
      const usersTableName = this.tripsService['configService'].usersTableName;
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const driverDetailsMap = new Map<string, any>();
      await Promise.all(
        driverIds.map(async (driverId) => {
          try {
            const result = await dynamodbClient.send(new GetCommand({
              TableName: usersTableName,
              Key: { PK: `USER#${driverId}`, SK: 'METADATA' },
            }));
            if (result.Item) {
              driverDetailsMap.set(driverId, result.Item);
            }
          } catch (error) {
            console.error(`Error fetching driver ${driverId}:`, error);
          }
        })
      );
      
      for (const [driverId, data] of driverMap.entries()) {
        const totalTrips = data.trips.length;
        const completedTrips = data.trips.filter(t => 
          t.orderStatus === 'Delivered' || t.orderStatus === 'Paid'
        ).length;
        
        const totalDistance = data.trips.reduce((sum, trip) => sum + trip.mileageOrder, 0);
        const totalRevenue = data.trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
        const averageRevenue = totalTrips > 0 ? totalRevenue / totalTrips : 0;
        
        // On-time delivery rate (completed vs total)
        const onTimeDeliveryRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
        
        // Get driver details
        const driver = driverDetailsMap.get(driverId);
        const driverName = driver ? driver.name : driverId.substring(0, 8);
        
        performance.push({
          driverId,
          driverName,
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

  async getVehicleUtilization(userId: string, userRole: string, startDate?: Date, endDate?: Date): Promise<VehicleUtilization[]> {
    try {
      // Determine which GSI to use based on user role
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';
      
      // Get all trips for this user within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };
      
      // Add date range to KeyConditionExpression
      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ` AND ${skAttribute} >= :startDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ` AND ${skAttribute} <= :endDate`;
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by vehicle
      const vehicleMap = new Map<string, Trip[]>();
      
      for (const trip of trips) {
        if (!vehicleMap.has(trip.truckId)) {
          vehicleMap.set(trip.truckId, []);
        }
        vehicleMap.get(trip.truckId)!.push(trip);
      }
      
      // Calculate utilization metrics for each vehicle
      const utilization: VehicleUtilization[] = [];
      
      // Fetch truck details for all vehicles
      const truckIds = Array.from(vehicleMap.keys());
      const trucksTableName = this.tripsService['configService'].lorriesTableName;
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const truckDetailsMap = new Map<string, any>();
      await Promise.all(
        truckIds.map(async (truckId) => {
          try {
            const result = await dynamodbClient.send(new GetCommand({
              TableName: trucksTableName,
              Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
            }));
            if (result.Item) {
              truckDetailsMap.set(truckId, result.Item);
            }
          } catch (error) {
            console.error(`Error fetching truck ${truckId}:`, error);
          }
        })
      );
      
      // Calculate total days in the date range for utilization rate
      const totalDays = startDate && endDate 
        ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        : 30; // Default to 30 days if no range specified
      
      for (const [vehicleId, vehicleTrips] of vehicleMap.entries()) {
        const totalTrips = vehicleTrips.length;
        const totalDistance = vehicleTrips.reduce((sum, trip) => sum + trip.mileageOrder, 0);
        const totalRevenue = vehicleTrips.reduce((sum, trip) => sum + trip.truckOwnerPayment, 0);
        
        // Calculate utilization rate (days with trips / total days)
        const uniqueDays = new Set(
          vehicleTrips.map(trip => trip.scheduledTimestamp.split('T')[0])
        );
        const utilizationRate = totalDays > 0 ? (uniqueDays.size / totalDays) * 100 : 0;
        
        const averageRevenuePerTrip = totalTrips > 0 ? totalRevenue / totalTrips : 0;
        
        // Get truck details
        const truck = truckDetailsMap.get(vehicleId);
        const vehicleName = truck ? `${truck.plate} (${truck.brand} ${truck.year})` : vehicleId.substring(0, 8);
        
        utilization.push({
          vehicleId,
          vehicleName,
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

  async getRevenueAnalytics(dispatcherId: string, startDate?: Date, endDate?: Date) {
    try {
      // Get all trips for this dispatcher within date range using GSI1
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = 'GSI2PK = :dispatcherPK';
      const expressionAttributeValues: any = {
        ':dispatcherPK': `DISPATCHER#${dispatcherId}`,
      };
      
      // Add date range to KeyConditionExpression (not FilterExpression)
      // GSI sort keys use format: <ISO_TIMESTAMP>#<tripId>
      // For date range queries, we need to use full ISO 8601 timestamps
      if (startDate && endDate) {
        keyConditionExpression += ' AND GSI2SK BETWEEN :startDate AND :endDate';
        // Start of day for startDate
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        // End of day for endDate
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ' AND GSI2SK >= :startDate';
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ' AND GSI2SK <= :endDate';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by month
      const monthlyMap = new Map<string, {
        revenue: number;
        expenses: number;
        profit: number;
      }>();
      
      for (const trip of trips) {
        const date = new Date(trip.scheduledTimestamp);
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
        monthData.expenses += trip.driverPayment + trip.truckOwnerPayment + trip.lumperValue + trip.detentionValue;
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
        sum + trip.driverPayment + trip.truckOwnerPayment + trip.lumperValue + trip.detentionValue, 0
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

  async getMaintenanceAlerts(dispatcherId: string) {
    try {
      // Get all trips for this dispatcher using GSI1
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :dispatcherPK',
        ExpressionAttributeValues: {
          ':dispatcherPK': `DISPATCHER#${dispatcherId}`,
        },
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Calculate vehicle usage metrics
      const vehicleUsage = new Map<string, {
        totalDistance: number;
        tripCount: number;
        lastTripDate: Date;
      }>();
      
      for (const trip of trips) {
        if (!vehicleUsage.has(trip.truckId)) {
          vehicleUsage.set(trip.truckId, {
            totalDistance: 0,
            tripCount: 0,
            lastTripDate: new Date(trip.scheduledTimestamp),
          });
        }
        
        const usage = vehicleUsage.get(trip.truckId)!;
        usage.totalDistance += trip.mileageOrder;
        usage.tripCount += 1;
        
        const tripDate = new Date(trip.scheduledTimestamp);
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
      }>();
      
      for (const trip of trips) {
        if (!driverUsage.has(trip.driverId)) {
          driverUsage.set(trip.driverId, {
            tripCount: 0,
            lastTripDate: new Date(trip.scheduledTimestamp),
          });
        }
        
        const usage = driverUsage.get(trip.driverId)!;
        usage.tripCount += 1;
        
        const tripDate = new Date(trip.scheduledTimestamp);
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
            driverName: `Driver ${driverId}`, // Using ID as name
            alertType: 'inactive',
            message: `Driver ${driverId} has been inactive for ${daysSinceLastTrip} days`,
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

  async getFuelAnalytics(userId: string, userRole: string, startDate?: Date, endDate?: Date) {
    try {
      // Determine which GSI to use based on user role
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';
      
      // Get all trips for this user within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };
      
      // Add date range to KeyConditionExpression
      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ` AND ${skAttribute} >= :startDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ` AND ${skAttribute} <= :endDate`;
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Filter trips with fuel data
      const tripsWithFuelData = trips.filter(t => t.fuelGasAvgCost && t.fuelGasAvgGallxMil);
      
      if (tripsWithFuelData.length === 0) {
        return {
          totalTripsWithFuelData: 0,
          totalFuelCost: 0,
          averageFuelCost: 0,
          averageFuelPrice: 0,
          averageGallonsPerMile: 0,
          totalGallonsUsed: 0,
          vehicleFuelEfficiency: [],
        };
      }
      
      // Calculate total fuel costs
      const totalFuelCost = tripsWithFuelData.reduce((sum, trip) => {
        if (trip.fuelCost) {
          return sum + trip.fuelCost;
        }
        const totalMiles = trip.mileageOrder + trip.mileageEmpty;
        return sum + (totalMiles * trip.fuelGasAvgGallxMil! * trip.fuelGasAvgCost!);
      }, 0);
      
      // Calculate average fuel price
      const avgFuelPrice = tripsWithFuelData.reduce((sum, t) => sum + (t.fuelGasAvgCost || 0), 0) / tripsWithFuelData.length;
      
      // Calculate average gallons per mile
      const avgGallonsPerMile = tripsWithFuelData.reduce((sum, t) => sum + (t.fuelGasAvgGallxMil || 0), 0) / tripsWithFuelData.length;
      
      // Calculate total gallons used
      const totalGallonsUsed = tripsWithFuelData.reduce((sum, trip) => {
        const totalMiles = trip.mileageOrder + trip.mileageEmpty;
        return sum + (totalMiles * (trip.fuelGasAvgGallxMil || 0));
      }, 0);
      
      // Group by vehicle for efficiency comparison
      const vehicleMap = new Map<string, {
        tripCount: number;
        totalMiles: number;
        totalGallons: number;
        totalCost: number;
      }>();
      
      for (const trip of tripsWithFuelData) {
        if (!vehicleMap.has(trip.truckId)) {
          vehicleMap.set(trip.truckId, {
            tripCount: 0,
            totalMiles: 0,
            totalGallons: 0,
            totalCost: 0,
          });
        }
        
        const vehicleData = vehicleMap.get(trip.truckId)!;
        const totalMiles = trip.mileageOrder + trip.mileageEmpty;
        const gallons = totalMiles * (trip.fuelGasAvgGallxMil || 0);
        const cost = trip.fuelCost || (gallons * (trip.fuelGasAvgCost || 0));
        
        vehicleData.tripCount += 1;
        vehicleData.totalMiles += totalMiles;
        vehicleData.totalGallons += gallons;
        vehicleData.totalCost += cost;
      }
      
      // Build vehicle efficiency array
      // Fetch truck details for enrichment
      const vehicleIds = Array.from(vehicleMap.keys());
      const trucksTableName = this.tripsService['configService'].lorriesTableName;
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const truckDetailsMap = new Map<string, any>();
      await Promise.all(
        vehicleIds.map(async (truckId) => {
          try {
            const result = await dynamodbClient.send(new GetCommand({
              TableName: trucksTableName,
              Key: { PK: `TRUCK#${truckId}`, SK: 'METADATA' },
            }));
            if (result.Item) {
              truckDetailsMap.set(truckId, result.Item);
            }
          } catch (error) {
            console.error(`Error fetching truck ${truckId}:`, error);
          }
        })
      );
      
      const vehicleFuelEfficiency = Array.from(vehicleMap.entries()).map(([vehicleId, data]) => {
        const truck = truckDetailsMap.get(vehicleId);
        const vehicleName = truck ? `${truck.plate} (${truck.brand} ${truck.year})` : vehicleId.substring(0, 8);
        
        return {
          vehicleId: vehicleName, // Use plate as display name
          tripCount: data.tripCount,
          totalMiles: data.totalMiles,
          totalGallons: data.totalGallons,
          totalCost: data.totalCost,
          averageGallonsPerMile: data.totalMiles > 0 ? data.totalGallons / data.totalMiles : 0,
          averageMPG: data.totalGallons > 0 ? data.totalMiles / data.totalGallons : 0,
        };
      });
      
      // Sort by efficiency (MPG descending)
      vehicleFuelEfficiency.sort((a, b) => b.averageMPG - a.averageMPG);
      
      // Group fuel costs by month for trend chart
      const monthlyFuelMap = new Map<string, {
        fuelCost: number;
        gallonsUsed: number;
        tripCount: number;
      }>();
      
      for (const trip of tripsWithFuelData) {
        const date = new Date(trip.scheduledTimestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyFuelMap.has(monthKey)) {
          monthlyFuelMap.set(monthKey, {
            fuelCost: 0,
            gallonsUsed: 0,
            tripCount: 0,
          });
        }
        
        const monthData = monthlyFuelMap.get(monthKey)!;
        const totalMiles = trip.mileageOrder + trip.mileageEmpty;
        const gallons = totalMiles * (trip.fuelGasAvgGallxMil || 0);
        const cost = trip.fuelCost || (gallons * (trip.fuelGasAvgCost || 0));
        
        monthData.fuelCost += cost;
        monthData.gallonsUsed += gallons;
        monthData.tripCount += 1;
      }
      
      // Sort months chronologically
      const sortedMonths = Array.from(monthlyFuelMap.keys()).sort();
      
      // Build monthly data array
      const monthlyFuelData = sortedMonths.map(monthKey => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const data = monthlyFuelMap.get(monthKey)!;
        return {
          month: monthName,
          fuelCost: data.fuelCost,
          gallonsUsed: data.gallonsUsed,
          tripCount: data.tripCount,
          avgCostPerTrip: data.tripCount > 0 ? data.fuelCost / data.tripCount : 0,
        };
      });
      
      return {
        totalTripsWithFuelData: tripsWithFuelData.length,
        totalFuelCost,
        averageFuelCost: tripsWithFuelData.length > 0 ? totalFuelCost / tripsWithFuelData.length : 0,
        averageFuelPrice: avgFuelPrice,
        averageGallonsPerMile: avgGallonsPerMile,
        totalGallonsUsed,
        vehicleFuelEfficiency,
        monthlyFuelData,
      };
    } catch (error) {
      console.error('Error getting fuel analytics:', error);
      return {
        totalTripsWithFuelData: 0,
        totalFuelCost: 0,
        averageFuelCost: 0,
        averageFuelPrice: 0,
        averageGallonsPerMile: 0,
        totalGallonsUsed: 0,
        vehicleFuelEfficiency: [],
      };
    }
  }

  async getBrokerAnalytics(userId: string, userRole: string, startDate?: Date, endDate?: Date) {
    try {
      // Determine which GSI to use based on user role
      const isCarrier = userRole === 'Carrier';
      const indexName = isCarrier ? 'GSI1' : 'GSI2';
      const pkPrefix = isCarrier ? 'CARRIER' : 'DISPATCHER';
      const skAttribute = isCarrier ? 'GSI1SK' : 'GSI2SK';
      
      // Get all trips for this user within date range
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build key condition expression with date range
      let keyConditionExpression = `${indexName}PK = :userPK`;
      const expressionAttributeValues: any = {
        ':userPK': `${pkPrefix}#${userId}`,
      };
      
      // Add date range to KeyConditionExpression
      if (startDate && endDate) {
        keyConditionExpression += ` AND ${skAttribute} BETWEEN :startDate AND :endDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ` AND ${skAttribute} >= :startDate`;
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ` AND ${skAttribute} <= :endDate`;
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      // Group trips by broker
      const brokerMap = new Map<string, {
        tripCount: number;
        totalRevenue: number;
        totalDistance: number;
        completedTrips: number;
      }>();
      
      for (const trip of trips) {
        if (!brokerMap.has(trip.brokerId)) {
          brokerMap.set(trip.brokerId, {
            tripCount: 0,
            totalRevenue: 0,
            totalDistance: 0,
            completedTrips: 0,
          });
        }
        
        const brokerData = brokerMap.get(trip.brokerId)!;
        brokerData.tripCount += 1;
        brokerData.totalRevenue += trip.brokerPayment;
        brokerData.totalDistance += trip.mileageOrder;
        
        if (trip.orderStatus === 'Delivered' || trip.orderStatus === 'Paid') {
          brokerData.completedTrips += 1;
        }
      }
      
      // Build broker analytics array
      // Fetch broker details for enrichment
      const brokerIds = Array.from(brokerMap.keys());
      const brokersTableName = this.tripsService['configService'].brokersTableName;
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const brokerDetailsMap = new Map<string, any>();
      await Promise.all(
        brokerIds.map(async (brokerId) => {
          try {
            const result = await dynamodbClient.send(new GetCommand({
              TableName: brokersTableName,
              Key: { PK: `BROKER#${brokerId}`, SK: 'METADATA' },
            }));
            if (result.Item) {
              brokerDetailsMap.set(brokerId, result.Item);
            }
          } catch (error) {
            console.error(`Error fetching broker ${brokerId}:`, error);
          }
        })
      );
      
      const brokerAnalytics = Array.from(brokerMap.entries()).map(([brokerId, data]) => {
        const broker = brokerDetailsMap.get(brokerId);
        return {
          brokerName: broker?.brokerName || brokerId.substring(0, 8),
          tripCount: data.tripCount,
          totalRevenue: data.totalRevenue,
          averageRevenue: data.tripCount > 0 ? data.totalRevenue / data.tripCount : 0,
          totalDistance: data.totalDistance,
          averageDistance: data.tripCount > 0 ? data.totalDistance / data.tripCount : 0,
          completedTrips: data.completedTrips,
          completionRate: data.tripCount > 0 ? (data.completedTrips / data.tripCount) * 100 : 0,
        };
      });
      
      // Sort by total revenue descending
      brokerAnalytics.sort((a, b) => b.totalRevenue - a.totalRevenue);
      
      return {
        brokers: brokerAnalytics,
        totalBrokers: brokerAnalytics.length,
        totalRevenue: brokerAnalytics.reduce((sum, b) => sum + b.totalRevenue, 0),
        totalTrips: brokerAnalytics.reduce((sum, b) => sum + b.tripCount, 0),
      };
    } catch (error) {
      console.error('Error getting broker analytics:', error);
      return {
        brokers: [],
        totalBrokers: 0,
        totalRevenue: 0,
        totalTrips: 0,
      };
    }
  }

  async getDispatcherPerformance(carrierId: string, startDate?: Date, endDate?: Date): Promise<DispatcherPerformance[]> {
    try {
      const dynamodbClient = this.tripsService['awsService'].getDynamoDBClient();
      const tripsTableName = this.tripsService['tripsTableName'];
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      let keyConditionExpression = 'GSI1PK = :carrierPK';
      const expressionAttributeValues: any = {
        ':carrierPK': `CARRIER#${carrierId}`,
      };
      
      if (startDate && endDate) {
        keyConditionExpression += ' AND GSI1SK BETWEEN :startDate AND :endDate';
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':startDate'] = startISO;
        expressionAttributeValues[':endDate'] = endISO;
      } else if (startDate) {
        keyConditionExpression += ' AND GSI1SK >= :startDate';
        const startISO = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0)).toISOString().split('.')[0] + 'Z#';
        expressionAttributeValues[':startDate'] = startISO;
      } else if (endDate) {
        keyConditionExpression += ' AND GSI1SK <= :endDate';
        const endISO = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString().split('.')[0] + 'Z#ZZZZ';
        expressionAttributeValues[':endDate'] = endISO;
      }
      
      const queryCommand = new QueryCommand({
        TableName: tripsTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      const result = await dynamodbClient.send(queryCommand);
      const trips = (result.Items || []).map(item => this.tripsService['mapItemToTrip'](item));
      
      const dispatcherMap = new Map<string, { trips: any[] }>();
      
      for (const trip of trips) {
        if (!dispatcherMap.has(trip.dispatcherId)) {
          dispatcherMap.set(trip.dispatcherId, { trips: [] });
        }
        dispatcherMap.get(trip.dispatcherId)!.trips.push(trip);
      }
      
      const usersTableName = this.tripsService['configService'].usersTableName;
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const dispatcherDetailsMap = new Map<string, any>();
      await Promise.all(
        Array.from(dispatcherMap.keys()).map(async (dispatcherId) => {
          try {
            const result = await dynamodbClient.send(new GetCommand({
              TableName: usersTableName,
              Key: { PK: `USER#${dispatcherId}`, SK: 'METADATA' },
            }));
            if (result.Item) {
              dispatcherDetailsMap.set(dispatcherId, result.Item);
            }
          } catch (error) {
            console.error(`Error fetching dispatcher ${dispatcherId}:`, error);
          }
        })
      );
      
      const performance: DispatcherPerformance[] = [];
      
      for (const [dispatcherId, data] of dispatcherMap.entries()) {
        const totalTrips = data.trips.length;
        const completedTrips = data.trips.filter(t => t.orderStatus === 'Delivered' || t.orderStatus === 'Paid').length;
        const totalRevenue = data.trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
        const totalExpenses = data.trips.reduce((sum, trip) => 
          sum + trip.driverPayment + trip.truckOwnerPayment + (trip.fuelCost || 0) + (trip.lumperValue || 0) + (trip.detentionValue || 0), 0
        );
        const totalProfit = totalRevenue - totalExpenses;
        const averageProfit = totalTrips > 0 ? totalProfit / totalTrips : 0;
        const completionRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
        
        const dispatcher = dispatcherDetailsMap.get(dispatcherId);
        const dispatcherName = dispatcher ? dispatcher.name : dispatcherId.substring(0, 8);
        
        performance.push({
          dispatcherId,
          dispatcherName,
          totalTrips,
          completedTrips,
          totalRevenue,
          totalProfit,
          averageProfit,
          completionRate,
        });
      }
      
      performance.sort((a, b) => b.totalProfit - a.totalProfit);
      
      return performance;
    } catch (error) {
      console.error('Error getting dispatcher performance:', error);
      return [];
    }
  }
}
