import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { Trip, TripStatus, CreateTripDto, UpdateTripDto, UserRole, PaymentReportFilters, PaymentReport } from '@haulhub/shared';
export declare class TripsService {
    private readonly awsService;
    private readonly configService;
    private readonly tableName;
    constructor(awsService: AwsService, configService: ConfigService);
    createTrip(dispatcherId: string, dto: CreateTripDto): Promise<Trip>;
    getTripById(tripId: string, userId: string, userRole: UserRole): Promise<Trip>;
    updateTrip(tripId: string, dispatcherId: string, dto: UpdateTripDto): Promise<Trip>;
    private getBrokerName;
    private validateCreateTripDto;
    updateTripStatus(tripId: string, userId: string, userRole: UserRole, newStatus: TripStatus): Promise<Trip>;
    private getTripForDriver;
    private validateStatusTransition;
    getTrips(userId: string, userRole: UserRole, filters: any): Promise<{
        trips: Trip[];
        lastEvaluatedKey?: string;
    }>;
    private getTripsForDispatcher;
    private getTripsForDriver;
    private getTripsForLorryOwner;
    private getApprovedLorriesForOwner;
    private getTripsForLorry;
    private buildSecondaryFilters;
    private mapItemToTrip;
    getPaymentReport(userId: string, role: UserRole, filters: PaymentReportFilters): Promise<PaymentReport>;
    private generateDispatcherReport;
    private generateDriverReport;
    private generateLorryOwnerReport;
    private groupByBroker;
    private groupByDriver;
    private groupByLorry;
    private groupByDispatcherForDriver;
    private groupByDispatcherForLorryOwner;
}
