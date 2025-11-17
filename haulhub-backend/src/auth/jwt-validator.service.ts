import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { ConfigService } from '../config/config.service';

/**
 * JWT Validator Service
 * Handles JWT token validation using Cognito's JWKS
 * Separated from AuthService for better testability
 */
@Injectable()
export class JwtValidatorService {
  private jwksClient: jwksClient.JwksClient;

  constructor(private readonly configService: ConfigService) {
    this.initializeJwksClient();
  }

  /**
   * Initialize JWKS client for Cognito public keys
   */
  private initializeJwksClient(): void {
    const region = this.configService.awsRegion;
    const userPoolId = this.configService.cognitoUserPoolId;
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

    this.jwksClient = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
    });
  }

  /**
   * Validate Cognito JWT token
   * Verifies token signature, expiration, and extracts user information
   */
  async validateToken(token: string): Promise<any> {
    try {
      // Decode token header to get the key ID (kid)
      const decodedToken = jwt.decode(token, { complete: true });

      if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
        throw new UnauthorizedException('Invalid token format');
      }

      const kid = decodedToken.header.kid;

      // Get the signing key from JWKS
      const key = await this.getSigningKey(kid);

      // Verify token signature and expiration
      const payload = jwt.verify(token, key, {
        algorithms: ['RS256'],
      });

      // Validate token type (should be access token)
      if (typeof payload === 'object' && payload.token_use !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Access token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid access token');
      }
      if (error.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token not yet valid');
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }

  /**
   * Get signing key from JWKS
   */
  private async getSigningKey(kid: string): Promise<string> {
    try {
      const key = await this.jwksClient.getSigningKey(kid);
      return key.getPublicKey();
    } catch (error) {
      throw new UnauthorizedException('Unable to retrieve signing key');
    }
  }
}
