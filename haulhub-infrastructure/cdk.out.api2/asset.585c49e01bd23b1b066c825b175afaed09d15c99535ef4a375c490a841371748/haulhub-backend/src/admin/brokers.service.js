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
exports.BrokersService = void 0;
const common_1 = require("@nestjs/common");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
const uuid_1 = require("uuid");
let BrokersService = class BrokersService {
    constructor(awsService, configService) {
        this.awsService = awsService;
        this.configService = configService;
    }
    async getAllBrokers(activeOnly = false) {
        try {
            const queryCommand = new lib_dynamodb_1.QueryCommand({
                TableName: this.configService.dynamodbTableName,
                KeyConditionExpression: 'begins_with(PK, :pk)',
                ExpressionAttributeValues: {
                    ':pk': 'BROKER#',
                },
            });
            const result = await this.awsService.getDynamoDBClient().send(queryCommand);
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            let brokers = result.Items.map((item) => this.mapDynamoDBItemToBroker(item));
            if (activeOnly) {
                brokers = brokers.filter((broker) => broker.isActive);
            }
            return brokers;
        }
        catch (error) {
            console.error('Error getting brokers:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve brokers');
        }
    }
    async getBrokerById(brokerId) {
        try {
            const getCommand = new lib_dynamodb_1.GetCommand({
                TableName: this.configService.dynamodbTableName,
                Key: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                },
            });
            const result = await this.awsService.getDynamoDBClient().send(getCommand);
            if (!result.Item) {
                throw new common_1.NotFoundException(`Broker with ID ${brokerId} not found`);
            }
            return this.mapDynamoDBItemToBroker(result.Item);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            console.error('Error getting broker:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve broker');
        }
    }
    async createBroker(createBrokerDto) {
        const brokerId = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const broker = {
            brokerId,
            brokerName: createBrokerDto.brokerName,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        };
        try {
            const putCommand = new lib_dynamodb_1.PutCommand({
                TableName: this.configService.dynamodbTableName,
                Item: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                    ...broker,
                },
            });
            await this.awsService.getDynamoDBClient().send(putCommand);
            return broker;
        }
        catch (error) {
            console.error('Error creating broker:', error);
            throw new common_1.InternalServerErrorException('Failed to create broker');
        }
    }
    async updateBroker(brokerId, updateBrokerDto) {
        const { brokerName, isActive } = updateBrokerDto;
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (brokerName !== undefined) {
            updateExpressions.push('#brokerName = :brokerName');
            expressionAttributeNames['#brokerName'] = 'brokerName';
            expressionAttributeValues[':brokerName'] = brokerName;
        }
        if (isActive !== undefined) {
            updateExpressions.push('#isActive = :isActive');
            expressionAttributeNames['#isActive'] = 'isActive';
            expressionAttributeValues[':isActive'] = isActive;
        }
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        if (updateExpressions.length === 1) {
            return this.getBrokerById(brokerId);
        }
        try {
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.configService.dynamodbTableName,
                Key: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
                ConditionExpression: 'attribute_exists(PK)',
            });
            const result = await this.awsService.getDynamoDBClient().send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException(`Broker with ID ${brokerId} not found`);
            }
            return this.mapDynamoDBItemToBroker(result.Attributes);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`Broker with ID ${brokerId} not found`);
            }
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            console.error('Error updating broker:', error);
            throw new common_1.InternalServerErrorException('Failed to update broker');
        }
    }
    async deleteBroker(brokerId) {
        try {
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.configService.dynamodbTableName,
                Key: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                },
                UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#isActive': 'isActive',
                    '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                    ':isActive': false,
                    ':updatedAt': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(PK)',
            });
            await this.awsService.getDynamoDBClient().send(updateCommand);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new common_1.NotFoundException(`Broker with ID ${brokerId} not found`);
            }
            console.error('Error deleting broker:', error);
            throw new common_1.InternalServerErrorException('Failed to delete broker');
        }
    }
    async seedBrokers() {
        const initialBrokers = [
            { brokerName: 'TQL (Total Quality Logistics)' },
            { brokerName: 'C.H. Robinson' },
            { brokerName: 'XPO Logistics' },
            { brokerName: 'Coyote Logistics' },
            { brokerName: 'Echo Global Logistics' },
        ];
        try {
            const existingBrokers = await this.getAllBrokers();
            if (existingBrokers.length > 0) {
                console.log('Brokers already seeded, skipping...');
                return;
            }
            for (const brokerData of initialBrokers) {
                await this.createBroker(brokerData);
            }
            console.log(`Successfully seeded ${initialBrokers.length} brokers`);
        }
        catch (error) {
            console.error('Error seeding brokers:', error);
        }
    }
    mapDynamoDBItemToBroker(item) {
        return {
            brokerId: item.brokerId,
            brokerName: item.brokerName,
            isActive: item.isActive,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
};
exports.BrokersService = BrokersService;
exports.BrokersService = BrokersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService])
], BrokersService);
//# sourceMappingURL=brokers.service.js.map