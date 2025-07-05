const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USERS_TABLE = process.env.USERS_TABLE_NAME;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const { action, userId, requesterId, body } = event;
        
        switch (action) {
            case 'getProfile':
                return await getUserProfile(userId);
            case 'updateProfile':
                return await updateUserProfile(userId, JSON.parse(body));
            case 'getUser':
                return await getUser(userId, requesterId);
            case 'createUser':
                return await createUser(JSON.parse(body));
            case 'deleteUser':
                return await deleteUser(userId, requesterId);
            case 'listUsers':
                return await listUsers(requesterId);
            default:
                return errorResponse(400, 'Invalid action');
        }
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(500, 'Internal server error');
    }
};

// Get user profile
async function getUserProfile(userId) {
    try {
        const result = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        if (!result.Item) {
            return errorResponse(404, 'User not found');
        }
        
        // Remove sensitive information
        const { password, ...userProfile } = result.Item;
        
        return successResponse(userProfile);
    } catch (error) {
        console.error('Error getting user profile:', error);
        throw error;
    }
}

// Update user profile
async function updateUserProfile(userId, userData) {
    try {
        const { email, firstName, lastName, phone, address } = userData;
        
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        if (email) {
            updateExpression.push('#email = :email');
            expressionAttributeNames['#email'] = 'email';
            expressionAttributeValues[':email'] = email;
        }
        
        if (firstName) {
            updateExpression.push('#firstName = :firstName');
            expressionAttributeNames['#firstName'] = 'firstName';
            expressionAttributeValues[':firstName'] = firstName;
        }
        
        if (lastName) {
            updateExpression.push('#lastName = :lastName');
            expressionAttributeNames['#lastName'] = 'lastName';
            expressionAttributeValues[':lastName'] = lastName;
        }
        
        if (phone) {
            updateExpression.push('#phone = :phone');
            expressionAttributeNames['#phone'] = 'phone';
            expressionAttributeValues[':phone'] = phone;
        }
        
        if (address) {
            updateExpression.push('#address = :address');
            expressionAttributeNames['#address'] = 'address';
            expressionAttributeValues[':address'] = address;
        }
        
        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        
        const result = await dynamodb.update({
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }).promise();
        
        // Remove sensitive information
        const { password, ...userProfile } = result.Attributes;
        
        return successResponse(userProfile);
    } catch (error) {
        console.error('Error updating user profile:', error);
        throw error;
    }
}

// Get user by ID (admin only)
async function getUser(userId, requesterId) {
    try {
        // Check if requester is admin
        const requester = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId: requesterId }
        }).promise();
        
        if (!requester.Item || requester.Item.role !== 'admin') {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        const result = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        if (!result.Item) {
            return errorResponse(404, 'User not found');
        }
        
        // Remove sensitive information
        const { password, ...userProfile } = result.Item;
        
        return successResponse(userProfile);
    } catch (error) {
        console.error('Error getting user:', error);
        throw error;
    }
}

// Create user
async function createUser(userData) {
    try {
        const { email, firstName, lastName, phone, role = 'user' } = userData;
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const user = {
            userId,
            email,
            firstName,
            lastName,
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
        
        return successResponse(user);
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

// Delete user (admin only)
async function deleteUser(userId, requesterId) {
    try {
        // Check if requester is admin
        const requester = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId: requesterId }
        }).promise();
        
        if (!requester.Item || requester.Item.role !== 'admin') {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        await dynamodb.delete({
            TableName: USERS_TABLE,
            Key: { userId }
        }).promise();
        
        return successResponse({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        throw error;
    }
}

// List users (admin only)
async function listUsers(requesterId) {
    try {
        // Check if requester is admin
        const requester = await dynamodb.get({
            TableName: USERS_TABLE,
            Key: { userId: requesterId }
        }).promise();
        
        if (!requester.Item || requester.Item.role !== 'admin') {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        const result = await dynamodb.scan({
            TableName: USERS_TABLE,
            ProjectionExpression: 'userId, email, firstName, lastName, #role, createdAt, #status',
            ExpressionAttributeNames: {
                '#role': 'role',
                '#status': 'status'
            }
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error listing users:', error);
        throw error;
    }
}

// Helper functions
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