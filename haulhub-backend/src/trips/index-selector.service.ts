import { Injectable, Logger } from '@nestjs/common';

/**
 * Interface for trip filters used in index selection
 */
export interface TripFilters {
  dispatcherId: string;
  startDate: string;      // YYYY-MM-DD or ISO 8601 (required)
  endDate: string;        // YYYY-MM-DD or ISO 8601 (required)
  status?: string;        // Optional: 'Scheduled' | 'PickedUp' | 'InTransit' | 'Delivered' | 'Paid'
  brokerId?: string;      // Optional
  lorryId?: string;       // Optional
  driverId?: string;      // Optional
  driverName?: string;    // Optional (filtered in application layer)
}

/**
 * Interface for index selection strategy result
 */
export interface IndexSelectionStrategy {
  indexName: 'GSI1' | 'GSI2' | 'GSI3' | 'GSI4';
  estimatedReads: number;
  filterExpressionAttributes: string[];
  rationale: string;
}

/**
 * Service for selecting the optimal DynamoDB GSI based on filter selectivity
 * 
 * Requirements: 1.4, 2.4, 3.2, 3.3, 3.4, 3.5, 3.6
 * 
 * Selection Priority (highest to lowest selectivity):
 * 1. GSI2: When lorryId filter is provided (~20 items per lorry)
 * 2. GSI3: When driverId filter is provided (no lorryId) (~50 items per driver)
 * 3. GSI4: When brokerId filter is provided (no lorry/driver) (~200 items per broker)
 * 4. GSI1: Default when only date/status filters provided (~10,000 items)
 * 
 * The service logs selection decisions with filter details and estimated read counts
 * for performance monitoring and optimization analysis.
 */
@Injectable()
export class IndexSelectorService {
  private readonly logger = new Logger(IndexSelectorService.name);

  // Estimated average trip counts per entity (based on requirements analysis)
  private readonly ESTIMATED_TRIPS_PER_LORRY = 20;
  private readonly ESTIMATED_TRIPS_PER_DRIVER = 50;
  private readonly ESTIMATED_TRIPS_PER_BROKER = 200;
  private readonly ESTIMATED_TRIPS_PER_DISPATCHER = 10000;

  /**
   * Selects the optimal GSI based on filter selectivity
   * 
   * Requirements: 1.4, 2.4, 3.2, 3.3, 3.4, 3.5
   * 
   * Priority: driverId > brokerId > default (dispatcher)
   * 
   * @param filters - Trip filters including optional truckId, driverId, brokerId
   * @returns IndexSelectionStrategy with selected index, estimated reads, and rationale
   */
  selectOptimalIndex(filters: TripFilters): IndexSelectionStrategy {
    let strategy: IndexSelectionStrategy;

    // Priority 1: Driver filter (high selectivity)
    // Requirements: 3.3
    if (filters.driverId) {
      strategy = {
        indexName: 'GSI3',
        estimatedReads: this.ESTIMATED_TRIPS_PER_DRIVER,
        filterExpressionAttributes: this.getFilterExpressionAttributes(filters, ['driverId']),
        rationale: `Selected GSI3 index due to driverId filter. High selectivity (~${this.ESTIMATED_TRIPS_PER_DRIVER} items per driver).`,
      };
    }
    // Priority 2: Broker filter (medium selectivity)
    // Requirements: 3.4
    else if (filters.brokerId) {
      strategy = {
        indexName: 'GSI4',
        estimatedReads: this.ESTIMATED_TRIPS_PER_BROKER,
        filterExpressionAttributes: this.getFilterExpressionAttributes(filters, ['brokerId']),
        rationale: `Selected GSI4 index due to brokerId filter. Medium selectivity (~${this.ESTIMATED_TRIPS_PER_BROKER} items per broker).`,
      };
    }
    // Priority 4: Default index (low selectivity)
    // Requirements: 3.5
    else {
      strategy = {
        indexName: 'GSI1',
        estimatedReads: this.ESTIMATED_TRIPS_PER_DISPATCHER,
        filterExpressionAttributes: this.getFilterExpressionAttributes(filters, []),
        rationale: `Selected GSI1 default index. Only date/status filters provided. Low selectivity (~${this.ESTIMATED_TRIPS_PER_DISPATCHER} items).`,
      };
    }

    // Log selection decision with filter details and estimated reads
    // Requirements: 3.6
    this.logIndexSelection(filters, strategy);

    return strategy;
  }

  /**
   * Determines which filter attributes will be applied in FilterExpression
   * (i.e., not in KeyConditionExpression)
   * 
   * @param filters - Trip filters
   * @param keyConditionAttributes - Attributes already used in KeyConditionExpression
   * @returns Array of attribute names that will be in FilterExpression
   */
  private getFilterExpressionAttributes(
    filters: TripFilters,
    keyConditionAttributes: string[],
  ): string[] {
    const filterAttributes: string[] = [];

    // Date range is always in KeyConditionExpression (via sort key)
    // dispatcherId is always in KeyConditionExpression (via partition key)

    // Check which attributes will need FilterExpression
    if (filters.brokerId && !keyConditionAttributes.includes('brokerId')) {
      filterAttributes.push('brokerId');
    }

    if (filters.lorryId && !keyConditionAttributes.includes('lorryId')) {
      filterAttributes.push('lorryId');
    }

    if (filters.driverId && !keyConditionAttributes.includes('driverId')) {
      filterAttributes.push('driverId');
    }

    if (filters.status) {
      filterAttributes.push('status');
    }

    // Note: driverName is filtered in application layer, not in DynamoDB
    if (filters.driverName) {
      filterAttributes.push('driverName (application-layer)');
    }

    return filterAttributes;
  }

  /**
   * Logs index selection decision with comprehensive details
   * 
   * Requirements: 3.6, 6.4
   * 
   * Logs include:
   * - Selected index name
   * - Filter details (which filters were provided)
   * - Estimated read count
   * - Rationale for selection
   * - Attributes that will use FilterExpression
   * 
   * This structured logging enables performance analysis and optimization
   */
  private logIndexSelection(
    filters: TripFilters,
    strategy: IndexSelectionStrategy,
  ): void {
    // Logging disabled for cleaner console output
    // Uncomment below for debugging index selection
    /*
    const logData = {
      selectedIndex: strategy.indexName,
      estimatedReads: strategy.estimatedReads,
      rationale: strategy.rationale,
      filters: {
        dispatcherId: filters.dispatcherId,
        dateRange: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
        lorryId: filters.lorryId || null,
        driverId: filters.driverId || null,
        brokerId: filters.brokerId || null,
        status: filters.status || null,
        driverName: filters.driverName || null,
      },
      filterExpressionAttributes: strategy.filterExpressionAttributes,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `Index selection: ${strategy.indexName} | Estimated reads: ${strategy.estimatedReads} | ${strategy.rationale}`,
      JSON.stringify(logData, null, 2),
    );
    */
  }
}
