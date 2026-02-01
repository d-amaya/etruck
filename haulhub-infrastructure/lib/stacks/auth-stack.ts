import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { HaulHubStackProps } from '../types';
import { getResourceName } from '../config';

/**
 * AuthStack - Cognito User Pool for HaulHub Authentication
 * 
 * This stack creates:
 * - Cognito User Pool with email/password authentication
 * - User Pool Client with token configuration
 * - User Groups for role-based access control (Dispatcher, LorryOwner, Driver, Admin)
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: HaulHubStackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: getResourceName('UserPool', props.environment),
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
      },
      
      // Self sign-up configuration
      selfSignUpEnabled: true,
      
      // User attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      
      // Custom attributes for role
      customAttributes: {
        role: new cognito.StringAttribute({ 
          mutable: false,
        }),
        // New eTrucky attributes (backward compatible - optional)
        carrierId: new cognito.StringAttribute({
          mutable: false, // Set once during user creation
        }),
        nationalId: new cognito.StringAttribute({
          mutable: false, // Driving License or SSN
        }),
      },
      
      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // Email verification
      autoVerify: {
        email: true,
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Email configuration (using Cognito default for now)
      email: cognito.UserPoolEmail.withCognito(),
      
      // User invitation
      userInvitation: {
        emailSubject: 'Welcome to eTrucky!',
        emailBody: 'Hello {username}, your temporary password is {####}',
      },
      
      // User verification
      userVerification: {
        emailSubject: 'Verify your email for eTrucky',
        emailBody: 'Hello, please verify your email by clicking this link: {##Verify Email##}',
        emailStyle: cognito.VerificationEmailStyle.LINK,
      },
      
      // MFA configuration (optional for now)
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      
      // Deletion protection
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });
    
    // Add tags to User Pool
    cdk.Tags.of(this.userPool).add('Component', 'Authentication');

    // Create User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPoolClientName: getResourceName('UserPoolClient', props.environment),
      userPool: this.userPool,
      
      // Authentication flows
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1), // 1 hour
      idTokenValidity: cdk.Duration.hours(1), // 1 hour
      refreshTokenValidity: cdk.Duration.hours(24), // 24 hours
      
      // Token revocation
      enableTokenRevocation: true,
      
      // Prevent user existence errors
      preventUserExistenceErrors: true,
      
      // Generate secret (not needed for public clients like web/mobile apps)
      generateSecret: false,
      
      // Read and write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          phoneNumber: true,
          phoneNumberVerified: true,
          fullname: true,
        })
        .withCustomAttributes('role', 'carrierId', 'nationalId'),
      
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          phoneNumber: true,
          fullname: true,
        }),
    });

    // Create User Groups for role-based access control
    // Precedence hierarchy: Admin (0) > Carrier (1) > Dispatcher (2) > TruckOwner (3) > Driver (4)
    // Lower number = Higher priority when user belongs to multiple groups
    
    const adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Admin',
      description: 'System administrators who manage verifications and broker lists',
      precedence: 0, // Highest priority
    });

    const carrierGroup = new cognito.CfnUserPoolGroup(this, 'CarrierGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Carrier',
      description: 'Logistics company users who manage assets (trucks, trailers, dispatchers, drivers)',
      precedence: 1, // Second highest
    });

    const dispatcherGroup = new cognito.CfnUserPoolGroup(this, 'DispatcherGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Dispatcher',
      description: 'Dispatchers who manage transportation deals and coordinate trucks and drivers',
      precedence: 2,
    });

    const truckOwnerGroup = new cognito.CfnUserPoolGroup(this, 'TruckOwnerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'TruckOwner',
      description: 'Truck owners who provide vehicles for transportation services',
      precedence: 3,
    });

    // Legacy group (backward compatibility)
    const lorryOwnerGroup = new cognito.CfnUserPoolGroup(this, 'LorryOwnerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'LorryOwner',
      description: 'Lorry owners who provide vehicles for transportation services (legacy)',
      precedence: 3, // Same as TruckOwner
    });

    const driverGroup = new cognito.CfnUserPoolGroup(this, 'DriverGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Driver',
      description: 'Drivers who operate trucks to complete transportation trips',
      precedence: 4, // Lowest priority
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${getResourceName('UserPoolId', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${getResourceName('UserPoolArn', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${getResourceName('UserPoolClientId', props.environment)}`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'Cognito User Pool Domain',
    });
  }
}
