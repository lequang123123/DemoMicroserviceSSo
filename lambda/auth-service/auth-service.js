const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const lambda = new AWS.Lambda();

const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const USER_SERVICE_ARN = process.env.USER_SERVICE_ARN;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const { action, body } = event;
        
        switch (action) {
            case 'login':
                return await login(JSON.parse(body));
            case 'register':
                return await register(JSON.parse(body));
            case 'refresh':
                return await refreshToken(JSON.parse(body));
            case 'logout':
                return await logout(JSON.parse(body));
            case 'forgotPassword':
                return await forgotPassword(JSON.parse(body));
            case 'resetPassword':
                return await resetPassword(JSON.parse(body));
            case 'verifyEmail':
                return await verifyEmail(JSON.parse(body));
            case 'resendVerification':
                return await resendVerification(JSON.parse(body));
            default:
                return errorResponse(400, 'Invalid action');
        }
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(500, 'Internal server error');
    }
};

// Login user
async function login(loginData) {
    try {
        const { username, password } = loginData;
        
        if (!username || !password) {
            return errorResponse(400, 'Username and password are required');
        }
        
        const authParams = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        };
        
        const authResult = await cognito.initiateAuth(authParams).promise();
        
        if (authResult.AuthenticationResult) {
            const { AccessToken, IdToken, RefreshToken } = authResult.AuthenticationResult;
            
            // Get user info from token
            const userInfo = await cognito.getUser({
                AccessToken: AccessToken
            }).promise();
            
            // Create session
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const ttl = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            
            await dynamodb.put({
                TableName: SESSIONS_TABLE,
                Item: {
                    sessionId,
                    userId: userInfo.Username,
                    accessToken: AccessToken,
                    refreshToken: RefreshToken,
                    ttl,
                    createdAt: new Date().toISOString()
                }
            }).promise();
            
            // Get user profile from User Service
            const userProfile = await getUserProfile(userInfo.Username);
            
            return successResponse({
                user: userProfile,
                tokens: {
                    accessToken: AccessToken,
                    idToken: IdToken,
                    refreshToken: RefreshToken
                },
                sessionId
            });
        } else {
            return errorResponse(401, 'Authentication failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.code === 'NotAuthorizedException') {
            return errorResponse(401, 'Invalid credentials');
        } else if (error.code === 'UserNotConfirmedException') {
            return errorResponse(401, 'User not confirmed. Please verify your email.');
        } else if (error.code === 'UserNotFoundException') {
            return errorResponse(404, 'User not found');
        }
        
        throw error;
    }
}

// Register user
async function register(registerData) {
    try {
        const { username, password, email, firstName, lastName, phone } = registerData;
        
        if (!username || !password || !email || !firstName || !lastName) {
            return errorResponse(400, 'Username, password, email, first name, and last name are required');
        }
        
        // Create user in Cognito
        const signUpParams = {
            ClientId: USER_POOL_CLIENT_ID,
            Username: username,
            Password: password,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email
                },
                {
                    Name: 'given_name',
                    Value: firstName
                },
                {
                    Name: 'family_name',
                    Value: lastName
                }
            ]
        };
        
        if (phone) {
            signUpParams.UserAttributes.push({
                Name: 'phone_number',
                Value: phone
            });
        }
        
        const signUpResult = await cognito.signUp(signUpParams).promise();
        
        // Create user in DynamoDB via User Service
        const userServiceParams = {
            FunctionName: USER_SERVICE_ARN,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({
                action: 'createUser',
                body: JSON.stringify({
                    email,
                    firstName,
                    lastName,
                    phone,
                    cognitoId: signUpResult.UserSub
                })
            })
        };
        
        await lambda.invoke(userServiceParams).promise();
        
        return successResponse({
            message: 'User registered successfully. Please check your email for verification.',
            userId: signUpResult.UserSub
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.code === 'UsernameExistsException') {
            return errorResponse(409, 'Username already exists');
        } else if (error.code === 'InvalidPasswordException') {
            return errorResponse(400, 'Password does not meet requirements');
        } else if (error.code === 'InvalidParameterException') {
            return errorResponse(400, 'Invalid parameters');
        }
        
        throw error;
    }
}

