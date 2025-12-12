import { Injectable } from '@nestjs/common';
import { TripsService } from '../trips/trips.service';
import { UserRole, EnhancedTrip } from '@haulhub/shared';

export interface FuelPriceData {
  date: string;
  pricePerGallon: number;
  location: string;
  fuelType: 'diesel' | 'gasoline';
}

export interface FuelEfficiencyReport {
  vehicleId: string;
  vehicleNumber: string;
  totalMiles: number;
  totalFuelCost: number;
  estimatedGallonsUsed: number;
  milesPerGallon: number;
  fuelCostPerMile: number;
  efficiencyRating: 'excellent' | 'good' | 'average' | 'poor';
}

export interface FuelCostAnalysis {
  totalFuelCost: number;
  averageFuelPrice: number;
  totalGallonsUsed: number;
  totalMiles: number;
  overallMPG: number;
  costPerMile: number;
  monthlyBreakdown: Array<{
    month: string;
    fuelCost: number;
    gallonsUsed: number;
    miles: number;
    averagePrice: number;
  }>;
}

export interface FuelOptimizationSuggestion {
  type: 'route' | 'vehicle' | 'driving' | 'maintenance';
  title: string;
  description: string;
  potentialSavings: number;
  priority: 'high' | 'medium' | 'low';
}

@Injectable()
export class FuelService {
  constructor(
    private readonly tripsService: TripsService,
  ) {}

  /**
   * Get current fuel prices by location
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async getFuelPrices(location?: string, fuelType?: 'diesel' | 'gasoline'): Promise<FuelPriceData[]> {
    // In a real implementation, this would fetch from a fuel price API
    // For now, return mock data
    const mockPrices: FuelPriceData[] = [
      {
        date: new Date().toISOString().split('T')[0],
        pricePerGallon: 3.45,
        location: 'National Average',
        fuelType: 'diesel',
      },
      {
        date: new Date().toISOString().split('T')[0],
        pricePerGallon: 3.25,
        location: 'Texas',
        fuelType: 'diesel',
      },
      {
        date: new Date().toISOString().split('T')[0],
        pricePerGallon: 3.65,
        location: 'California',
        fuelType: 'diesel',
      },
      {
        date: new Date().toISOString().split('T')[0],
        pricePerGallon: 3.15,
        location: 'National Average',
        fuelType: 'gasoline',
      },
    ];

    let filteredPrices = mockPrices;

    if (location) {
      filteredPrices = filteredPrices.filter(price => 
        price.location.toLowerCase().includes(location.toLowerCase())
      );
    }

    if (fuelType) {
      filteredPrices = filteredPrices.filter(price => price.fuelType === fuelType);
    }

    return filteredPrices;
  }

  /**
   * Calculate fuel efficiency for vehicles
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   * 
   * Note: Currently works with basic Trip interface. Will be enhanced when
   * trips service is updated to return EnhancedTrip with fuel cost fields.
   */
  async calculateVehicleFuelEfficiency(
    userId: string,
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date
  ): Promise<FuelEfficiencyReport[]> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    // Group trips by lorry (using lorryId from Trip)
    const vehicleTrips = new Map<string, any[]>();
    trips.forEach((trip: any) => {
      if (trip.lorryId) {
        if (!vehicleTrips.has(trip.lorryId)) {
          vehicleTrips.set(trip.lorryId, []);
        }
        vehicleTrips.get(trip.lorryId)!.push(trip);
      }
    });

    const reports: FuelEfficiencyReport[] = [];

    for (const [vehicleId, vehicleTripsData] of vehicleTrips.entries()) {
      const totalMiles = vehicleTripsData.reduce((sum, trip) => sum + (trip.distance || 0), 0);
      
      // Calculate estimated fuel cost based on distance and average fuel price
      // Using industry average of 6.5 MPG for trucks and $3.45/gallon diesel
      const averageFuelPrice = 3.45;
      const averageMPG = 6.5;
      const estimatedGallonsUsed = totalMiles / averageMPG;
      const totalFuelCost = estimatedGallonsUsed * averageFuelPrice;
      
      const milesPerGallon = estimatedGallonsUsed > 0 ? totalMiles / estimatedGallonsUsed : 0;
      const fuelCostPerMile = totalMiles > 0 ? totalFuelCost / totalMiles : 0;

      let efficiencyRating: 'excellent' | 'good' | 'average' | 'poor' = 'poor';
      if (milesPerGallon >= 8) efficiencyRating = 'excellent';
      else if (milesPerGallon >= 7) efficiencyRating = 'good';
      else if (milesPerGallon >= 6) efficiencyRating = 'average';

      reports.push({
        vehicleId,
        vehicleNumber: vehicleId, // Use vehicleId as number for now
        totalMiles,
        totalFuelCost,
        estimatedGallonsUsed,
        milesPerGallon,
        fuelCostPerMile,
        efficiencyRating,
      });
    }

