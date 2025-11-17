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
exports.JwtValidatorService = void 0;
const common_1 = require("@nestjs/common");
const jwt = require("jsonwebtoken");
const jwks_rsa_1 = require("jwks-rsa");
const config_service_1 = require("../config/config.service");
let JwtValidatorService = class JwtValidatorService {
    constructor(configService) {
        this.configService = configService;
        this.initializeJwksClient();
    }
    initializeJwksClient() {
        const region = this.configService.awsRegion;
        const userPoolId = this.configService.cognitoUserPoolId;
        const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
        this.jwksClient = (0, jwks_rsa_1.default)({
            jwksUri,
            cache: true,
            cacheMaxAge: 600000,
        });
    }
    async validateToken(token) {
        try {
            const decodedToken = jwt.decode(token, { complete: true });
            if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
                throw new common_1.UnauthorizedException('Invalid token format');
            }
            const kid = decodedToken.header.kid;
            const key = await this.getSigningKey(kid);
            const payload = jwt.verify(token, key, {
                algorithms: ['RS256'],
            });
            if (typeof payload === 'object' && payload.token_use !== 'access') {
                throw new common_1.UnauthorizedException('Invalid token type');
            }
            return payload;
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new common_1.UnauthorizedException('Access token has expired');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new common_1.UnauthorizedException('Invalid access token');
            }
            if (error.name === 'NotBeforeError') {
                throw new common_1.UnauthorizedException('Token not yet valid');
            }
            throw new common_1.UnauthorizedException('Token validation failed');
        }
    }
    async getSigningKey(kid) {
        try {
            const key = await this.jwksClient.getSigningKey(kid);
            return key.getPublicKey();
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Unable to retrieve signing key');
        }
    }
};
exports.JwtValidatorService = JwtValidatorService;
exports.JwtValidatorService = JwtValidatorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], JwtValidatorService);
//# sourceMappingURL=jwt-validator.service.js.map