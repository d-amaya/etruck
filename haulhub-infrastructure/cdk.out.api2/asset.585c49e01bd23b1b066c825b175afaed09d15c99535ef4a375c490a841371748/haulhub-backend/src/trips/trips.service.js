"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsService = void 0;
const common_1 = require("@nestjs/common");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
const shared_1 = require("@haulhub/shared");
const uuid_1 = require("uuid");
let TripsService = class TripsService {
    constructor(awsService, configService) {
        this.awsService = awsService;
        this.configService = configService;
        this.tableName = this.configService.dynamodbTableName;
    }
    async createTrip(dispatcherId, dto) {
        this.validateCreateTripDto(dto);
        const scheduledDate = new Date(dto.scheduledPickupDatetime);
        if (isNaN(scheduledDate.getTime())) {
            throw new common_1.BadRequestException('Invalid scheduledPickupDatetime format');
        }
        if (dto.brokerPayment <= 0) {
            throw new common_1.BadRequestException('brokerPayment must be a positive number');
        }
        if (dto.lorryOwnerPayment <= 0) {
            throw new common_1.BadRequestException('lorryOwnerPayment must be a positive number');
        }
        if (dto.driverPayment <= 0) {
            throw new common_1.BadRequestException('driverPayment must be a positive number');
        }
        const brokerName = await this.getBrokerName(dto.brokerId);
        const tripId = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const scheduledDateStr = scheduledDate.toISOString().split('T')[0];
        const trip = {
            tripId,
            dispatcherId,
            pickupLocation: dto.pickupLocation,
            dropoffLocation: dto.dropoffLocation,
            scheduledPickupDatetime: dto.scheduledPickupDatetime,
            brokerId: dto.brokerId,
            brokerName,
            lorryId: dto.lorryId,
            driverId: dto.driverId,
            driverName: dto.driverName,
            brokerPayment: dto.brokerPayment,
            lorryOwnerPayment: dto.lorryOwnerPayment,
            driverPayment: dto.driverPayment,
            status: shared_1.TripStatus.Scheduled,
            distance: dto.distance,
            createdAt: now,
            updatedAt: now,
        };
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            const putCommand = new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: {
                    PK: `DISPATCHER#${dispatcherId}`,
                    SK: `TRIP#${scheduledDateStr}#${tripId}`,
                    GSI1PK: `DRIVER#${dto.driverId}`,
                    GSI1SK: `TRIP#${scheduledDateStr}#${tripId}`,
                    GSI2PK: `LORRY#${dto.lorryId}`,
                    GSI2SK: `TRIP#${scheduledDateStr}#${tripId}`,
                    ...trip,
                },
            });
            await dynamodbClient.send(putCommand);
            return trip;
        }
        catch (error) {
            console.error('Error creating trip:', error);
            throw new common_1.InternalServerErrorException('Failed to create trip');
        }
    }
    async getTripById(tripId, userId, userRole) {
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            if (userRole === shared_1.UserRole.Dispatcher) {
                const queryCommand = new lib_dynamodb_1.QueryCommand({
                    TableName: this.tableName,
                    KeyConditionExpression: 'PK = :pk AND contains(SK, :tripId)',
                    ExpressionAttributeValues: {
                        ':pk': `DISPATCHER#${userId}`,
                        ':tripId': tripId,
                    },
                });
                const result = await dynamodbClient.send(queryCommand);
                if (!result.Items || result.Items.length === 0) {
                    throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
                }
                const trip = this.mapItemToTrip(result.Items[0]);
                if (trip.tripId !== tripId) {
                    throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
                }
                return trip;
            }
            throw new common_1.BadRequestException('Getting trip by ID for non-dispatcher roles requires scanning. Use GET /trips with filters instead.');
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error getting trip:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve trip');
        }
    }
    async updateTrip(tripId, dispatcherId, dto) {
        const existingTrip = await this.getTripById(tripId, dispatcherId, shared_1.UserRole.Dispatcher);
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (dto.pickupLocation !== undefined) {
            updateExpressions.push('#pickupLocation = :pickupLocation');
            expressionAttributeNames['#pickupLocation'] = 'pickupLocation';
            expressionAttributeValues[':pickupLocation'] = dto.pickupLocation;
        }
        if (dto.dropoffLocation !== undefined) {
            updateExpressions.push('#dropoffLocation = :dropoffLocation');
            expressionAttributeNames['#dropoffLocation'] = 'dropoffLocation';
            expressionAttributeValues[':dropoffLocation'] = dto.dropoffLocation;
        }
        if (dto.scheduledPickupDatetime !== undefined) {
            const scheduledDate = new Date(dto.scheduledPickupDatetime);
            if (isNaN(scheduledDate.getTime())) {
                throw new common_1.BadRequestException('Invalid scheduledPickupDatetime format');
            }
            updateExpressions.push('#scheduledPickupDatetime = :scheduledPickupDatetime');
            expressionAttributeNames['#scheduledPickupDatetime'] = 'scheduledPickupDatetime';
            expressionAttributeValues[':scheduledPickupDatetime'] = dto.scheduledPickupDatetime;
        }
        if (dto.brokerId !== undefined) {
            const brokerName = await this.getBrokerName(dto.brokerId);
            updateExpressions.push('#brokerId = :brokerId, #brokerName = :brokerName');
            expressionAttributeNames['#brokerId'] = 'brokerId';
            expressionAttributeNames['#brokerName'] = 'brokerName';
            expressionAttributeValues[':brokerId'] = dto.brokerId;
            expressionAttributeValues[':brokerName'] = brokerName;
        }
        if (dto.lorryId !== undefined) {
            updateExpressions.push('#lorryId = :lorryId');
            expressionAttributeNames['#lorryId'] = 'lorryId';
            expressionAttributeValues[':lorryId'] = dto.lorryId;
        }
        if (dto.driverId !== undefined) {
            updateExpressions.push('#driverId = :driverId');
            expressionAttributeNames['#driverId'] = 'driverId';
            expressionAttributeValues[':driverId'] = dto.driverId;
        }
        if (dto.driverName !== undefined) {
            updateExpressions.push('#driverName = :driverName');
            expressionAttributeNames['#driverName'] = 'driverName';
            expressionAttributeValues[':driverName'] = dto.driverName;
        }
        if (dto.brokerPayment !== undefined) {
            if (dto.brokerPayment <= 0) {
                throw new common_1.BadRequestException('brokerPayment must be a positive number');
            }
            updateExpressions.push('#brokerPayment = :brokerPayment');
            expressionAttributeNames['#brokerPayment'] = 'brokerPayment';
            expressionAttributeValues[':brokerPayment'] = dto.brokerPayment;
        }
        if (dto.lorryOwnerPayment !== undefined) {
            if (dto.lorryOwnerPayment <= 0) {
                throw new common_1.BadRequestException('lorryOwnerPayment must be a positive number');
            }
            updateExpressions.push('#lorryOwnerPayment = :lorryOwnerPayment');
            expressionAttributeNames['#lorryOwnerPayment'] = 'lorryOwnerPayment';
            expressionAttributeValues[':lorryOwnerPayment'] = dto.lorryOwnerPayment;
        }
        if (dto.driverPayment !== undefined) {
            if (dto.driverPayment <= 0) {
                throw new common_1.BadRequestException('driverPayment must be a positive number');
            }
            updateExpressions.push('#driverPayment = :driverPayment');
            expressionAttributeNames['#driverPayment'] = 'driverPayment';
            expressionAttributeValues[':driverPayment'] = dto.driverPayment;
        }
        if (dto.distance !== undefined) {
            updateExpressions.push('#distance = :distance');
            expressionAttributeNames['#distance'] = 'distance';
            expressionAttributeValues[':distance'] = dto.distance;
        }
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        if (updateExpressions.length === 1) {
            return existingTrip;
        }
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            const scheduledDateStr = existingTrip.scheduledPickupDatetime.split('T')[0];
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: {
                    PK: `DISPATCHER#${dispatcherId}`,
                    SK: `TRIP#${scheduledDateStr}#${tripId}`,
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
                ConditionExpression: 'attribute_exists(PK)',
            });
            const result = await dynamodbClient.send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
            }
            return this.mapItemToTrip(result.Attributes);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
            }
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error updating trip:', error);
            throw new common_1.InternalServerErrorException('Failed to update trip');
        }
    }
    async getBrokerName(brokerId) {
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            const getCommand = new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                },
            });
            const result = await dynamodbClient.send(getCommand);
            if (!result.Item) {
                throw new common_1.BadRequestException(`Broker with ID ${brokerId} not found`);
            }
            return result.Item.brokerName;
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error getting broker name:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve broker information');
        }
    }
    validateCreateTripDto(dto) {
        const requiredFields = [
            'pickupLocation',
            'dropoffLocation',
            'scheduledPickupDatetime',
            'brokerId',
            'lorryId',
            'driverId',
            'driverName',
            'brokerPayment',
            'lorryOwnerPayment',
            'driverPayment',
        ];
        for (const field of requiredFields) {
            if (dto[field] === undefined || dto[field] === null || dto[field] === '') {
                throw new common_1.BadRequestException(`${field} is required`);
            }
        }
    }
    async updateTripStatus(tripId, userId, userRole, newStatus) {
        let existingTrip;
        if (userRole === shared_1.UserRole.Dispatcher) {
            existingTrip = await this.getTripById(tripId, userId, shared_1.UserRole.Dispatcher);
        }
        else if (userRole === shared_1.UserRole.Driver) {
            existingTrip = await this.getTripForDriver(tripId, userId);
        }
        else {
            throw new common_1.ForbiddenException('Only dispatchers and drivers can update trip status');
        }
        this.validateStatusTransition(existingTrip.status, newStatus, userRole);
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        updateExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = newStatus;
        if (newStatus === shared_1.TripStatus.Delivered && !existingTrip.deliveredAt) {
            updateExpressions.push('#deliveredAt = :deliveredAt');
            expressionAttributeNames['#deliveredAt'] = 'deliveredAt';
            expressionAttributeValues[':deliveredAt'] = new Date().toISOString();
        }
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            const scheduledDateStr = existingTrip.scheduledPickupDatetime.split('T')[0];
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: {
                    PK: `DISPATCHER#${existingTrip.dispatcherId}`,
                    SK: `TRIP#${scheduledDateStr}#${tripId}`,
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
                ConditionExpression: 'attribute_exists(PK)',
            });
            const result = await dynamodbClient.send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
            }
            return this.mapItemToTrip(result.Attributes);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`Trip with ID ${tripId} not found`);
            }
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            console.error('Error updating trip status:', error);
            throw new common_1.InternalServerErrorException('Failed to update trip status');
        }
    }
    async getTripForDriver(tripId, driverId) {
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            const queryCommand = new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :gsi1pk',
                ExpressionAttributeValues: {
                    ':gsi1pk': `DRIVER#${driverId}`,
                },
            });
            const result = await dynamodbClient.send(queryCommand);
            if (!result.Items || result.Items.length === 0) {
                throw new common_1.ForbiddenException('You are not assigned to any trips');
            }
            const tripItem = result.Items.find((item) => item.tripId === tripId);
            if (!tripItem) {
                throw new common_1.ForbiddenException('You are not assigned to this trip');
            }
            return this.mapItemToTrip(tripItem);
        }
        catch (error) {
            if (error instanceof common_1.ForbiddenException) {
                throw error;
            }
            console.error('Error getting trip for driver:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve trip');
        }
    }
    validateStatusTransition(currentStatus, newStatus, userRole) {
        if (userRole === shared_1.UserRole.Driver && newStatus === shared_1.TripStatus.Paid) {
            throw new common_1.ForbiddenException('Drivers cannot update trip status to Paid');
        }
        if (userRole === shared_1.UserRole.Driver && newStatus === shared_1.TripStatus.Scheduled) {
            throw new common_1.ForbiddenException('Drivers cannot update trip status to Scheduled');
        }
        if (userRole === shared_1.UserRole.Dispatcher) {
            return;
        }
        const validDriverTransitions = {
            [shared_1.TripStatus.Scheduled]: [shared_1.TripStatus.PickedUp],
            [shared_1.TripStatus.PickedUp]: [shared_1.TripStatus.InTransit],
            [shared_1.TripStatus.InTransit]: [shared_1.TripStatus.Delivered],
            [shared_1.TripStatus.Delivered]: [],
            [shared_1.TripStatus.Paid]: [],
        };
        const allowedStatuses = validDriverTransitions[currentStatus];
        if (!allowedStatuses.includes(newStatus)) {
            throw new common_1.BadRequestException(`Invalid status transition from ${currentStatus} to ${newStatus}`);
        }
    }
    async getTrips(userId, userRole, filters) {
        try {
            const dynamodbClient = this.awsService.getDynamoDBClient();
            if (userRole === shared_1.UserRole.Dispatcher) {
                return await this.getTripsForDispatcher(userId, filters, dynamodbClient);
            }
            else if (userRole === shared_1.UserRole.Driver) {
                return await this.getTripsForDriver(userId, filters, dynamodbClient);
            }
            else if (userRole === shared_1.UserRole.LorryOwner) {
                return await this.getTripsForLorryOwner(userId, filters, dynamodbClient);
            }
            else {
                throw new common_1.ForbiddenException('Invalid role for trip queries');
            }
        }
        catch (error) {
            if (error instanceof common_1.ForbiddenException ||
                error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error getting trips:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve trips');
        }
    }
    async getTripsForDispatcher(dispatcherId, filters, dynamodbClient) {
        let keyConditionExpression = 'PK = :pk';
        const expressionAttributeValues = {
            ':pk': `DISPATCHER#${dispatcherId}`,
        };
        if (filters.startDate && filters.endDate) {
            keyConditionExpression += ' AND SK BETWEEN :startSk AND :endSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else if (filters.startDate) {
            keyConditionExpression += ' AND SK >= :startSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
        }
        else if (filters.endDate) {
            keyConditionExpression += ' AND SK <= :endSk';
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else {
            keyConditionExpression += ' AND begins_with(SK, :sk)';
            expressionAttributeValues[':sk'] = 'TRIP#';
        }
        const { filterExpression, filterAttributeNames, filterAttributeValues } = this.buildSecondaryFilters(filters);
        const queryParams = {
            TableName: this.tableName,
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ...filterAttributeValues,
            },
            Limit: filters.limit || 50,
        };
        if (filterExpression) {
            queryParams.FilterExpression = filterExpression;
            queryParams.ExpressionAttributeNames = filterAttributeNames;
        }
        if (filters.lastEvaluatedKey) {
            try {
                queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(filters.lastEvaluatedKey, 'base64').toString('utf-8'));
            }
            catch (error) {
                throw new common_1.BadRequestException('Invalid lastEvaluatedKey format');
            }
        }
        const queryCommand = new lib_dynamodb_1.QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);
        const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        const response = { trips };
        if (result.LastEvaluatedKey) {
            response.lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        }
        return response;
    }
    async getTripsForDriver(driverId, filters, dynamodbClient) {
        let keyConditionExpression = 'GSI1PK = :gsi1pk';
        const expressionAttributeValues = {
            ':gsi1pk': `DRIVER#${driverId}`,
        };
        if (filters.startDate && filters.endDate) {
            keyConditionExpression += ' AND GSI1SK BETWEEN :startSk AND :endSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else if (filters.startDate) {
            keyConditionExpression += ' AND GSI1SK >= :startSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
        }
        else if (filters.endDate) {
            keyConditionExpression += ' AND GSI1SK <= :endSk';
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else {
            keyConditionExpression += ' AND begins_with(GSI1SK, :sk)';
            expressionAttributeValues[':sk'] = 'TRIP#';
        }
        const { filterExpression, filterAttributeNames, filterAttributeValues } = this.buildSecondaryFilters(filters);
        const queryParams = {
            TableName: this.tableName,
            IndexName: 'GSI1',
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ...filterAttributeValues,
            },
            Limit: filters.limit || 50,
        };
        if (filterExpression) {
            queryParams.FilterExpression = filterExpression;
            queryParams.ExpressionAttributeNames = filterAttributeNames;
        }
        if (filters.lastEvaluatedKey) {
            try {
                queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(filters.lastEvaluatedKey, 'base64').toString('utf-8'));
            }
            catch (error) {
                throw new common_1.BadRequestException('Invalid lastEvaluatedKey format');
            }
        }
        const queryCommand = new lib_dynamodb_1.QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);
        const trips = (result.Items || []).map((item) => this.mapItemToTrip(item));
        const response = { trips };
        if (result.LastEvaluatedKey) {
            response.lastEvaluatedKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        }
        return response;
    }
    async getTripsForLorryOwner(ownerId, filters, dynamodbClient) {
        const lorries = await this.getApprovedLorriesForOwner(ownerId, dynamodbClient);
        if (lorries.length === 0) {
            return { trips: [] };
        }
        const lorryIdsToQuery = filters.lorryId
            ? lorries.filter((l) => l === filters.lorryId)
            : lorries;
        if (lorryIdsToQuery.length === 0) {
            return { trips: [] };
        }
        const allTrips = [];
        const limit = filters.limit || 50;
        for (const lorryId of lorryIdsToQuery) {
            const lorryTrips = await this.getTripsForLorry(lorryId, filters, dynamodbClient, limit - allTrips.length);
            allTrips.push(...lorryTrips);
            if (allTrips.length >= limit) {
                break;
            }
        }
        allTrips.sort((a, b) => new Date(b.scheduledPickupDatetime).getTime() -
            new Date(a.scheduledPickupDatetime).getTime());
        const trips = allTrips.slice(0, limit);
        return { trips };
    }
    async getApprovedLorriesForOwner(ownerId, dynamodbClient) {
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            FilterExpression: 'verificationStatus = :status',
            ExpressionAttributeValues: {
                ':pk': `LORRY_OWNER#${ownerId}`,
                ':sk': 'LORRY#',
                ':status': 'Approved',
            },
        });
        const result = await dynamodbClient.send(queryCommand);
        if (!result.Items || result.Items.length === 0) {
            return [];
        }
        return result.Items.map((item) => item.lorryId);
    }
    async getTripsForLorry(lorryId, filters, dynamodbClient, limit) {
        let keyConditionExpression = 'GSI2PK = :gsi2pk';
        const expressionAttributeValues = {
            ':gsi2pk': `LORRY#${lorryId}`,
        };
        if (filters.startDate && filters.endDate) {
            keyConditionExpression += ' AND GSI2SK BETWEEN :startSk AND :endSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else if (filters.startDate) {
            keyConditionExpression += ' AND GSI2SK >= :startSk';
            expressionAttributeValues[':startSk'] = `TRIP#${filters.startDate}`;
        }
        else if (filters.endDate) {
            keyConditionExpression += ' AND GSI2SK <= :endSk';
            expressionAttributeValues[':endSk'] = `TRIP#${filters.endDate}#ZZZZZZZZ`;
        }
        else {
            keyConditionExpression += ' AND begins_with(GSI2SK, :sk)';
            expressionAttributeValues[':sk'] = 'TRIP#';
        }
        const filtersWithoutLorry = { ...filters };
        delete filtersWithoutLorry.lorryId;
        const { filterExpression, filterAttributeNames, filterAttributeValues } = this.buildSecondaryFilters(filtersWithoutLorry);
        const queryParams = {
            TableName: this.tableName,
            IndexName: 'GSI2',
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ...filterAttributeValues,
            },
            Limit: limit,
        };
        if (filterExpression) {
            queryParams.FilterExpression = filterExpression;
            queryParams.ExpressionAttributeNames = filterAttributeNames;
        }
        const queryCommand = new lib_dynamodb_1.QueryCommand(queryParams);
        const result = await dynamodbClient.send(queryCommand);
        return (result.Items || []).map((item) => this.mapItemToTrip(item));
    }
    buildSecondaryFilters(filters) {
        const filterExpressions = [];
        const filterAttributeNames = {};
        const filterAttributeValues = {};
        if (filters.brokerId) {
            filterExpressions.push('#brokerId = :brokerId');
            filterAttributeNames['#brokerId'] = 'brokerId';
            filterAttributeValues[':brokerId'] = filters.brokerId;
        }
        if (filters.status) {
            filterExpressions.push('#status = :status');
            filterAttributeNames['#status'] = 'status';
            filterAttributeValues[':status'] = filters.status;
        }
        if (filters.lorryId) {
            filterExpressions.push('#lorryId = :lorryId');
            filterAttributeNames['#lorryId'] = 'lorryId';
            filterAttributeValues[':lorryId'] = filters.lorryId;
        }
        if (filters.driverId) {
            filterExpressions.push('#driverId = :driverId');
            filterAttributeNames['#driverId'] = 'driverId';
            filterAttributeValues[':driverId'] = filters.driverId;
        }
        return {
            filterExpression: filterExpressions.join(' AND '),
            filterAttributeNames,
            filterAttributeValues,
        };
    }
    mapItemToTrip(item) {
        return {
            tripId: item.tripId,
            dispatcherId: item.dispatcherId,
            pickupLocation: item.pickupLocation,
            dropoffLocation: item.dropoffLocation,
            scheduledPickupDatetime: item.scheduledPickupDatetime,
            brokerId: item.brokerId,
            brokerName: item.brokerName,
            lorryId: item.lorryId,
            driverId: item.driverId,
            driverName: item.driverName,
            brokerPayment: item.brokerPayment,
            lorryOwnerPayment: item.lorryOwnerPayment,
            driverPayment: item.driverPayment,
            status: item.status,
            distance: item.distance,
            deliveredAt: item.deliveredAt,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
    async getPaymentReport(userId, role, filters) {
        const tripFilters = {
            startDate: filters.startDate,
            endDate: filters.endDate,
            brokerId: filters.brokerId,
            lorryId: filters.lorryId,
            driverId: filters.driverId,
        };
        const { trips } = await this.getTrips(userId, role, tripFilters);
        const tripPaymentDetails = trips.map((trip) => ({
            tripId: trip.tripId,
            dispatcherId: trip.dispatcherId,
            scheduledPickupDatetime: trip.scheduledPickupDatetime,
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            brokerId: trip.brokerId,
            brokerName: trip.brokerName,
            lorryId: trip.lorryId,
            driverId: trip.driverId,
            driverName: trip.driverName,
            brokerPayment: trip.brokerPayment,
            lorryOwnerPayment: trip.lorryOwnerPayment,
            driverPayment: trip.driverPayment,
            distance: trip.distance,
            status: trip.status,
        }));
        switch (role) {
            case shared_1.UserRole.Dispatcher:
                return this.generateDispatcherReport(tripPaymentDetails, filters.groupBy);
            case shared_1.UserRole.Driver:
                return this.generateDriverReport(tripPaymentDetails, filters.groupBy);
            case shared_1.UserRole.LorryOwner:
                return this.generateLorryOwnerReport(tripPaymentDetails, filters.groupBy);
            default:
                throw new common_1.ForbiddenException('Invalid role for payment reports');
        }
    }
    generateDispatcherReport(trips, groupBy) {
        const totalBrokerPayments = trips.reduce((sum, trip) => sum + trip.brokerPayment, 0);
        const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
        const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
        const profit = totalBrokerPayments - totalDriverPayments - totalLorryOwnerPayments;
        const report = {
            totalBrokerPayments,
            totalDriverPayments,
            totalLorryOwnerPayments,
            profit,
            tripCount: trips.length,
            trips,
        };
        if (groupBy === 'broker') {
            report.groupedByBroker = this.groupByBroker(trips);
        }
        else if (groupBy === 'driver') {
            report.groupedByDriver = this.groupByDriver(trips);
        }
        else if (groupBy === 'lorry') {
            report.groupedByLorry = this.groupByLorry(trips);
        }
        return report;
    }
    generateDriverReport(trips, groupBy) {
        const totalDriverPayments = trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
        const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        const report = {
            totalDriverPayments,
            totalDistance,
            tripCount: trips.length,
            trips,
        };
        if (groupBy === 'dispatcher') {
            report.groupedByDispatcher = this.groupByDispatcherForDriver(trips);
        }
        return report;
    }
    generateLorryOwnerReport(trips, groupBy) {
        const totalLorryOwnerPayments = trips.reduce((sum, trip) => sum + trip.lorryOwnerPayment, 0);
        const report = {
            totalLorryOwnerPayments,
            tripCount: trips.length,
            trips,
        };
        if (groupBy === 'lorry') {
            report.groupedByLorry = this.groupByLorry(trips);
        }
        else if (groupBy === 'dispatcher') {
            report.groupedByDispatcher = this.groupByDispatcherForLorryOwner(trips);
        }
        return report;
    }
    groupByBroker(trips) {
        const grouped = {};
        for (const trip of trips) {
            if (!grouped[trip.brokerId]) {
                grouped[trip.brokerId] = {
                    brokerName: trip.brokerName,
                    totalPayment: 0,
                    tripCount: 0,
                };
            }
            grouped[trip.brokerId].totalPayment += trip.brokerPayment;
            grouped[trip.brokerId].tripCount += 1;
        }
        return grouped;
    }
    groupByDriver(trips) {
        const grouped = {};
        for (const trip of trips) {
            if (!grouped[trip.driverId]) {
                grouped[trip.driverId] = {
                    driverName: trip.driverName,
                    totalPayment: 0,
                    tripCount: 0,
                };
            }
            grouped[trip.driverId].totalPayment += trip.driverPayment;
            grouped[trip.driverId].tripCount += 1;
        }
        return grouped;
    }
    groupByLorry(trips) {
        const grouped = {};
        for (const trip of trips) {
            if (!grouped[trip.lorryId]) {
                grouped[trip.lorryId] = {
                    totalPayment: 0,
                    tripCount: 0,
                };
            }
            grouped[trip.lorryId].totalPayment += trip.lorryOwnerPayment;
            grouped[trip.lorryId].tripCount += 1;
        }
        return grouped;
    }
    groupByDispatcherForDriver(trips) {
        const grouped = {};
        for (const trip of trips) {
            const dispatcherId = trip.dispatcherId;
            if (!grouped[dispatcherId]) {
                grouped[dispatcherId] = {
                    totalPayment: 0,
                    tripCount: 0,
                };
            }
            grouped[dispatcherId].totalPayment += trip.driverPayment;
            grouped[dispatcherId].tripCount += 1;
        }
        return grouped;
    }
    groupByDispatcherForLorryOwner(trips) {
        const grouped = {};
        for (const trip of trips) {
            const dispatcherId = trip.dispatcherId;
            if (!grouped[dispatcherId]) {
                grouped[dispatcherId] = {
                    totalPayment: 0,
                    tripCount: 0,
                };
            }
            grouped[dispatcherId].totalPayment += trip.lorryOwnerPayment;
            grouped[dispatcherId].tripCount += 1;
        }
        return grouped;
    }
};
exports.TripsService = TripsService;
exports.TripsService = TripsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService])
], TripsService);
//# sourceMappingURL=trips.service.js.map