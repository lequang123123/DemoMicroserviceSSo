const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_dXp683hoC';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID || 'h1098nsapivi7j0nn3imjm4i5';
const AUTH_CODES_TABLE = process.env.AUTH_CODES_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE; // Added for session management

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
};

// Helper function to validate client_id
async function validateClientId(clientId) {
    if (clientId !== USER_POOL_CLIENT_ID) {
        throw new Error('Invalid client_id');
    }
    return true;
}

// Helper function to store auth code
async function storeAuthCode(code, clientId, redirectUri, metadata = {}) {
    const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes expiry
    
    await dynamodb.put({
        TableName: AUTH_CODES_TABLE,
        Item: {
            code,
            clientId,
            redirectUri,
            expiresAt,
            createdAt: Date.now(),
            metadata: metadata,
            username: metadata.username // Add username from metadata
        }
    }).promise();
}

// Helper function to validate and consume auth code
async function validateAndConsumeAuthCode(code, clientId, redirectUri) {
    const result = await dynamodb.get({
        TableName: AUTH_CODES_TABLE,
        Key: { code }
    }).promise();

    const authCode = result.Item;
    if (!authCode) {
        throw new Error('Invalid authorization code');
    }

    if (authCode.expiresAt < Math.floor(Date.now() / 1000)) {
        throw new Error('Authorization code expired');
    }

    if (authCode.clientId !== clientId) {
        throw new Error('Client ID mismatch');
    }

    if (authCode.redirectUri !== redirectUri) {
        throw new Error('Redirect URI mismatch');
    }

    // Delete the used code
    await dynamodb.delete({
        TableName: AUTH_CODES_TABLE,
        Key: { code }
    }).promise();

    return { username: authCode.username, metadata: authCode.metadata };
}

function parseRequestBody(body, contentType) {
    if (!body) return {};
    
    if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
        const params = {};
        body.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
        return params;
    }
    
    try {
        return JSON.parse(body);
    } catch (e) {
        console.error('Error parsing body:', e);
        return {};
    }
}

exports.handler = async (event) => {
    try {
        console.log('Event:', JSON.stringify(event));
        
        const { httpMethod, path, body, headers, queryStringParameters } = event;
        const requestBody = parseRequestBody(body, headers['content-type']);
        
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
            return await oauth2Authorize(queryStringParameters, headers);
        }
        
        if (path === '/oauth2/token' && httpMethod === 'POST') {
            return await oauth2Token(requestBody);
        }
        
        if (path === '/oauth2/refresh' && httpMethod === 'POST') {
            return await oauth2Token(requestBody);
        }

        if (path === '/oauth2/userinfo' && httpMethod === 'GET') {
            return await getUserInfo(event.headers.Authorization);
        }
        
        // === COGNITO HOSTED UI CALLBACK ===
        if (path === '/oauth2/callback' && httpMethod === 'GET') {
            return await handleCognitoCallback(queryStringParameters);
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

async function loginUser(requestBody) {
    const { email, username, password, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = requestBody;
    // Accept either email or username
    const userEmail = email || username;

    if (!userEmail || !password) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Email/username and password are required' })
        };
    }

    const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        UserPoolId: USER_POOL_ID,
        ClientId: USER_POOL_CLIENT_ID,
        AuthParameters: {
            USERNAME: userEmail,
            PASSWORD: password
        }
    };

    try {
        const result = await cognito.adminInitiateAuth(params).promise();
        
        // Check if this is an OAuth2 login flow
        if (client_id && redirect_uri) {
            // This is OAuth2 flow, generate authorization code
            const code = generateAuthCode();
            
                    // Store auth code with PKCE info and password for token exchange
        await storeAuthCode(code, client_id, redirect_uri, {
            username: userEmail,
            password: password, // Store password for token exchange
            scope: scope || 'openid profile email',
            code_challenge: code_challenge,
            code_challenge_method: code_challenge_method
        });

            // Return redirect URI with auth code
            const redirectUrl = new URL(redirect_uri);
            redirectUrl.searchParams.set('code', code);
            if (state) {
                redirectUrl.searchParams.set('state', state);
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    redirect_uri: redirectUrl.toString(),
                    message: 'OAuth2 authorization successful'
                })
            };
        } else {
            // Regular login flow
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: 'Login successful',
                    accessToken: result.AuthenticationResult.AccessToken,
                    idToken: result.AuthenticationResult.IdToken,
                    refreshToken: result.AuthenticationResult.RefreshToken,
                    expiresIn: result.AuthenticationResult.ExpiresIn,
                    tokenType: result.AuthenticationResult.TokenType,
                    oauth2: true,
                    sso: true
                })
            };
        }
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ 
                message: error.message || 'Invalid credentials',
                error: error.code
            })
        };
    }
}

// Helper function to generate random string
function generateRandomString(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
}

// Helper function to generate auth code
function generateAuthCode() {
    const timestamp = Date.now();
    const random = generateRandomString(64);
    return `AUTH_${timestamp}_${random}`;
}

// === OAUTH2 IMPLEMENTATION ===