    return reports.sort((a, b) => b.milesPerGallon - a.milesPerGallon);
  }

  /**
   * Generate comprehensive fuel cost analysis
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   * 
   * Note: Currently works with basic Trip interface. Will be enhanced when
   * trips service is updated to return EnhancedTrip with fuel cost fields.
   */
  async generateFuelCostAnalysis(
    userId: string,
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date
  ): Promise<FuelCostAnalysis> {
    const filters: any = {};
    if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
    if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

    const { trips } = await this.tripsService.getTrips(userId, userRole, filters);

    const totalMiles = trips.reduce((sum, trip: any) => sum + (trip.distance || 0), 0);
    
    // Calculate estimated fuel cost based on distance and average fuel price
    // Using industry average of 6.5 MPG for trucks and $3.45/gallon diesel
    const averageFuelPrice = 3.45;
    const averageMPG = 6.5;
    const totalGallonsUsed = totalMiles / averageMPG;
    const totalFuelCost = totalGallonsUsed * averageFuelPrice;
    
    const overallMPG = totalGallonsUsed > 0 ? totalMiles / totalGallonsUsed : 0;
    const costPerMile = totalMiles > 0 ? totalFuelCost / totalMiles : 0;

    // Group by month
    const monthlyData = new Map<string, {
      fuelCost: number;
      miles: number;
      tripCount: number;
    }>();

    trips.forEach((trip: any) => {
      const date = new Date(trip.scheduledPickupDatetime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { fuelCost: 0, miles: 0, tripCount: 0 });
      }
      
      const data = monthlyData.get(monthKey)!;
      const tripMiles = trip.distance || 0;
      const tripGallons = tripMiles / averageMPG;
      const tripFuelCost = tripGallons * averageFuelPrice;
      
      data.fuelCost += tripFuelCost;
      data.miles += tripMiles;
      data.tripCount += 1;
    });

    const monthlyBreakdown = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        fuelCost: data.fuelCost,
        gallonsUsed: data.fuelCost / averageFuelPrice,
        miles: data.miles,
        averagePrice: averageFuelPrice,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalFuelCost,
      averageFuelPrice,
      totalGallonsUsed,
      totalMiles,
      overallMPG,
      costPerMile,
      monthlyBreakdown,
    };
  }

  /**
   * Get fuel optimization suggestions
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async getFuelOptimizationSuggestions(
    userId: string,
    userRole: UserRole
  ): Promise<FuelOptimizationSuggestion[]> {
    const efficiencyReports = await this.calculateVehicleFuelEfficiency(userId, userRole);
    const costAnalysis = await this.generateFuelCostAnalysis(userId, userRole);

    const suggestions: FuelOptimizationSuggestion[] = [];

    // Vehicle efficiency suggestions
    const poorPerformingVehicles = efficiencyReports.filter(report => 
      report.efficiencyRating === 'poor' || report.efficiencyRating === 'average'
    );

    if (poorPerformingVehicles.length > 0) {
      suggestions.push({
        type: 'vehicle',
        title: 'Vehicle Maintenance Required',
        description: `${poorPerformingVehicles.length} vehicle(s) showing poor fuel efficiency. Consider maintenance or replacement.`,
        potentialSavings: poorPerformingVehicles.length * 500, // Estimated monthly savings
        priority: 'high',
      });
    }

    // Route optimization
    if (costAnalysis.overallMPG < 6.5) {
      suggestions.push({
        type: 'route',
        title: 'Route Optimization Needed',
        description: 'Overall fleet MPG is below industry average. Consider route optimization software.',
        potentialSavings: costAnalysis.totalFuelCost * 0.15, // 15% potential savings
        priority: 'high',
      });
    }

    // Driving behavior
    suggestions.push({
      type: 'driving',
      title: 'Driver Training Program',
      description: 'Implement fuel-efficient driving training to improve MPG by 5-10%.',
      potentialSavings: costAnalysis.totalFuelCost * 0.075, // 7.5% potential savings
      priority: 'medium',
    });

    // Maintenance scheduling
    suggestions.push({
      type: 'maintenance',
      title: 'Preventive Maintenance Schedule',
      description: 'Regular maintenance can improve fuel efficiency by 3-5%.',
      potentialSavings: costAnalysis.totalFuelCost * 0.04, // 4% potential savings
      priority: 'medium',
    });

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Track fuel price trends
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async getFuelPriceTrends(
    location?: string,
    fuelType?: 'diesel' | 'gasoline',
    days: number = 30
  ): Promise<Array<{
    date: string;
    price: number;
    change: number;
    changePercent: number;
  }>> {
    // In a real implementation, this would fetch historical data
    // For now, generate mock trend data
    const trends: Array<{
      date: string;
      price: number;
      change: number;
      changePercent: number;
    }> = [];

    const basePrice = fuelType === 'gasoline' ? 3.15 : 3.45;
    let currentPrice = basePrice;

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Simulate price fluctuation
      const change = (Math.random() - 0.5) * 0.1; // ±$0.05 daily change
      const newPrice = Math.max(2.5, currentPrice + change);
      const priceChange = newPrice - currentPrice;
      const changePercent = currentPrice > 0 ? (priceChange / currentPrice) * 100 : 0;

      trends.push({
        date: date.toISOString().split('T')[0],
        price: Math.round(newPrice * 100) / 100,
        change: Math.round(priceChange * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
      });

      currentPrice = newPrice;
    }

    return trends;
  }
}