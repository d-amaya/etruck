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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const shared_1 = require("@haulhub/shared");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async getDashboard(user) {
        return {
            message: 'Admin dashboard',
            adminUser: {
                userId: user.userId,
                email: user.email,
                role: user.role,
            },
        };
    }
    async getPendingLorries() {
        return this.adminService.getPendingLorries();
    }
    async verifyLorry(lorryId, dto) {
        return this.adminService.verifyLorry(lorryId, dto);
    }
    async getPendingUsers() {
        return this.adminService.getPendingUsers();
    }
    async verifyUser(userId, dto) {
        return this.adminService.verifyUser(userId, dto);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Get)('dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDashboard", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Get)('lorries/pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPendingLorries", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Patch)('lorries/:id/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shared_1.VerifyLorryDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verifyLorry", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Get)('users/pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPendingUsers", null);
__decorate([
    (0, roles_decorator_1.Roles)(shared_1.UserRole.Admin),
    (0, common_1.Patch)('users/:id/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shared_1.VerifyUserDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verifyUser", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map