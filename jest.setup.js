// Jest setup file
process.env.NODE_ENV = 'test';
process.env.STAGE = 'test';
process.env.REGION = 'us-east-1';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
    config: {
        update: jest.fn(),
    },
    DynamoDB: {
        DocumentClient: jest.fn(() => ({
            get: jest.fn(),
            put: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            query: jest.fn(),
            scan: jest.fn(),
        })),
    },
    CognitoIdentityServiceProvider: jest.fn(() => ({
        adminGetUser: jest.fn(),
        adminCreateUser: jest.fn(),
        adminSetUserPassword: jest.fn(),
        adminUpdateUserAttributes: jest.fn(),
        listUsers: jest.fn(),
        initiateAuth: jest.fn(),
        signUp: jest.fn(),
        confirmSignUp: jest.fn(),
        forgotPassword: jest.fn(),
        confirmForgotPassword: jest.fn(),
    })),
    Lambda: jest.fn(() => ({
        invoke: jest.fn(),
    })),
}));

// Mock console methods in tests
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
}; 