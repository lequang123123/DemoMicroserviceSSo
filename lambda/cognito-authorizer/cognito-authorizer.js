const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const USER_POOL_ID = process.env.USER_POOL_ID;
const REGION = process.env.REGION || 'us-east-1';

// JWKS client for Cognito
const client = jwksClient({
    jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    cacheMaxAge: 3600000 // 1 hour
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            console.error('Error getting signing key:', err);
            callback(err);
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

function verifyToken(token) {
    return new Promise((resolve, reject) => {
        // Get token without 'Bearer ' prefix
        const cleanToken = token.replace('Bearer ', '');
        
        // Decode token header to get kid
        const decodedHeader = jwt.decode(cleanToken, { complete: true });
        if (!decodedHeader) {
            reject(new Error('Invalid token format'));
            return;
        }

        getKey(decodedHeader.header, (err, signingKey) => {
            if (err) {
                reject(err);
                return;
            }

            jwt.verify(cleanToken, signingKey, {
                algorithms: ['RS256'],
                issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
                audience: process.env.USER_POOL_CLIENT_ID
            }, (error, decoded) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(decoded);
                }
            });
        });
    });
}

function generatePolicy(principalId, effect, resource, context = {}) {
    const authResponse = {
        principalId: principalId
    };

    if (effect && resource) {
        authResponse.policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                }
            ]
        };
    }

    // Add user context to be passed to the Lambda function
    if (Object.keys(context).length > 0) {
        authResponse.context = context;
    }

    return authResponse;
}

exports.handler = async (event) => {
    console.log('Authorization event:', JSON.stringify(event, null, 2));
    
    const token = event.authorizationToken;
    const methodArn = event.methodArn;

    if (!token) {
        console.error('No token provided');
        throw new Error('Unauthorized');
    }

    try {
        // Verify JWT token
        const decoded = await verifyToken(token);
        console.log('Token verified successfully:', {
            sub: decoded.sub,
            email: decoded.email,
            tokenUse: decoded.token_use,
            scope: decoded.scope
        });

        // Extract user information from token
        const context = {
            userId: decoded.sub,
            email: decoded.email || '',
            name: decoded.name || '',
            scope: decoded.scope || '',
            tokenUse: decoded.token_use,
            clientId: decoded.client_id || decoded.aud,
            // OAuth2 context
            oauth2: 'true',
            sso: 'true',
            authMethod: 'jwt_bearer',
            // Convert claims to strings (API Gateway requirement)
            claims: JSON.stringify({
                sub: decoded.sub,
                email: decoded.email,
                name: decoded.name,
                scope: decoded.scope,
                iss: decoded.iss,
                aud: decoded.aud
            })
        };

        // Check token use (access vs id token)
        if (decoded.token_use === 'access') {
            // Access token - good for API access
            console.log('Access token validation successful');
        } else if (decoded.token_use === 'id') {
            // ID token - contains user identity info
            console.log('ID token validation successful');
        }

        // Generate allow policy
        const policy = generatePolicy(decoded.sub, 'Allow', methodArn, context);
        console.log('Generated policy:', JSON.stringify(policy, null, 2));
        
        return policy;

    } catch (error) {
        console.error('Token validation failed:', error.message);
        
        // For OAuth2 errors, we might want to return specific error codes
        if (error.name === 'TokenExpiredError') {
            console.error('Token expired');
            throw new Error('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            console.error('Invalid token');
            throw new Error('Invalid token');
        } else if (error.message.includes('jwks')) {
            console.error('JWKS error');
            throw new Error('Token validation error');
        }
        
        // Default unauthorized response
        throw new Error('Unauthorized');
    }
}; 