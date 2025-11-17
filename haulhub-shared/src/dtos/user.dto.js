"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyUserDto = exports.UpdateProfileDto = void 0;
const class_validator_1 = require("class-validator");
class UpdateProfileDto {
}
exports.UpdateProfileDto = UpdateProfileDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2, { message: 'Full name must be at least 2 characters long' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Full name must not exceed 100 characters' })
], UpdateProfileDto.prototype, "fullName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\+?[1-9]\d{1,14}$/, {
        message: 'Phone number must be in E.164 format (e.g., +12345678901)',
    })
], UpdateProfileDto.prototype, "phoneNumber", void 0);
class VerifyUserDto {
}
exports.VerifyUserDto = VerifyUserDto;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlci5kdG8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1c2VyLmR0by50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxxREFBc0Y7QUFFdEYsTUFBYSxnQkFBZ0I7Q0FhNUI7QUFiRCw0Q0FhQztBQVJDO0lBSkMsSUFBQSw0QkFBVSxHQUFFO0lBQ1osSUFBQSwwQkFBUSxHQUFFO0lBQ1YsSUFBQSwyQkFBUyxFQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSw4Q0FBOEMsRUFBRSxDQUFDO0lBQ3pFLElBQUEsMkJBQVMsRUFBQyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsMENBQTBDLEVBQUUsQ0FBQztrREFDdEQ7QUFPbEI7SUFMQyxJQUFBLDRCQUFVLEdBQUU7SUFDWixJQUFBLDBCQUFRLEdBQUU7SUFDVixJQUFBLHlCQUFPLEVBQUMsb0JBQW9CLEVBQUU7UUFDN0IsT0FBTyxFQUFFLDJEQUEyRDtLQUNyRSxDQUFDO3FEQUNtQjtBQUd2QixNQUFhLGFBQWE7Q0FHekI7QUFIRCxzQ0FHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IElzU3RyaW5nLCBJc09wdGlvbmFsLCBNaW5MZW5ndGgsIE1heExlbmd0aCwgTWF0Y2hlcyB9IGZyb20gJ2NsYXNzLXZhbGlkYXRvcic7XG5cbmV4cG9ydCBjbGFzcyBVcGRhdGVQcm9maWxlRHRvIHtcbiAgQElzT3B0aW9uYWwoKVxuICBASXNTdHJpbmcoKVxuICBATWluTGVuZ3RoKDIsIHsgbWVzc2FnZTogJ0Z1bGwgbmFtZSBtdXN0IGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVycyBsb25nJyB9KVxuICBATWF4TGVuZ3RoKDEwMCwgeyBtZXNzYWdlOiAnRnVsbCBuYW1lIG11c3Qgbm90IGV4Y2VlZCAxMDAgY2hhcmFjdGVycycgfSlcbiAgZnVsbE5hbWU/OiBzdHJpbmc7XG5cbiAgQElzT3B0aW9uYWwoKVxuICBASXNTdHJpbmcoKVxuICBATWF0Y2hlcygvXlxcKz9bMS05XVxcZHsxLDE0fSQvLCB7XG4gICAgbWVzc2FnZTogJ1Bob25lIG51bWJlciBtdXN0IGJlIGluIEUuMTY0IGZvcm1hdCAoZS5nLiwgKzEyMzQ1Njc4OTAxKScsXG4gIH0pXG4gIHBob25lTnVtYmVyPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVmVyaWZ5VXNlckR0byB7XG4gIGRlY2lzaW9uITogJ1ZlcmlmaWVkJyB8ICdSZWplY3RlZCc7XG4gIHJlYXNvbj86IHN0cmluZztcbn1cbiJdfQ==