// OAuth2 Authorization Code Flow
async function oauth2Authorize({ response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method }, headers) {
    try {
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

        // Validate client_id
        await validateClientId(client_id);

        // Parse and validate scope
        const scopes = scope ? scope.split(' ') : ['openid', 'profile', 'email'];
        const validScopes = ['openid', 'profile', 'email'];
        for (const s of scopes) {
            if (!validScopes.includes(s)) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        error: 'invalid_scope',
                        error_description: `Invalid scope: ${s}`
                    })
                };
            }
        }

        // Validate PKCE parameters
        if (code_challenge && !['S256', 'plain'].includes(code_challenge_method)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'invalid_request',
                    error_description: 'Invalid code_challenge_method'
                })
            };
        }

        // 🔐 SSO Flow: Handle authentication directly in Lambda
        // Instead of redirecting to Cognito Hosted UI, we'll handle it ourselves
        const code = generateAuthCode();
        
        // Store auth code with metadata
        await storeAuthCode(code, client_id, redirect_uri, {
            scope: scope || 'email openid phone profile',
            state: state || '',
            code_challenge: code_challenge,
            code_challenge_method: code_challenge_method
        });

        // Return redirect URI with auth code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) {
            redirectUrl.searchParams.set('state', state);
        }

        return {
            statusCode: 302,
            headers: {
                ...corsHeaders,
                'Location': redirectUrl.toString()
            },
            body: ''
        };

    } catch (error) {
        console.error('Authorization error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'server_error',
                error_description: 'Internal server error'
            })
        };
    }
}

// OAuth2 Token Exchange
async function oauth2Token({ 
    grant_type, 
    code, 
    redirect_uri, 
    client_id,
    username,
    password,
    code_verifier,
    refresh_token
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
        // Validate client_id
        await validateClientId(client_id);

        if (grant_type === 'authorization_code') {
            // Handle authorization code flow
            return await handleAuthorizationCode(code, redirect_uri, client_id, code_verifier);
        } else if (grant_type === 'password') {
            // Handle Resource Owner Password Credentials flow
            return await handlePasswordGrant(username, password, client_id);
        } else if (grant_type === 'client_credentials') {
            // Handle Client Credentials flow
            return await handleClientCredentials(client_id);
        } else if (grant_type === 'refresh_token') {
            // Handle Refresh Token flow
            return await handleRefreshToken(refresh_token, client_id);
        } else {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'unsupported_grant_type',
                    error_description: 'Supported grant types: authorization_code, password, client_credentials, refresh_token'
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
        ClientId: client_id,
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
    // For client credentials, we'll create a service token
    // In production, you should have pre-configured service accounts
    const serviceToken = generateRandomString(64);
    
    // Store service token in DynamoDB (you should have a separate table for this)
    await dynamodb.put({
        TableName: SESSIONS_TABLE,
        Item: {
            token: serviceToken,
            client_id: client_id,
            token_type: 'service',
            expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
            created_at: Date.now()
        }
    }).promise();

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            access_token: serviceToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'service',
            oauth2_flow: 'client_credentials',
            sso_enabled: true
        })
    };
}

// Helper function to handle authorization code exchange with PKCE
async function handleAuthorizationCode(code, redirectUri, clientId, codeVerifier) {
    const { username, metadata } = await validateAndConsumeAuthCode(code, clientId, redirectUri);

    // Validate PKCE if code_challenge was provided
    if (metadata.code_challenge) {
        if (!codeVerifier) {
            throw new Error('code_verifier is required when code_challenge was provided');
        }

        let expectedChallenge;
        if (metadata.code_challenge_method === 'S256') {
            const crypto = require('crypto');
            expectedChallenge = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        } else if (metadata.code_challenge_method === 'plain') {
            expectedChallenge = codeVerifier;
        }

        if (expectedChallenge !== metadata.code_challenge) {
            throw new Error('Invalid code_verifier');
        }
    }

    try {
        // Get user info
        const userInfo = await cognito.adminGetUser({
            UserPoolId: USER_POOL_ID,
            Username: username
        }).promise();

        // Generate new tokens using stored password
        const params = {
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            UserPoolId: USER_POOL_ID,
            ClientId: clientId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: metadata.password // Use stored password
            }
        };

        const result = await cognito.adminInitiateAuth(params).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                access_token: result.AuthenticationResult.AccessToken,
                id_token: result.AuthenticationResult.IdToken,
                refresh_token: result.AuthenticationResult.RefreshToken,
                token_type: 'Bearer',
                expires_in: result.AuthenticationResult.ExpiresIn,
                scope: metadata.scope || 'openid profile email'
            })
        };
    } catch (error) {
        console.error('Token exchange error:', error);
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

// Helper function to handle refresh token
async function handleRefreshToken(refreshToken, clientId) {
    if (!refreshToken) {
        throw new Error('refresh_token is required');
    }

    try {
        const params = {
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            UserPoolId: USER_POOL_ID,
            ClientId: clientId,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken
            }
        };

        const result = await cognito.adminInitiateAuth(params).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                access_token: result.AuthenticationResult.AccessToken,
                id_token: result.AuthenticationResult.IdToken,
                token_type: 'Bearer',
                expires_in: result.AuthenticationResult.ExpiresIn,
                scope: 'openid profile email'
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

// Helper function to get user info from token
async function getUserInfo(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_token',
                error_description: 'Authorization header missing or invalid'
            })
        };
    }

    const token = authorizationHeader.replace('Bearer ', '');
    try {
        const userInfo = await cognito.getUser({
            AccessToken: token
        }).promise();

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                sub: userInfo.Username,
                email: userInfo.Attributes.find(attr => attr.Name === 'email')?.Value,
                name: userInfo.Attributes.find(attr => attr.Name === 'name')?.Value,
                given_name: userInfo.Attributes.find(attr => attr.Name === 'given_name')?.Value,
                family_name: userInfo.Attributes.find(attr => attr.Name === 'family_name')?.Value,
                email_verified: userInfo.Attributes.find(attr => attr.Name === 'email_verified')?.Value === 'true',
                updated_at: userInfo.UserLastModifiedDate,
                iss: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
                aud: USER_POOL_CLIENT_ID,
                auth_time: Math.floor(Date.now() / 1000)
            })
        };
    } catch (error) {
        console.error('Get user info error:', error);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'invalid_token',
                error_description: error.message
            })
        };
    }
}

