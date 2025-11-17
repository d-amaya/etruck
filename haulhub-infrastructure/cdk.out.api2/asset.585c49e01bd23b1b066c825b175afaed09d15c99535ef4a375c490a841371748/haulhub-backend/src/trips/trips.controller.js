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
exports.TripsController = void 0;
const common_1 = require("@nestjs/common");
const trips_service_1 = require("./trips.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const shared_1 = require("@haulhub/shared");
let TripsController = class TripsController {
    constructor(tripsService) {
        this.tripsService = tripsService;
    }
    async createTrip(user, dto) {
        return this.tripsService.createTrip(user.userId, dto);
    }
    async getTripById(user, tripId) {
        return this.tripsService.getTripById(tripId, user.userId, user.role);
    }
    async updateTrip(user, tripId, dto) {
        return this.tripsService.updateTrip(tripId, user.userId, dto);
    }
    async updateTripStatus(user, tripId, dto) {
        return this.tripsService.updateTripStatus(tripId, user.userId, user.role, dto.status);
    }
    async getTrips(user, filters) {
        return this.tripsService.getTrips(user.userId, user.role, filters);
    }
    async getPaymentReport(user, filters) {
        return this.tripsService.getPaymentReport(user.userId, user.role, filters);
    }
};
exports.TripsController = TripsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, shared_1.CreateTripDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "createTrip", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher, shared_1.UserRole.Driver, shared_1.UserRole.LorryOwner, shared_1.UserRole.Admin),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTripById", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, shared_1.UpdateTripDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateTrip", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher, shared_1.UserRole.Driver),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, shared_1.UpdateTripStatusDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateTripStatus", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher, shared_1.UserRole.Driver, shared_1.UserRole.LorryOwner),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, shared_1.TripFilters]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTrips", null);
__decorate([
    (0, common_1.Get)('reports/payments'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Dispatcher, shared_1.UserRole.Driver, shared_1.UserRole.LorryOwner),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getPaymentReport", null);
exports.TripsController = TripsController = __decorate([
    (0, common_1.Controller)('trips'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [trips_service_1.TripsService])
], TripsController);
//# sourceMappingURL=trips.controller.js.map