// Refresh token
async function refreshToken(refreshData) {
    try {
        const { refreshToken } = refreshData;
        
        if (!refreshToken) {
            return errorResponse(400, 'Refresh token is required');
        }
        
        const authParams = {
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken
            }
        };
        
        const authResult = await cognito.initiateAuth(authParams).promise();
        
        if (authResult.AuthenticationResult) {
            const { AccessToken, IdToken } = authResult.AuthenticationResult;
            
            return successResponse({
                tokens: {
                    accessToken: AccessToken,
                    idToken: IdToken
                }
            });
        } else {
            return errorResponse(401, 'Token refresh failed');
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        
        if (error.code === 'NotAuthorizedException') {
            return errorResponse(401, 'Invalid refresh token');
        }
        
        throw error;
    }
}

// Logout user
async function logout(logoutData) {
    try {
        const { sessionId, accessToken } = logoutData;
        
        if (sessionId) {
            // Remove session from DynamoDB
            await dynamodb.delete({
                TableName: SESSIONS_TABLE,
                Key: { sessionId }
            }).promise();
        }
        
        if (accessToken) {
            // Sign out from Cognito
            await cognito.globalSignOut({
                AccessToken: accessToken
            }).promise();
        }
        
        return successResponse({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        return successResponse({ message: 'Logout completed' });
    }
}

// Forgot password
async function forgotPassword(forgotData) {
    try {
        const { username } = forgotData;
        
        if (!username) {
            return errorResponse(400, 'Username is required');
        }
        
        await cognito.forgotPassword({
            ClientId: USER_POOL_CLIENT_ID,
            Username: username
        }).promise();
        
        return successResponse({ message: 'Password reset code sent to your email' });
    } catch (error) {
        console.error('Forgot password error:', error);
        
        if (error.code === 'UserNotFoundException') {
            return errorResponse(404, 'User not found');
        }
        
        throw error;
    }
}

// Reset password
async function resetPassword(resetData) {
    try {
        const { username, confirmationCode, newPassword } = resetData;
        
        if (!username || !confirmationCode || !newPassword) {
            return errorResponse(400, 'Username, confirmation code, and new password are required');
        }
        
        await cognito.confirmForgotPassword({
            ClientId: USER_POOL_CLIENT_ID,
            Username: username,
            ConfirmationCode: confirmationCode,
            Password: newPassword
        }).promise();
        
        return successResponse({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Reset password error:', error);
        
        if (error.code === 'CodeMismatchException') {
            return errorResponse(400, 'Invalid confirmation code');
        } else if (error.code === 'ExpiredCodeException') {
            return errorResponse(400, 'Confirmation code has expired');
        }
        
        throw error;
    }
}

// Verify email
async function verifyEmail(verifyData) {
    try {
        const { username, confirmationCode } = verifyData;
        
        if (!username || !confirmationCode) {
            return errorResponse(400, 'Username and confirmation code are required');
        }
        
        await cognito.confirmSignUp({
            ClientId: USER_POOL_CLIENT_ID,
            Username: username,
            ConfirmationCode: confirmationCode
        }).promise();
        
        return successResponse({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('Email verification error:', error);
        
        if (error.code === 'CodeMismatchException') {
            return errorResponse(400, 'Invalid confirmation code');
        } else if (error.code === 'ExpiredCodeException') {
            return errorResponse(400, 'Confirmation code has expired');
        }
        
        throw error;
    }
}

// Resend verification code
async function resendVerification(resendData) {
    try {
        const { username } = resendData;
        
        if (!username) {
            return errorResponse(400, 'Username is required');
        }
        
        await cognito.resendConfirmationCode({
            ClientId: USER_POOL_CLIENT_ID,
            Username: username
        }).promise();
        
        return successResponse({ message: 'Verification code resent' });
    } catch (error) {
        console.error('Resend verification error:', error);
        
        if (error.code === 'UserNotFoundException') {
            return errorResponse(404, 'User not found');
        }
        
        throw error;
    }
}

// Helper functions
async function getUserProfile(userId) {
    try {
        const params = {
            FunctionName: USER_SERVICE_ARN,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({
                action: 'getProfile',
                userId: userId
            })
        };
        
        const result = await lambda.invoke(params).promise();
        const response = JSON.parse(result.Payload);
        
        if (response.statusCode === 200) {
            const userData = JSON.parse(response.body);
            return userData.data;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}

function successResponse(data) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({
            success: true,
            data: data
        })
    };
}

function errorResponse(statusCode, message) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({
            success: false,
            error: message
        })
    };
} 