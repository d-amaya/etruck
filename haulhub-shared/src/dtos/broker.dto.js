"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateBrokerDto = exports.CreateBrokerDto = void 0;
const class_validator_1 = require("class-validator");
class CreateBrokerDto {
}
exports.CreateBrokerDto = CreateBrokerDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(2)
], CreateBrokerDto.prototype, "brokerName", void 0);
class UpdateBrokerDto {
}
exports.UpdateBrokerDto = UpdateBrokerDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MinLength)(2)
], UpdateBrokerDto.prototype, "brokerName", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)()
], UpdateBrokerDto.prototype, "isActive", void 0);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJva2VyLmR0by5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJyb2tlci5kdG8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscURBQXlGO0FBRXpGLE1BQWEsZUFBZTtDQUszQjtBQUxELDBDQUtDO0FBREM7SUFIQyxJQUFBLDBCQUFRLEdBQUU7SUFDVixJQUFBLDRCQUFVLEdBQUU7SUFDWixJQUFBLDJCQUFTLEVBQUMsQ0FBQyxDQUFDO21EQUNPO0FBR3RCLE1BQWEsZUFBZTtDQVMzQjtBQVRELDBDQVNDO0FBTEM7SUFIQyxJQUFBLDBCQUFRLEdBQUU7SUFDVixJQUFBLDRCQUFVLEdBQUU7SUFDWixJQUFBLDJCQUFTLEVBQUMsQ0FBQyxDQUFDO21EQUNPO0FBSXBCO0lBRkMsSUFBQSwyQkFBUyxHQUFFO0lBQ1gsSUFBQSw0QkFBVSxHQUFFO2lEQUNNIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSXNTdHJpbmcsIElzTm90RW1wdHksIElzQm9vbGVhbiwgSXNPcHRpb25hbCwgTWluTGVuZ3RoIH0gZnJvbSAnY2xhc3MtdmFsaWRhdG9yJztcblxuZXhwb3J0IGNsYXNzIENyZWF0ZUJyb2tlckR0byB7XG4gIEBJc1N0cmluZygpXG4gIEBJc05vdEVtcHR5KClcbiAgQE1pbkxlbmd0aCgyKVxuICBicm9rZXJOYW1lITogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVXBkYXRlQnJva2VyRHRvIHtcbiAgQElzU3RyaW5nKClcbiAgQElzT3B0aW9uYWwoKVxuICBATWluTGVuZ3RoKDIpXG4gIGJyb2tlck5hbWU/OiBzdHJpbmc7XG5cbiAgQElzQm9vbGVhbigpXG4gIEBJc09wdGlvbmFsKClcbiAgaXNBY3RpdmU/OiBib29sZWFuO1xufVxuIl19