// Helper function to get user profile
async function getUserProfile(authorizer) {
    if (!authorizer) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }

    const token = authorizer.Authorization.replace('Bearer ', '');
    try {
        const userInfo = await cognito.getUser({
            AccessToken: token
        }).promise();

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                sub: userInfo.Username,
                email: userInfo.Attributes.find(attr => attr.Name === 'email')?.Value,
                name: userInfo.Attributes.find(attr => attr.Name === 'name')?.Value,
                given_name: userInfo.Attributes.find(attr => attr.Name === 'given_name')?.Value,
                family_name: userInfo.Attributes.find(attr => attr.Name === 'family_name')?.Value,
                email_verified: userInfo.Attributes.find(attr => attr.Name === 'email_verified')?.Value === 'true',
                updated_at: userInfo.UserLastModifiedDate,
                iss: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
                aud: USER_POOL_CLIENT_ID,
                auth_time: Math.floor(Date.now() / 1000)
            })
        };
    } catch (error) {
        console.error('Get user profile error:', error);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }
}

// Helper function to get user info from token (for /auth/user-info)
async function getUserInfoFromToken(requestBody) {
    const { token } = requestBody;
    if (!token) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Token is required' })
        };
    }

    try {
        const userInfo = await cognito.getUser({
            AccessToken: token
        }).promise();

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                sub: userInfo.Username,
                email: userInfo.Attributes.find(attr => attr.Name === 'email')?.Value,
                name: userInfo.Attributes.find(attr => attr.Name === 'name')?.Value,
                given_name: userInfo.Attributes.find(attr => attr.Name === 'given_name')?.Value,
                family_name: userInfo.Attributes.find(attr => attr.Name === 'family_name')?.Value,
                email_verified: userInfo.Attributes.find(attr => attr.Name === 'email_verified')?.Value === 'true',
                updated_at: userInfo.UserLastModifiedDate,
                iss: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
                aud: USER_POOL_CLIENT_ID,
                auth_time: Math.floor(Date.now() / 1000)
            })
        };
    } catch (error) {
        console.error('Get user info from token error:', error);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid token' })
        };
    }
}

// Helper function to logout user
async function logoutUser(authorizer) {
    if (!authorizer) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }

    const token = authorizer.Authorization.replace('Bearer ', '');
    try {
        await cognito.globalSignOut({
            AccessToken: token
        }).promise();

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Logged out successfully' })
        };
    } catch (error) {
        console.error('Logout error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
}

// Helper function to handle Cognito Hosted UI callback
async function handleCognitoCallback({ code, state, error, error_description }) {
    try {
        // Check for errors from Cognito
        if (error) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: error,
                    error_description: error_description || 'Authorization failed'
                })
            };
        }

        if (!code) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'invalid_request',
                    error_description: 'Authorization code is required'
                })
            };
        }

        // Exchange authorization code for tokens using Cognito
        const tokenEndpoint = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/oauth2/token`;
        
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: USER_POOL_CLIENT_ID,
            code: code,
            redirect_uri: 'http://localhost:3000/callback' // Should match the one used in authorize
        });

        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams.toString()
        });

        const tokenResult = await tokenResponse.json();

        if (!tokenResponse.ok) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'token_exchange_failed',
                    error_description: tokenResult.error_description || 'Failed to exchange authorization code'
                })
            };
        }

        // Return tokens to client
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                access_token: tokenResult.access_token,
                id_token: tokenResult.id_token,
                refresh_token: tokenResult.refresh_token,
                token_type: tokenResult.token_type || 'Bearer',
                expires_in: tokenResult.expires_in,
                scope: tokenResult.scope,
                sso_enabled: true,
                cognito_hosted_ui: true
            })
        };

    } catch (error) {
        console.error('Cognito callback error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'server_error',
                error_description: 'Internal server error during callback processing'
            })
        };
    }
}