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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
const shared_1 = require("@haulhub/shared");
let AdminService = class AdminService {
    constructor(awsService, configService) {
        this.awsService = awsService;
        this.configService = configService;
        this.tableName = this.configService.dynamodbTableName;
    }
    async getPendingLorries() {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        try {
            const pendingQuery = new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'GSI3',
                KeyConditionExpression: 'GSI3PK = :gsi3pk',
                ExpressionAttributeValues: {
                    ':gsi3pk': `LORRY_STATUS#${shared_1.LorryVerificationStatus.Pending}`,
                },
            });
            const pendingResult = await dynamodbClient.send(pendingQuery);
            const needsMoreEvidenceQuery = new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'GSI3',
                KeyConditionExpression: 'GSI3PK = :gsi3pk',
                ExpressionAttributeValues: {
                    ':gsi3pk': `LORRY_STATUS#${shared_1.LorryVerificationStatus.NeedsMoreEvidence}`,
                },
            });
            const needsMoreEvidenceResult = await dynamodbClient.send(needsMoreEvidenceQuery);
            const allItems = [
                ...(pendingResult.Items || []),
                ...(needsMoreEvidenceResult.Items || []),
            ];
            return allItems.map((item) => this.mapItemToLorry(item));
        }
        catch (error) {
            console.error('Error getting pending lorries:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve pending lorries');
        }
    }
    async verifyLorry(lorryId, dto) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const validDecisions = ['Approved', 'Rejected', 'NeedsMoreEvidence'];
        if (!validDecisions.includes(dto.decision)) {
            throw new common_1.BadRequestException(`Invalid decision. Must be one of: ${validDecisions.join(', ')}`);
        }
        if ((dto.decision === 'Rejected' || dto.decision === 'NeedsMoreEvidence') &&
            (!dto.reason || dto.reason.trim().length === 0)) {
            throw new common_1.BadRequestException(`Rejection reason is required when decision is ${dto.decision}`);
        }
        try {
            const findLorryQuery = new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'GSI3',
                KeyConditionExpression: 'GSI3SK = :gsi3sk',
                ExpressionAttributeValues: {
                    ':gsi3sk': `LORRY#${lorryId}`,
                },
            });
            const findResult = await dynamodbClient.send(findLorryQuery);
            if (!findResult.Items || findResult.Items.length === 0) {
                throw new common_1.NotFoundException(`Lorry with ID ${lorryId} not found`);
            }
            const lorryItem = findResult.Items[0];
            const ownerId = lorryItem.ownerId;
            const currentStatus = lorryItem.verificationStatus;
            const newStatus = dto.decision;
            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            updateExpressions.push('#verificationStatus = :verificationStatus');
            expressionAttributeNames['#verificationStatus'] = 'verificationStatus';
            expressionAttributeValues[':verificationStatus'] = newStatus;
            updateExpressions.push('#GSI3PK = :gsi3pk');
            expressionAttributeNames['#GSI3PK'] = 'GSI3PK';
            expressionAttributeValues[':gsi3pk'] = `LORRY_STATUS#${newStatus}`;
            if (dto.decision === 'Rejected' || dto.decision === 'NeedsMoreEvidence') {
                updateExpressions.push('#rejectionReason = :rejectionReason');
                expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
                expressionAttributeValues[':rejectionReason'] = dto.reason;
            }
            else if (dto.decision === 'Approved') {
                updateExpressions.push('REMOVE #rejectionReason');
                expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
            }
            updateExpressions.push('#updatedAt = :updatedAt');
            expressionAttributeNames['#updatedAt'] = 'updatedAt';
            expressionAttributeValues[':updatedAt'] = new Date().toISOString();
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: {
                    PK: `LORRY_OWNER#${ownerId}`,
                    SK: `LORRY#${lorryId}`,
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
                ConditionExpression: 'attribute_exists(PK)',
            });
            const result = await dynamodbClient.send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException(`Lorry with ID ${lorryId} not found`);
            }
            return this.mapItemToLorry(result.Attributes);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`Lorry with ID ${lorryId} not found`);
            }
            if (error instanceof common_1.NotFoundException ||
                error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error verifying lorry:', error);
            throw new common_1.InternalServerErrorException('Failed to verify lorry');
        }
    }
    mapItemToLorry(item) {
        return {
            lorryId: item.lorryId,
            ownerId: item.ownerId,
            make: item.make,
            model: item.model,
            year: item.year,
            verificationStatus: item.verificationStatus,
            verificationDocuments: item.verificationDocuments || [],
            rejectionReason: item.rejectionReason,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
    async getPendingUsers() {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        try {
            const scanCommand = new lib_dynamodb_1.ScanCommand({
                TableName: this.tableName,
                FilterExpression: 'begins_with(PK, :pkPrefix) AND SK = :sk AND #verificationStatus = :status',
                ExpressionAttributeNames: {
                    '#verificationStatus': 'verificationStatus',
                },
                ExpressionAttributeValues: {
                    ':pkPrefix': 'USER#',
                    ':sk': 'PROFILE',
                    ':status': shared_1.VerificationStatus.Pending,
                },
            });
            const result = await dynamodbClient.send(scanCommand);
            return (result.Items || []).map((item) => this.mapItemToUser(item));
        }
        catch (error) {
            console.error('Error getting pending users:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve pending users');
        }
    }
    async verifyUser(userId, dto) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const validDecisions = ['Verified', 'Rejected'];
        if (!validDecisions.includes(dto.decision)) {
            throw new common_1.BadRequestException(`Invalid decision. Must be one of: ${validDecisions.join(', ')}`);
        }
        if (dto.decision === 'Rejected' &&
            (!dto.reason || dto.reason.trim().length === 0)) {
            throw new common_1.BadRequestException('Rejection reason is required when decision is Rejected');
        }
        try {
            const getCommand = new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: 'PROFILE',
                },
            });
            const getResult = await dynamodbClient.send(getCommand);
            if (!getResult.Item) {
                throw new common_1.NotFoundException(`User with ID ${userId} not found`);
            }
            const newStatus = dto.decision;
            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            updateExpressions.push('#verificationStatus = :verificationStatus');
            expressionAttributeNames['#verificationStatus'] = 'verificationStatus';
            expressionAttributeValues[':verificationStatus'] = newStatus;
            if (dto.decision === 'Rejected') {
                updateExpressions.push('#rejectionReason = :rejectionReason');
                expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
                expressionAttributeValues[':rejectionReason'] = dto.reason;
            }
            else if (dto.decision === 'Verified') {
                updateExpressions.push('REMOVE #rejectionReason');
                expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
            }
            updateExpressions.push('#updatedAt = :updatedAt');
            expressionAttributeNames['#updatedAt'] = 'updatedAt';
            expressionAttributeValues[':updatedAt'] = new Date().toISOString();
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: 'PROFILE',
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
                ConditionExpression: 'attribute_exists(PK)',
            });
            const result = await dynamodbClient.send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException(`User with ID ${userId} not found`);
            }
            return this.mapItemToUser(result.Attributes);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`User with ID ${userId} not found`);
            }
            if (error instanceof common_1.NotFoundException ||
                error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('Error verifying user:', error);
            throw new common_1.InternalServerErrorException('Failed to verify user');
        }
    }
    mapItemToUser(item) {
        return {
            userId: item.userId,
            email: item.email,
            fullName: item.fullName,
            phoneNumber: item.phoneNumber,
            role: item.role,
            verificationStatus: item.verificationStatus,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService])
], AdminService);
//# sourceMappingURL=admin.service.js.map