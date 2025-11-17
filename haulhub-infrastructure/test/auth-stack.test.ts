import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/stacks/auth-stack';
import { HaulHubStackProps } from '../lib/types';
import { getEnvironmentConfig } from '../lib/config';

describe('AuthStack', () => {
  let app: cdk.App;
  let stack: AuthStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const config = getEnvironmentConfig('dev');
    const props: HaulHubStackProps = {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
      environment: 'dev',
      awsProfile: 'haul-hub',
      config,
    };
    stack = new AuthStack(app, 'TestAuthStack', props);
    template = Template.fromStack(stack);
  });

  describe('Cognito User Pool', () => {
    test('should create a User Pool with correct configuration', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'HaulHub-UserPool-dev',
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
        MfaConfiguration: 'OPTIONAL',
      });
    });

    test('should configure email/password authentication', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: ['email'],
      });
    });

    test('should configure password policy', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: false,
            TemporaryPasswordValidityDays: 7,
          },
        },
      });
    });

    test('should configure email verification', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AutoVerifiedAttributes: ['email'],
        VerificationMessageTemplate: {
          DefaultEmailOption: 'CONFIRM_WITH_LINK',
          EmailSubjectByLink: 'Verify your email for HaulHub',
          EmailMessageByLink: Match.stringLikeRegexp('verify your email'),
        },
      });
    });

    test('should configure account recovery', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AccountRecoverySetting: {
          RecoveryMechanisms: [
            {
              Name: 'verified_email',
              Priority: 1,
            },
          ],
        },
      });
    });

    test('should have custom attribute for role', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'role',
            AttributeDataType: 'String',
            Mutable: false,
          }),
        ]),
      });
    });

    test('should have Component tag', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Component: 'Authentication',
        }),
      });
    });
  });

  describe('Cognito User Pool Client', () => {
    test('should create a User Pool Client with correct configuration', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: 'HaulHub-UserPoolClient-dev',
        EnableTokenRevocation: true,
        PreventUserExistenceErrors: 'ENABLED',
      });
    });

    test('should configure authentication flows', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ]),
      });
    });

    test('should configure token validity - access token 5 minutes (for testing)', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AccessTokenValidity: 5, // 5 minutes (minimum allowed by Cognito, for testing token refresh)
        TokenValidityUnits: Match.objectLike({
          AccessToken: 'minutes',
        }),
      });
    });

    test('should configure token validity - refresh token 1 year', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        RefreshTokenValidity: 525600, // 1 year in minutes (365 * 24 * 60)
        TokenValidityUnits: Match.objectLike({
          RefreshToken: 'minutes',
        }),
      });
    });
  });

  describe('User Groups', () => {
    test('should create Dispatcher group', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'Dispatcher',
        Description: Match.stringLikeRegexp('Dispatchers'),
        Precedence: 1,
      });
    });

    test('should create LorryOwner group', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'LorryOwner',
        Description: Match.stringLikeRegexp('Lorry owners'),
        Precedence: 2,
      });
    });

    test('should create Driver group', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'Driver',
        Description: Match.stringLikeRegexp('Drivers'),
        Precedence: 3,
      });
    });

    test('should create Admin group with highest precedence', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'Admin',
        Description: Match.stringLikeRegexp('administrators'),
        Precedence: 0,
      });
    });

    test('should create all four user groups', () => {
      template.resourceCountIs('AWS::Cognito::UserPoolGroup', 4);
    });
  });

  describe('Stack Outputs', () => {
    test('should export User Pool ID', () => {
      template.hasOutput('UserPoolId', {
        Description: 'Cognito User Pool ID',
        Export: {
          Name: 'HaulHub-UserPoolId-dev',
        },
      });
    });

    test('should export User Pool ARN', () => {
      template.hasOutput('UserPoolArn', {
        Description: 'Cognito User Pool ARN',
        Export: {
          Name: 'HaulHub-UserPoolArn-dev',
        },
      });
    });

    test('should export User Pool Client ID', () => {
      template.hasOutput('UserPoolClientId', {
        Description: 'Cognito User Pool Client ID',
        Export: {
          Name: 'HaulHub-UserPoolClientId-dev',
        },
      });
    });

    test('should output User Pool Domain', () => {
      template.hasOutput('UserPoolDomain', {
        Description: 'Cognito User Pool Domain',
      });
    });
  });

  describe('Resource Count', () => {
    test('should create exactly one User Pool', () => {
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
    });

    test('should create exactly one User Pool Client', () => {
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });

    test('should create IAM role for SMS', () => {
      template.resourceCountIs('AWS::IAM::Role', 1);
    });
  });

  describe('Production Environment', () => {
    test('should set RETAIN removal policy for production', () => {
      const prodApp = new cdk.App();
      const prodConfig = getEnvironmentConfig('prod');
      const prodStack = new AuthStack(prodApp, 'ProdAuthStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
        environment: 'prod',
        awsProfile: 'haul-hub',
        config: prodConfig,
      });
      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResource('AWS::Cognito::UserPool', {
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain',
      });
    });

    test('should set DESTROY removal policy for non-production', () => {
      template.hasResource('AWS::Cognito::UserPool', {
        UpdateReplacePolicy: 'Delete',
        DeletionPolicy: 'Delete',
      });
    });
  });
});
