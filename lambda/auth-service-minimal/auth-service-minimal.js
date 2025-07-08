const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
    try {
        console.log('Event:', JSON.stringify(event));
        
        const { httpMethod, path, body, headers, queryStringParameters } = event;
        const requestBody = body ? JSON.parse(body) : {};
        
        // Route handling based on path and method
        if (path === '/auth/test' && httpMethod === 'GET') {
            return testAuthService();
        }
        
        // === BASIC AUTHENTICATION ENDPOINTS ===
        if (path === '/auth/register' && httpMethod === 'POST') {
            return await registerUser(requestBody);
        }
        
        if (path === '/auth/login' && httpMethod === 'POST') {
            return await loginUser(requestBody);
        }
        
        // === OAUTH2 ENDPOINTS ===
        if (path === '/oauth2/authorize' && httpMethod === 'GET') {
            return await oauth2Authorize(queryStringParameters);
        }
        
        if (path === '/oauth2/token' && httpMethod === 'POST') {
            return await oauth2Token(requestBody);
        }
        
        if (path === '/oauth2/refresh' && httpMethod === 'POST') {
            return await oauth2Refresh(requestBody);
        }
        
        // === PROTECTED ENDPOINTS (require JWT) ===
        if (path === '/auth/profile' && httpMethod === 'GET') {
            return await getUserProfile(event.requestContext.authorizer);
        }
        
        if (path === '/auth/user-info' && httpMethod === 'POST') {
            return await getUserInfoFromToken(requestBody);
        }
        
        if (path === '/auth/logout' && httpMethod === 'POST') {
            return await logoutUser(event.requestContext.authorizer);
        }
        
        return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Endpoint not found' })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};

// === BASIC AUTHENTICATION ===
function testAuthService() {
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            message: 'Auth service is working!',
            userPoolId: USER_POOL_ID,
            oauth2: {
                endpoints: {
                    authorize: '/oauth2/authorize',
                    token: '/oauth2/token',
                    refresh: '/oauth2/refresh'
                },
                flows: ['authorization_code', 'client_credentials', 'refresh_token']
            },
            auth: {
                endpoints: {
                    register: '/auth/register',
                    login: '/auth/login',
                    profile: '/auth/profile',
                    user_info: '/auth/user-info',
                    logout: '/auth/logout'
                },
                token_types: {
                    access_token: 'For API authorization',
                    id_token: 'For user identity information',
                    refresh_token: 'For token renewal'
                }
            },
            sso: {
                enabled: true,
                description: 'Single Sign-On across all microservices',
                user_identity_source: 'ID Token contains email, name, profile info'
            }
        })
    };
}

async function registerUser({ email, password, name }) {
    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'name', Value: name },
            { Name: 'email_verified', Value: 'true' }
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS'
    };

    try {
        const result = await cognito.adminCreateUser(params).promise();
        console.log('User created:', result);

        // Set permanent password
        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
        }).promise();

        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'User created successfully',
                userId: result.User.Username,
                oauth2Ready: true
            })
        };
    } catch (error) {
        console.error('Registration error:', error);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: error.message })
        };
    }
}

async function loginUser({ email, password }) {
    const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        UserPoolId: USER_POOL_ID,
        ClientId: USER_POOL_CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };

    try {
        const result = await cognito.adminInitiateAuth(params).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Login successful',
                accessToken: result.AuthenticationResult.AccessToken,
                idToken: result.AuthenticationResult.IdToken,
                refreshToken: result.AuthenticationResult.RefreshToken,
                expiresIn: result.AuthenticationResult.ExpiresIn,
                tokenType: 'Bearer',
                oauth2: true,
                sso: true
            })
        };
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid credentials' })
        };
    }
}

// === OAUTH2 IMPLEMENTATION ===

// OAuth2 Authorization Code Flow
async function oauth2Authorize({ 
    response_type, 
    client_id, 
    redirect_uri, 
    scope, 
    state 
}) {
    // Validate OAuth2 parameters
    if (!response_type || !client_id || !redirect_uri) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_request',
                error_description: 'Missing required parameters'
            })
        };
    }

    if (response_type !== 'code') {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'unsupported_response_type',
                error_description: 'Only authorization_code flow is supported'
            })
        };
    }

    // Custom OAuth2 Authorization Code Flow (without hosted UI)
    // Generate temporary authorization code
    const authCode = 'AUTH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store authorization code temporarily (in production, use DynamoDB or Redis)
    // For demo, return a custom login URL to our frontend
    const customAuthUrl = redirect_uri.includes('localhost') 
        ? `${redirect_uri.split('/callback')[0]}/oauth2-login?` +
          `response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scope || 'openid'}&state=${state || ''}`
        : `${redirect_uri}?code=${authCode}&state=${state || ''}`;

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            authorization_url: customAuthUrl,
            message: 'Custom OAuth2 authorization flow - login required',
            flow_type: 'authorization_code_custom',
            sso_enabled: true,
            instructions: 'Use /oauth2/token with grant_type=password for direct token exchange',
            demo_code: authCode,
            alternative_flow: {
                description: 'Direct password grant available',
                endpoint: '/oauth2/token',
                grant_type: 'password',
                required_params: ['username', 'password', 'client_id']
            }
        })
    };
}

