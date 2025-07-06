const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

exports.handler = async (event) => {
  try {
    const { httpMethod, path, body } = event;
    const requestBody = body ? JSON.parse(body) : {};

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    // Handle OPTIONS request for CORS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'OK' })
      };
    }

    let result;

    if (httpMethod === 'POST' && path === '/auth/register') {
      result = await register(requestBody);
    } else if (httpMethod === 'POST' && path === '/auth/login') {
      result = await login(requestBody);
    } else if (httpMethod === 'GET' && path === '/auth/test') {
      result = { message: 'Auth service is working!', userPoolId: USER_POOL_ID };
    } else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not found' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error'
      })
    };
  }
};

async function register({ email, password, name }) {
  const params = {
    UserPoolId: USER_POOL_ID,
    Username: email,
    UserAttributes: [
      {
        Name: 'email',
        Value: email
      },
      {
        Name: 'name',
        Value: name || 'User'
      }
    ],
    MessageAction: 'SUPPRESS', // Không gửi email welcome
    TemporaryPassword: password
  };

  try {
    const result = await cognito.adminCreateUser(params).promise();
    
    // Set permanent password
    await cognito.adminSetUserPassword({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true
    }).promise();

    return {
      message: 'User created successfully',
      userId: result.User.Username
    };
  } catch (error) {
    throw new Error(`Registration failed: ${error.message}`);
  }
}

async function login({ email, password }) {
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
      message: 'Login successful',
      accessToken: result.AuthenticationResult.AccessToken,
      idToken: result.AuthenticationResult.IdToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
      expiresIn: result.AuthenticationResult.ExpiresIn
    };
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
} 