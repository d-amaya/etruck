import { TripsService } from './trips.service';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { CreateTripDto, UpdateTripDto, UpdateTripStatusDto, TripFilters, Trip } from '@haulhub/shared';
export declare class TripsController {
    private readonly tripsService;
    constructor(tripsService: TripsService);
    createTrip(user: CurrentUserData, dto: CreateTripDto): Promise<Trip>;
    getTripById(user: CurrentUserData, tripId: string): Promise<Trip>;
    updateTrip(user: CurrentUserData, tripId: string, dto: UpdateTripDto): Promise<Trip>;
    updateTripStatus(user: CurrentUserData, tripId: string, dto: UpdateTripStatusDto): Promise<Trip>;
    getTrips(user: CurrentUserData, filters: TripFilters): Promise<{
        trips: Trip[];
        lastEvaluatedKey?: string;
    }>;
    getPaymentReport(user: CurrentUserData, filters: any): Promise<any>;
}
