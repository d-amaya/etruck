import { TripStatus } from '../enums/trip-status.enum';
export declare class CreateTripDto {
    pickupLocation: string;
    dropoffLocation: string;
    scheduledPickupDatetime: string;
    brokerId: string;
    lorryId: string;
    driverId: string;
    driverName: string;
    brokerPayment: number;
    lorryOwnerPayment: number;
    driverPayment: number;
    distance?: number;
}
export declare class UpdateTripDto {
    pickupLocation?: string;
    dropoffLocation?: string;
    scheduledPickupDatetime?: string;
    brokerId?: string;
    lorryId?: string;
    driverId?: string;
    driverName?: string;
    brokerPayment?: number;
    lorryOwnerPayment?: number;
    driverPayment?: number;
    distance?: number;
}
export declare class UpdateTripStatusDto {
    status: TripStatus;
}
export declare class TripFilters {
    startDate?: string;
    endDate?: string;
    brokerId?: string;
    lorryId?: string;
    driverId?: string;
    status?: TripStatus;
    limit?: number;
    lastEvaluatedKey?: string;
}
