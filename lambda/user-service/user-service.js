const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

const USERS_TABLE = process.env.USERS_TABLE || process.env.USERS_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
    try {
        console.log('Event:', JSON.stringify(event));
        
        const { httpMethod, path, body, pathParameters } = event;
        const requestBody = body ? JSON.parse(body) : {};
        const userId = pathParameters?.id;
        
        // Get user info from JWT authorizer context
        const userContext = event.requestContext?.authorizer || {};
        const currentUserId = userContext.sub || userContext.userId;
        const userEmail = userContext.email;
        
        // Route handling based on path and method
        if (path === '/users' && httpMethod === 'GET') {
            return await listUsers(currentUserId, userContext);
        }
        
        if (path === '/users' && httpMethod === 'POST') {
            return await handleUserAction(requestBody, currentUserId, userContext);
        }
        
        if (path.startsWith('/users/') && userId && httpMethod === 'GET') {
            return await getUserById(userId, currentUserId, userContext);
        }
        
        if (path.startsWith('/users/') && userId && httpMethod === 'PUT') {
            return await updateUser(userId, requestBody, currentUserId, userContext);
        }
        
        if (path.startsWith('/users/') && userId && httpMethod === 'DELETE') {
            return await deleteUser(userId, currentUserId, userContext);
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
            body: JSON.stringify({ message: 'Internal server error', error: error.message })
        };
    }
};

// === USER MANAGEMENT FUNCTIONS ===

async function listUsers(currentUserId, userContext) {
    try {
        // Check if user has admin role or list their own profile
        const isAdmin = await checkAdminRole(currentUserId);
        
        if (!isAdmin) {
            // Non-admin users can only see their own profile
            return await getUserProfile(currentUserId);
        }
        
        // Admin can see all users
        const result = await dynamodb.scan({
            TableName: USERS_TABLE,
            ProjectionExpression: 'userId, email, #name, givenName, familyName, createdAt, updatedAt, #status, #role',
            ExpressionAttributeNames: {
                '#name': 'name',
                '#status': 'status',
                '#role': 'role'
            }
        }).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                users: result.Items || [],
                count: result.Count,
                isAdmin: true
            })
        };
    } catch (error) {
        console.error('Error listing users:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error retrieving users' })
        };
    }
}

async function handleUserAction(requestBody, currentUserId, userContext) {
    const { action } = requestBody;
    
    try {
        switch (action) {
            case 'getProfile':
                return await getUserProfile(currentUserId);
            case 'updateProfile':
                return await updateUserProfile(currentUserId, requestBody.userData);
            case 'syncFromCognito':
                return await syncUserFromCognito(currentUserId, userContext);
            case 'createUser':
                return await createUser(requestBody.userData, currentUserId);
            case 'list':
                return await listUsers(currentUserId, userContext);
            default:
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Invalid action' })
                };
        }
    } catch (error) {
        console.error('Error handling user action:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error processing action' })
        };
    }
}

async function getUserById(userId, currentUserId, userContext) {
    try {
        // Users can access their own profile, admins can access any profile
        const isAdmin = await checkAdminRole(currentUserId);
        
        if (!isAdmin && userId !== currentUserId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Access denied' })
            };
        }
        
        return await getUserProfile(userId);
    } catch (error) {
        console.error('Error getting user by ID:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error retrieving user' })
        };
    }
}

async function updateUser(userId, userData, currentUserId, userContext) {
    try {
        // Users can update their own profile, admins can update any profile
        const isAdmin = await checkAdminRole(currentUserId);
        
        if (!isAdmin && userId !== currentUserId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Access denied' })
            };
        }
        
        return await updateUserProfile(userId, userData);
    } catch (error) {
        console.error('Error updating user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error updating user' })
        };
    }
}

async function deleteUser(userId, currentUserId, userContext) {
    try {
        // Only admins can delete users
        const isAdmin = await checkAdminRole(currentUserId);
        
        if (!isAdmin) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Admin access required' })
            };
        }
        
        // Delete from DynamoDB
        await dynamodb.delete({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        // Optionally delete from Cognito too
        try {
            const user = await dynamodb.get({
                TableName: USERS_TABLE,
                Key: { userId }
            }).promise();
            
            if (user.Item?.email) {
                await cognito.adminDeleteUser({
                    UserPoolId: USER_POOL_ID,
                    Username: user.Item.email
                }).promise();
            }
        } catch (cognitoError) {
            console.log('Could not delete from Cognito:', cognitoError.message);
        }
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User deleted successfully' })
        };
    } catch (error) {
        console.error('Error deleting user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error deleting user' })
        };
    }
}

