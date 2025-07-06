const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  region: process.env.REGION || 'us-east-1'
});

// Initialize services
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const lambda = new AWS.Lambda();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Standard response helper
const createResponse = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...corsHeaders, ...headers },
  body: JSON.stringify(body)
});

// Error response helper
const createErrorResponse = (statusCode, message, details = null) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify({
    error: message,
    details,
    timestamp: new Date().toISOString()
  })
});

// Handle OPTIONS requests
const handleOptions = () => createResponse(200, { message: 'OK' });

module.exports = {
  AWS,
  dynamodb,
  cognito,
  lambda,
  corsHeaders,
  createResponse,
  createErrorResponse,
  handleOptions
}; 