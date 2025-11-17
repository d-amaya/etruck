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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
let UsersService = class UsersService {
    constructor(awsService, configService) {
        this.awsService = awsService;
        this.configService = configService;
    }
    async getUserProfile(userId) {
        try {
            const getCommand = new lib_dynamodb_1.GetCommand({
                TableName: this.configService.dynamodbTableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: 'PROFILE',
                },
            });
            const result = await this.awsService.getDynamoDBClient().send(getCommand);
            if (!result.Item) {
                throw new common_1.NotFoundException('User profile not found');
            }
            return this.mapDynamoDBItemToUser(result.Item);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            console.error('Error getting user profile:', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve user profile');
        }
    }
    async updateUserProfile(userId, updateProfileDto) {
        const { fullName, phoneNumber } = updateProfileDto;
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        if (fullName !== undefined) {
            updateExpressions.push('#fullName = :fullName');
            expressionAttributeNames['#fullName'] = 'fullName';
            expressionAttributeValues[':fullName'] = fullName;
        }
        if (phoneNumber !== undefined) {
            updateExpressions.push('#phoneNumber = :phoneNumber');
            expressionAttributeNames['#phoneNumber'] = 'phoneNumber';
            expressionAttributeValues[':phoneNumber'] = phoneNumber;
        }
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        if (updateExpressions.length === 1) {
            return this.getUserProfile(userId);
        }
        try {
            const updateCommand = new lib_dynamodb_1.UpdateCommand({
                TableName: this.configService.dynamodbTableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: 'PROFILE',
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            });
            const result = await this.awsService.getDynamoDBClient().send(updateCommand);
            if (!result.Attributes) {
                throw new common_1.NotFoundException('User profile not found');
            }
            return this.mapDynamoDBItemToUser(result.Attributes);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            console.error('Error updating user profile:', error);
            throw new common_1.InternalServerErrorException('Failed to update user profile');
        }
    }
    async getUserById(userId) {
        return this.getUserProfile(userId);
    }
    mapDynamoDBItemToUser(item) {
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
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService])
], UsersService);
//# sourceMappingURL=users.service.js.map