// === HELPER FUNCTIONS ===

async function getUserProfile(userId) {
    try {
        const result = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        if (!result.Item) {
            // If user doesn't exist in DynamoDB, try to create from Cognito
            try {
                const cognitoUser = await cognito.adminGetUser({
                    UserPoolId: USER_POOL_ID,
                    Username: userId
                }).promise();
                
                // Create user in DynamoDB from Cognito data
                const userData = extractUserDataFromCognito(cognitoUser);
                await createUserInDynamoDB(userData);
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(userData)
                };
            } catch (cognitoError) {
                return {
                    statusCode: 404,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'User not found' })
                };
            }
        }
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(result.Item)
        };
    } catch (error) {
        console.error('Error getting user profile:', error);
        throw error;
    }
}

async function updateUserProfile(userId, userData) {
    try {
        const { email, name, givenName, familyName, phone, address } = userData;
        
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        if (email) {
            updateExpression.push('#email = :email');
            expressionAttributeNames['#email'] = 'email';
            expressionAttributeValues[':email'] = email;
        }
        
        if (name) {
            updateExpression.push('#name = :name');
            expressionAttributeNames['#name'] = 'name';
            expressionAttributeValues[':name'] = name;
        }
        
        if (givenName) {
            updateExpression.push('givenName = :givenName');
            expressionAttributeValues[':givenName'] = givenName;
        }
        
        if (familyName) {
            updateExpression.push('familyName = :familyName');
            expressionAttributeValues[':familyName'] = familyName;
        }
        
        if (phone) {
            updateExpression.push('phone = :phone');
            expressionAttributeValues[':phone'] = phone;
        }
        
        if (address) {
            updateExpression.push('address = :address');
            expressionAttributeValues[':address'] = address;
        }
        
        updateExpression.push('updatedAt = :updatedAt');
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        
        const result = await dynamodb.update({
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(result.Attributes)
        };
    } catch (error) {
        console.error('Error updating user profile:', error);
        throw error;
    }
}

async function createUser(userData, requesterId) {
    try {
        // Check if requester is admin
        const isAdmin = await checkAdminRole(requesterId);
        
        if (!isAdmin) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Admin access required' })
            };
        }
        
        const { email, name, givenName, familyName, phone, role = 'user' } = userData;
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const user = {
            userId,
            email,
            name: name || `${givenName || ''} ${familyName || ''}`.trim(),
            givenName,
            familyName,
            phone,
            role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active'
        };
        
        await dynamodb.put({
            TableName: USERS_TABLE,
            Item: user,
            ConditionExpression: 'attribute_not_exists(userId)'
        }).promise();
        
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify(user)
        };
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

async function syncUserFromCognito(userId, userContext) {
    try {
        const cognitoUser = await cognito.adminGetUser({
            UserPoolId: USER_POOL_ID,
            Username: userContext.email || userId
        }).promise();
        
        const userData = extractUserDataFromCognito(cognitoUser);
        userData.userId = userId;
        
        await dynamodb.put({
            TableName: USERS_TABLE,
            Item: userData
        }).promise();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'User synced from Cognito',
                user: userData
            })
        };
    } catch (error) {
        console.error('Error syncing user from Cognito:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error syncing user' })
        };
    }
}

async function checkAdminRole(userId) {
    try {
        const result = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId },
            ProjectionExpression: '#role',
            ExpressionAttributeNames: {
                '#role': 'role'
            }
        }).promise();
        
        return result.Item?.role === 'admin';
    } catch (error) {
        console.error('Error checking admin role:', error);
        return false;
    }
}

function extractUserDataFromCognito(cognitoUser) {
    const attributes = {};
    cognitoUser.UserAttributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
    });
    
    return {
        userId: cognitoUser.Username,
        email: attributes.email,
        name: attributes.name,
        givenName: attributes.given_name,
        familyName: attributes.family_name,
        phone: attributes.phone_number,
        createdAt: cognitoUser.UserCreateDate.toISOString(),
        updatedAt: new Date().toISOString(),
        status: cognitoUser.UserStatus.toLowerCase(),
        role: 'user' // Default role
    };
}

async function createUserInDynamoDB(userData) {
    try {
        await dynamodb.put({
            TableName: USERS_TABLE,
            Item: userData
        }).promise();
        
        return userData;
    } catch (error) {
        console.error('Error creating user in DynamoDB:', error);
        throw error;
    }
} 