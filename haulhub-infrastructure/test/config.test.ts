import { getEnvironmentConfig, getResourceName, getStackName } from '../lib/config';

describe('Configuration', () => {
  describe('getEnvironmentConfig', () => {
    it('should return dev configuration', () => {
      const config = getEnvironmentConfig('dev');
      expect(config.environment).toBe('dev');
      expect(config.dynamoDbBillingMode).toBe('PAY_PER_REQUEST');
      expect(config.lambdaMemorySize).toBe(512);
      expect(config.enableDynamoDbPitr).toBe(false);
    });

    it('should return staging configuration', () => {
      const config = getEnvironmentConfig('staging');
      expect(config.environment).toBe('staging');
      expect(config.lambdaMemorySize).toBe(1024);
      expect(config.enableDynamoDbPitr).toBe(true);
    });

    it('should return prod configuration', () => {
      const config = getEnvironmentConfig('prod');
      expect(config.environment).toBe('prod');
      expect(config.cloudFrontPriceClass).toBe('PriceClass_All');
      expect(config.enableDetailedMonitoring).toBe(true);
    });

    it('should default to dev configuration for unknown environment', () => {
      const config = getEnvironmentConfig('unknown');
      expect(config.environment).toBe('dev');
    });
  });

  describe('getResourceName', () => {
    it('should generate resource name without suffix', () => {
      const name = getResourceName('UserPool', 'dev');
      expect(name).toBe('HaulHub-UserPool-dev');
    });

    it('should generate resource name with suffix', () => {
      const name = getResourceName('Bucket', 'prod', 'Documents');
      expect(name).toBe('HaulHub-Bucket-prod-Documents');
    });
  });

  describe('getStackName', () => {
    it('should generate stack name', () => {
      const name = getStackName('Auth', 'dev');
      expect(name).toBe('HaulHub-Auth-dev');
    });

    it('should generate stack name for production', () => {
      const name = getStackName('Database', 'prod');
      expect(name).toBe('HaulHub-Database-prod');
    });
  });
});
