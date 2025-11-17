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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokersController = void 0;
const common_1 = require("@nestjs/common");
const brokers_service_1 = require("./brokers.service");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const shared_1 = require("@haulhub/shared");
let BrokersController = class BrokersController {
    constructor(brokersService) {
        this.brokersService = brokersService;
    }
    async getAllBrokers(activeOnly) {
        const filterActive = activeOnly === 'true';
        return this.brokersService.getAllBrokers(filterActive);
    }
    async getBrokerById(id) {
        return this.brokersService.getBrokerById(id);
    }
    async createBroker(createBrokerDto) {
        return this.brokersService.createBroker(createBrokerDto);
    }
    async updateBroker(id, updateBrokerDto) {
        return this.brokersService.updateBroker(id, updateBrokerDto);
    }
    async deleteBroker(id) {
        return this.brokersService.deleteBroker(id);
    }
};
exports.BrokersController = BrokersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('activeOnly')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BrokersController.prototype, "getAllBrokers", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BrokersController.prototype, "getBrokerById", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [shared_1.CreateBrokerDto]),
    __metadata("design:returntype", Promise)
], BrokersController.prototype, "createBroker", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shared_1.UpdateBrokerDto]),
    __metadata("design:returntype", Promise)
], BrokersController.prototype, "updateBroker", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BrokersController.prototype, "deleteBroker", null);
exports.BrokersController = BrokersController = __decorate([
    (0, common_1.Controller)('brokers'),
    __metadata("design:paramtypes", [brokers_service_1.BrokersService])
], BrokersController);
//# sourceMappingURL=brokers.controller.js.map