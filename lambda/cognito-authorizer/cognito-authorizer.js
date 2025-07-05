const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const REGION = process.env.AWS_REGION;

// JWKS client for verifying JWT tokens
const client = jwksClient({
    jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 300000, // 5 minutes
    cacheMaxEntries: 5,
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const token = extractToken(event);
        
        if (!token) {
            throw new Error('No token provided');
        }
        
        const decoded = await verifyToken(token);
        const policy = generatePolicy(decoded.sub, 'Allow', event.methodArn, decoded);
        
        return policy;
    } catch (error) {
        console.error('Authorization error:', error);
        throw new Error('Unauthorized');
    }
};

// Extract token from Authorization header
function extractToken(event) {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    
    if (!authHeader) {
        return null;
    }
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    
    return parts[1];
}

// Verify JWT token
async function verifyToken(token) {
    return new Promise((resolve, reject) => {
        // Decode token header to get the key ID
        const decoded = jwt.decode(token, { complete: true });
        
        if (!decoded || !decoded.header || !decoded.header.kid) {
            reject(new Error('Invalid token structure'));
            return;
        }
        
        // Get the signing key from JWKS
        client.getSigningKey(decoded.header.kid, (err, key) => {
            if (err) {
                reject(err);
                return;
            }
            
            const signingKey = key.getPublicKey();
            
            // Verify the token
            jwt.verify(token, signingKey, {
                algorithms: ['RS256'],
                issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
                audience: USER_POOL_CLIENT_ID
            }, (err, decoded) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Additional validations
                if (decoded.token_use !== 'access') {
                    reject(new Error('Token is not an access token'));
                    return;
                }
                
                if (decoded.client_id !== USER_POOL_CLIENT_ID) {
                    reject(new Error('Token client_id does not match'));
                    return;
                }
                
                resolve(decoded);
            });
        });
    });
}

// Generate IAM policy
function generatePolicy(principalId, effect, resource, context = {}) {
    const authResponse = {
        principalId: principalId
    };
    
    if (effect && resource) {
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                }
            ]
        };
        
        authResponse.policyDocument = policyDocument;
    }
    
    // Add context to pass user information to the Lambda function
    authResponse.context = {
        userId: principalId,
        username: context.username || principalId,
        email: context.email || '',
        tokenExpiration: context.exp || 0,
        clientId: context.client_id || '',
        scope: context.scope || ''
    };
    
    return authResponse;
}

// Generate policy for specific user actions
function generateUserPolicy(principalId, effect, resource, userInfo) {
    const authResponse = {
        principalId: principalId
    };
    
    if (effect && resource) {
        const statements = [];
        
        // Allow access to user's own resources
        statements.push({
            Action: 'execute-api:Invoke',
            Effect: effect,
            Resource: resource
        });
        
        // Add additional permissions based on user role
        if (userInfo.role === 'admin') {
            statements.push({
                Action: 'execute-api:Invoke',
                Effect: 'Allow',
                Resource: resource.replace('*', 'admin/*')
            });
        }
        
        const policyDocument = {
            Version: '2012-10-17',
            Statement: statements
        };
        
        authResponse.policyDocument = policyDocument;
    }
    
    // Enhanced context with user details
    authResponse.context = {
        userId: principalId,
        username: userInfo.username || principalId,
        email: userInfo.email || '',
        role: userInfo.role || 'user',
        tokenExpiration: userInfo.exp || 0,
        clientId: userInfo.client_id || '',
        scope: userInfo.scope || '',
        isAdmin: userInfo.role === 'admin' ? 'true' : 'false'
    };
    
    return authResponse;
}

// Utility function to check if token is about to expire
function isTokenExpiring(exp, bufferMinutes = 5) {
    const now = Math.floor(Date.now() / 1000);
    const buffer = bufferMinutes * 60;
    return (exp - now) <= buffer;
}

// Utility function to extract user groups from token
function extractUserGroups(token) {
    try {
        const decoded = jwt.decode(token);
        return decoded['cognito:groups'] || [];
    } catch (error) {
        console.error('Error extracting user groups:', error);
        return [];
    }
}

// Enhanced token validation with additional checks
async function validateTokenWithGroups(token) {
    try {
        const decoded = await verifyToken(token);
        const groups = extractUserGroups(token);
        
        // Check if token is about to expire
        if (isTokenExpiring(decoded.exp)) {
            console.warn('Token is about to expire:', decoded.exp);
        }
        
        // Add groups to decoded token
        decoded.groups = groups;
        
        return decoded;
    } catch (error) {
        console.error('Token validation error:', error);
        throw error;
    }
}

module.exports = {
    handler: exports.handler,
    extractToken,
    verifyToken,
    generatePolicy,
    generateUserPolicy,
    isTokenExpiring,
    extractUserGroups,
    validateTokenWithGroups
}; 