const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME;
const USER_SERVICE_ARN = process.env.USER_SERVICE_ARN;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const { action, userId, productId, body } = event;
        
        switch (action) {
        case 'getProducts':
            return await getProducts();
        case 'getProduct':
            return await getProduct(productId);
        case 'createProduct':
            return await createProduct(userId, JSON.parse(body));
        case 'updateProduct':
            return await updateProduct(productId, userId, JSON.parse(body));
        case 'deleteProduct':
            return await deleteProduct(productId, userId);
        case 'getProductsByCategory':
            return await getProductsByCategory(JSON.parse(body).category);
        case 'searchProducts':
            return await searchProducts(JSON.parse(body).searchTerm);
        default:
            return errorResponse(400, 'Invalid action');
        }
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(500, 'Internal server error');
    }
};

// Get all products (public)
async function getProducts() {
    try {
        const result = await dynamodb.scan({
            TableName: PRODUCTS_TABLE,
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'active'
            }
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error getting products:', error);
        throw error;
    }
}

// Get product by ID (public)
async function getProduct(productId) {
    try {
        const result = await dynamodb.get({
            TableName: PRODUCTS_TABLE,
            Key: { productId }
        }).promise();
        
        if (!result.Item) {
            return errorResponse(404, 'Product not found');
        }
        
        if (result.Item.status !== 'active') {
            return errorResponse(404, 'Product not available');
        }
        
        return successResponse(result.Item);
    } catch (error) {
        console.error('Error getting product:', error);
        throw error;
    }
}

// Create product (admin only)
async function createProduct(userId, productData) {
    try {
        // Check if user is admin
        const isAdmin = await isUserAdmin(userId);
        if (!isAdmin) {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        const { name, description, price, category, imageUrl, stock, specifications } = productData;
        
        // Validate required fields
        if (!name || !description || !price || !category) {
            return errorResponse(400, 'Name, description, price, and category are required');
        }
        
        if (price <= 0) {
            return errorResponse(400, 'Price must be greater than 0');
        }
        
        const productId = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const createdAt = new Date().toISOString();
        
        const product = {
            productId,
            name,
            description,
            price,
            category,
            imageUrl: imageUrl || null,
            stock: stock || 0,
            specifications: specifications || {},
            status: 'active',
            createdAt,
            updatedAt: createdAt,
            createdBy: userId
        };
        
        await dynamodb.put({
            TableName: PRODUCTS_TABLE,
            Item: product
        }).promise();
        
        return successResponse(product);
    } catch (error) {
        console.error('Error creating product:', error);
        throw error;
    }
}

// Update product (admin only)
async function updateProduct(productId, userId, updateData) {
    try {
        // Check if user is admin
        const isAdmin = await isUserAdmin(userId);
        if (!isAdmin) {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        const { name, description, price, category, imageUrl, stock, specifications, status } = updateData;
        
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        if (name) {
            updateExpression.push('#name = :name');
            expressionAttributeNames['#name'] = 'name';
            expressionAttributeValues[':name'] = name;
        }
        
        if (description) {
            updateExpression.push('#description = :description');
            expressionAttributeNames['#description'] = 'description';
            expressionAttributeValues[':description'] = description;
        }
        
        if (price !== undefined) {
            if (price <= 0) {
                return errorResponse(400, 'Price must be greater than 0');
            }
            updateExpression.push('#price = :price');
            expressionAttributeNames['#price'] = 'price';
            expressionAttributeValues[':price'] = price;
        }
        
        if (category) {
            updateExpression.push('#category = :category');
            expressionAttributeNames['#category'] = 'category';
            expressionAttributeValues[':category'] = category;
        }
        
        if (imageUrl !== undefined) {
            updateExpression.push('#imageUrl = :imageUrl');
            expressionAttributeNames['#imageUrl'] = 'imageUrl';
            expressionAttributeValues[':imageUrl'] = imageUrl;
        }
        
        if (stock !== undefined) {
            updateExpression.push('#stock = :stock');
            expressionAttributeNames['#stock'] = 'stock';
            expressionAttributeValues[':stock'] = stock;
        }
        
        if (specifications) {
            updateExpression.push('#specifications = :specifications');
            expressionAttributeNames['#specifications'] = 'specifications';
            expressionAttributeValues[':specifications'] = specifications;
        }
        
        if (status) {
            updateExpression.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;
        }
        
        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        
        const result = await dynamodb.update({
            TableName: PRODUCTS_TABLE,
            Key: { productId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }).promise();
        
        return successResponse(result.Attributes);
    } catch (error) {
        console.error('Error updating product:', error);
        throw error;
    }
}

// Delete product (admin only)
async function deleteProduct(productId, userId) {
    try {
        // Check if user is admin
        const isAdmin = await isUserAdmin(userId);
        if (!isAdmin) {
            return errorResponse(403, 'Insufficient permissions');
        }
        
        // Soft delete by updating status
        await dynamodb.update({
            TableName: PRODUCTS_TABLE,
            Key: { productId },
            UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status',
                '#updatedAt': 'updatedAt'
            },
            ExpressionAttributeValues: {
                ':status': 'deleted',
                ':updatedAt': new Date().toISOString()
            }
        }).promise();
        
        return successResponse({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        throw error;
    }
}

// Get products by category
async function getProductsByCategory(category) {
    try {
        const result = await dynamodb.query({
            TableName: PRODUCTS_TABLE,
            IndexName: 'CategoryIndex',
            KeyConditionExpression: '#category = :category',
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#category': 'category',
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':category': category,
                ':status': 'active'
            }
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error getting products by category:', error);
        throw error;
    }
}

// Search products
async function searchProducts(searchTerm) {
    try {
        const result = await dynamodb.scan({
            TableName: PRODUCTS_TABLE,
            FilterExpression: '(contains(#name, :searchTerm) OR contains(#description, :searchTerm)) AND #status = :status',
            ExpressionAttributeNames: {
                '#name': 'name',
                '#description': 'description',
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':searchTerm': searchTerm,
                ':status': 'active'
            }
        }).promise();
        
        return successResponse(result.Items);
    } catch (error) {
        console.error('Error searching products:', error);
        throw error;
    }
}

// Helper functions
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