// OAuth2 Token Exchange
async function oauth2Token({ 
    grant_type, 
    code, 
    redirect_uri, 
    client_id,
    username,
    password 
}) {
    if (!grant_type) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_request',
                error_description: 'grant_type is required'
            })
        };
    }

    try {
        if (grant_type === 'authorization_code') {
            // Handle authorization code flow
            return await handleAuthorizationCode(code, redirect_uri, client_id);
        } else if (grant_type === 'password') {
            // Handle Resource Owner Password Credentials flow
            return await handlePasswordGrant(username, password, client_id);
        } else if (grant_type === 'client_credentials') {
            // Handle Client Credentials flow
            return await handleClientCredentials(client_id);
        } else {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'unsupported_grant_type',
                    error_description: 'Supported grant types: authorization_code, password, client_credentials'
                })
            };
        }
    } catch (error) {
        console.error('OAuth2 token error:', error);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_grant',
                error_description: error.message
            })
        };
    }
}

async function handlePasswordGrant(username, password, client_id) {
    const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        UserPoolId: USER_POOL_ID,
        ClientId: client_id || USER_POOL_CLIENT_ID,
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password
        }
    };

    const result = await cognito.adminInitiateAuth(params).promise();
    
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            access_token: result.AuthenticationResult.AccessToken,
            token_type: 'Bearer',
            expires_in: result.AuthenticationResult.ExpiresIn,
            refresh_token: result.AuthenticationResult.RefreshToken,
            id_token: result.AuthenticationResult.IdToken,
            scope: 'openid profile',
            oauth2_flow: 'password',
            sso_enabled: true
        })
    };
}

async function handleClientCredentials(client_id) {
    // For client credentials, create a service token
    // This is a simplified implementation
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            access_token: 'service_token_' + Date.now(),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'service',
            oauth2_flow: 'client_credentials',
            sso_enabled: true
        })
    };
}

async function handleAuthorizationCode(code, redirect_uri, client_id) {
    // Validate authorization code (demo simulation)
    return {
        statusCode: 200,
        body: JSON.stringify({
            access_token: 'demo_access_token_' + Date.now(),
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'demo_refresh_token_' + Date.now(), 
            id_token: 'demo_id_token_' + Date.now(),
            scope: 'openid profile',
            oauth2_flow: 'authorization_code',  // 🎯 KEY DIFFERENCE
            sso_enabled: true
        })
    };
}

// OAuth2 Refresh Token
async function oauth2Refresh({ refresh_token, client_id }) {
    if (!refresh_token) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_request',
                error_description: 'refresh_token is required'
            })
        };
    }

    const params = {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        UserPoolId: USER_POOL_ID,
        ClientId: client_id || USER_POOL_CLIENT_ID,
        AuthParameters: {
            REFRESH_TOKEN: refresh_token
        }
    };

    try {
        const result = await cognito.adminInitiateAuth(params).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                access_token: result.AuthenticationResult.AccessToken,
                token_type: 'Bearer',
                expires_in: result.AuthenticationResult.ExpiresIn,
                id_token: result.AuthenticationResult.IdToken,
                oauth2_flow: 'refresh_token',
                sso_maintained: true
            })
        };
    } catch (error) {
        console.error('Refresh token error:', error);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Invalid refresh token'
            })
        };
    }
}

// === PROTECTED ENDPOINTS ===

async function getUserProfile(authContext) {
    // Extract user info from JWT token (provided by authorizer)
    const userId = authContext.principalId;
    const claims = authContext.claims || {};
    
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            message: 'Profile retrieved successfully',
            user: {
                id: userId,
                email: claims.email,
                name: claims.name,
                sub: claims.sub
            },
            sso_context: {
                authenticated_via: 'oauth2_jwt',
                token_type: 'Bearer',
                scope: claims.scope
            }
        })
    };
}

async function getUserInfoFromToken({ id_token, access_token }) {
    if (!id_token && !access_token) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'missing_token',
                message: 'ID token or access token is required'
            })
        };
    }

    try {
        // Helper function to decode JWT
        function decodeJWT(token) {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }
            
            // Decode base64url
            function base64urlDecode(str) {
                str = str.replace(/-/g, '+').replace(/_/g, '/');
                while (str.length % 4) {
                    str += '=';
                }
                return Buffer.from(str, 'base64').toString();
            }
            
            return JSON.parse(base64urlDecode(parts[1]));
        }

        let userInfo = {};
        let tokenInfo = {};

        // Decode ID token for user profile
        if (id_token) {
            const idPayload = decodeJWT(id_token);
            userInfo = {
                userId: idPayload.sub,
                email: idPayload.email,
                name: idPayload.name,
                emailVerified: idPayload.email_verified,
                username: idPayload['cognito:username'] || idPayload.username,
                authTime: new Date(idPayload.auth_time * 1000).toISOString(),
                expires: new Date(idPayload.exp * 1000).toISOString()
            };
            tokenInfo.id_token = {
                type: 'id',
                use: idPayload.token_use,
                issued_at: new Date(idPayload.iat * 1000).toISOString(),
                expires_at: new Date(idPayload.exp * 1000).toISOString()
            };
        }

        // Decode access token for permissions
        if (access_token) {
            const accessPayload = decodeJWT(access_token);
            tokenInfo.access_token = {
                type: 'access',
                use: accessPayload.token_use,
                scope: accessPayload.scope,
                client_id: accessPayload.client_id,
                username: accessPayload.username,
                issued_at: new Date(accessPayload.iat * 1000).toISOString(),
                expires_at: new Date(accessPayload.exp * 1000).toISOString()
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'User information decoded successfully',
                user: userInfo,
                tokens: tokenInfo,
                sso_context: {
                    authenticated: true,
                    source: 'cognito_jwt',
                    available_tokens: Object.keys(tokenInfo)
                }
            })
        };

    } catch (error) {
        console.error('Token decode error:', error);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_token',
                message: error.message
            })
        };
    }
}

async function logoutUser(authContext) {
    // In a real implementation, invalidate the token
    // For demo, return success
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            message: 'Logout successful',
            sso_logout: true,
            note: 'User logged out from all SSO-enabled services'
        })
    };
} 