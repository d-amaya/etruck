import { TripStatus } from '../enums/trip-status.enum';
export interface Trip {
    tripId: string;
    dispatcherId: string;
    pickupLocation: string;
    dropoffLocation: string;
    scheduledPickupDatetime: string;
    brokerId: string;
    brokerName: string;
    lorryId: string;
    driverId: string;
    driverName: string;
    brokerPayment: number;
    lorryOwnerPayment: number;
    driverPayment: number;
    status: TripStatus;
    distance?: number;
    deliveredAt?: string;
    createdAt: string;
    updatedAt: string;
}
