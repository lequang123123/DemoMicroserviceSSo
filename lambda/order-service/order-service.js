const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME;
const USER_SERVICE_ARN = process.env.USER_SERVICE_ARN;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const { action, userId, orderId, body } = event;
        
        switch (action) {
            case 'createOrder':
                return await createOrder(userId, JSON.parse(body));
            case 'getUserOrders':
                return await getUserOrders(userId);
            case 'getOrder':
                return await getOrder(orderId, userId);
            case 'updateOrder':
                return await updateOrder(orderId, userId, JSON.parse(body));
            case 'deleteOrder':
                return await deleteOrder(orderId, userId);
            case 'listAllOrders':
                return await listAllOrders(userId);
            default:
                return errorResponse(400, 'Invalid action');
        }
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(500, 'Internal server error');
    }
};

// Create order
async function createOrder(userId, orderData) {
    try {
        // Validate user exists by calling User Service
        const userExists = await validateUser(userId);
        if (!userExists) {
            return errorResponse(404, 'User not found');
        }
        
        const { items, shippingAddress, paymentMethod } = orderData;
        
        // Validate required fields
        if (!items || !Array.isArray(items) || items.length === 0) {
            return errorResponse(400, 'Items are required');
        }
        
        // Calculate total amount
        const totalAmount = items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);
        
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const createdAt = new Date().toISOString();
        
        const order = {
            orderId,
            userId,
            items,
            totalAmount,
            status: 'pending',
            shippingAddress,
            paymentMethod,
            createdAt,
            updatedAt: createdAt
        };
        
        await dynamodb.put({
            TableName: ORDERS_TABLE,
            Item: order
        }).promise();
        
        return successResponse(order);
    } catch (error) {
        console.error('Error creating order:', error);
        throw error;
    }
}

// Get user orders
async function getUserOrders(userId) {
    try {
        const result = await dynamodb.query({
            TableName: ORDERS_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            },
            ScanIndexForward: false // Latest first
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error getting user orders:', error);
        throw error;
    }
}

// Get order by ID
async function getOrder(orderId, userId) {
    try {
        const result = await dynamodb.get({
            TableName: ORDERS_TABLE,
            Key: { orderId, createdAt: 'placeholder' }
        }).promise();
        
        if (!result.Item) {
            return errorResponse(404, 'Order not found');
        }
        
        // Check if user owns this order or is admin
        const isAdmin = await isUserAdmin(userId);
        if (result.Item.userId !== userId && !isAdmin) {
            return errorResponse(403, 'Access denied');
        }
        
        return successResponse(result.Item);
    } catch (error) {
        console.error('Error getting order:', error);
        throw error;
    }
}

// Update order
async function updateOrder(orderId, userId, updateData) {
    try {
        const { status, shippingAddress, items } = updateData;
        
        // First, get the order to check ownership
        const orderResult = await dynamodb.query({
            TableName: ORDERS_TABLE,
            KeyConditionExpression: 'orderId = :orderId',
            ExpressionAttributeValues: {
                ':orderId': orderId
            }
        }).promise();
        
        if (!orderResult.Items || orderResult.Items.length === 0) {
            return errorResponse(404, 'Order not found');
        }
        
        const order = orderResult.Items[0];
        
        // Check if user owns this order or is admin
        const isAdmin = await isUserAdmin(userId);
        if (order.userId !== userId && !isAdmin) {
            return errorResponse(403, 'Access denied');
        }
        
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        if (status) {
            updateExpression.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;
        }
        
        if (shippingAddress) {
            updateExpression.push('#shippingAddress = :shippingAddress');
            expressionAttributeNames['#shippingAddress'] = 'shippingAddress';
            expressionAttributeValues[':shippingAddress'] = shippingAddress;
        }
        
        if (items) {
            updateExpression.push('#items = :items');
            expressionAttributeNames['#items'] = 'items';
            expressionAttributeValues[':items'] = items;
            
            // Recalculate total amount
            const totalAmount = items.reduce((sum, item) => {
                return sum + (item.price * item.quantity);
            }, 0);
            
            updateExpression.push('#totalAmount = :totalAmount');
            expressionAttributeNames['#totalAmount'] = 'totalAmount';
            expressionAttributeValues[':totalAmount'] = totalAmount;
        }
        
        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        
        const result = await dynamodb.update({
            TableName: ORDERS_TABLE,
            Key: { orderId: order.orderId, createdAt: order.createdAt },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }).promise();
        
        return successResponse(result.Attributes);
    } catch (error) {
        console.error('Error updating order:', error);
        throw error;
    }
}

// Delete order
async function deleteOrder(orderId, userId) {
    try {
        // First, get the order to check ownership
        const orderResult = await dynamodb.query({
            TableName: ORDERS_TABLE,
            KeyConditionExpression: 'orderId = :orderId',
            ExpressionAttributeValues: {
                ':orderId': orderId
            }
        }).promise();
        
        if (!orderResult.Items || orderResult.Items.length === 0) {
            return errorResponse(404, 'Order not found');
        }
        
        const order = orderResult.Items[0];
        
        // Check if user owns this order or is admin
        const isAdmin = await isUserAdmin(userId);
        if (order.userId !== userId && !isAdmin) {
            return errorResponse(403, 'Access denied');
        }
        
        await dynamodb.delete({
            TableName: ORDERS_TABLE,
            Key: { orderId: order.orderId, createdAt: order.createdAt }
        }).promise();
        
        return successResponse({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error('Error deleting order:', error);
        throw error;
    }
}

// List all orders (admin only)
async function listAllOrders(userId) {
    try {
        const isAdmin = await isUserAdmin(userId);
        if (!isAdmin) {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        const result = await dynamodb.scan({
            TableName: ORDERS_TABLE
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error listing orders:', error);
        throw error;
    }
}

// Helper functions
async function validateUser(userId) {
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
        
        return response.statusCode === 200;
    } catch (error) {
        console.error('Error validating user:', error);
        return false;
    }
}

async function isUserAdmin(userId) {
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
            return userData.data && userData.data.role === 'admin';
        }
        
        return false;
    } catch (error) {
        console.error('Error checking user role:', error);
        return false;
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