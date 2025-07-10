# OAuth2 Implementation Improvements

## Overview
Đã cải thiện implementation OAuth2 để tuân thủ chuẩn RFC 6749 và RFC 7636 (PKCE).

## Các vấn đề đã sửa

### 1. **Authorization Endpoint Flow**
**Vấn đề cũ:**
- Endpoint `/oauth2/authorize` yêu cầu access token trong Authorization header
- Không đúng chuẩn OAuth2 - authorization endpoint phải là nơi user đăng nhập

**Giải pháp:**
- Authorization endpoint giờ redirect user đến login page nếu chưa authenticated
- Sử dụng session token để kiểm tra trạng thái đăng nhập
- Return HTTP 302 redirect thay vì JSON response

```javascript
// Kiểm tra session token
const sessionToken = headers['x-session-token'] || headers['X-Session-Token'];
if (!userInfo) {
    // Redirect to login page
    const loginUrl = new URL('/auth/login', `https://${headers.Host}`);
    // ... set parameters
    return {
        statusCode: 302,
        headers: { 'Location': loginUrl.toString() }
    };
}
```

### 2. **PKCE (Proof Key for Code Exchange) Support**
**Vấn đề cũ:**
- Không có PKCE để bảo mật authorization code flow
- Authorization code có thể bị intercept

**Giải pháp:**
- Thêm support cho `code_challenge` và `code_challenge_method`
- Validate `code_verifier` khi exchange token
- Hỗ trợ cả `S256` (SHA256) và `plain` methods

```javascript
// Validate PKCE
if (metadata.code_challenge) {
    if (!codeVerifier) {
        throw new Error('code_verifier is required');
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
    }
    
    if (expectedChallenge !== metadata.code_challenge) {
        throw new Error('Invalid code_verifier');
    }
}
```

### 3. **Client Credentials Flow**
**Vấn đề cũ:**
- Tạo service account tạm thời mỗi lần gọi
- Không phải cách implement đúng chuẩn

**Giải pháp:**
- Tạo service token và lưu vào DynamoDB
- Token có expiry time và metadata
- Không tạo user account tạm thời

```javascript
async function handleClientCredentials(client_id) {
    const serviceToken = generateRandomString(64);
    
    await dynamodb.put({
        TableName: SESSIONS_TABLE,
        Item: {
            token: serviceToken,
            client_id: client_id,
            token_type: 'service',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            created_at: Date.now()
        }
    }).promise();

    return {
        access_token: serviceToken,
        token_type: 'Bearer',
        expires_in: 3600
    };
}
```

### 4. **Refresh Token Flow**
**Vấn đề cũ:**
- Có endpoint `/oauth2/refresh` nhưng không implement

**Giải pháp:**
- Implement đầy đủ refresh token flow
- Sử dụng Cognito `REFRESH_TOKEN_AUTH` flow
- Return new access token và id token

```javascript
async function handleRefreshToken(refreshToken, clientId) {
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
        access_token: result.AuthenticationResult.AccessToken,
        id_token: result.AuthenticationResult.IdToken,
        token_type: 'Bearer',
        expires_in: result.AuthenticationResult.ExpiresIn
    };
}
```

### 5. **Enhanced Login Flow**
**Cải tiến:**
- Login endpoint giờ hỗ trợ OAuth2 flow
- Nếu có `client_id` và `redirect_uri`, tự động generate authorization code
- Return redirect URI với authorization code

```javascript
// Check if this is an OAuth2 login flow
if (client_id && redirect_uri) {
    const code = generateAuthCode();
    
    await storeAuthCode(code, client_id, redirect_uri, {
        username: userEmail,
        scope: scope || 'openid profile email',
        code_challenge: code_challenge,
        code_challenge_method: code_challenge_method
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    
    return {
        redirect_uri: redirectUrl.toString(),
        message: 'OAuth2 authorization successful'
    };
}
```

## OAuth2 Flows Supported

### 1. **Authorization Code Flow (with PKCE)**
```
GET /oauth2/authorize?response_type=code&client_id=xxx&redirect_uri=xxx&code_challenge=xxx&code_challenge_method=S256
↓
POST /auth/login (with OAuth2 parameters)
↓
GET /oauth2/token (with authorization code and code_verifier)
```

### 2. **Password Grant**
```
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username=xxx&password=xxx&client_id=xxx
```

### 3. **Client Credentials**
```
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=xxx
```

### 4. **Refresh Token**
```
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=xxx&client_id=xxx
```

## Security Improvements

### 1. **PKCE Protection**
- Prevents authorization code interception attacks
- Required for public clients (SPA, mobile apps)
- Uses SHA256 hashing for code challenge

### 2. **Proper Token Validation**
- Validate client_id for all flows
- Check token expiry
- Verify redirect URI matches

### 3. **Secure Code Generation**
- Use cryptographically secure random strings
- Include timestamp for uniqueness
- Proper cleanup after use

## Testing

File `oauth2-test.html` được tạo để test tất cả OAuth2 flows:
- Authorization Code Flow với PKCE
- Token Exchange
- User Info endpoint
- Refresh Token
- Direct Login (Password Grant)

## Environment Variables Required

```bash
USER_POOL_ID=your-cognito-user-pool-id
USER_POOL_CLIENT_ID=your-cognito-client-id
AUTH_CODES_TABLE=your-auth-codes-dynamodb-table
SESSIONS_TABLE=your-sessions-dynamodb-table
```

## Next Steps

1. **Production Hardening:**
   - Add rate limiting
   - Implement proper client registration
   - Add audit logging
   - Configure CORS properly

2. **Additional Features:**
   - OpenID Connect support
   - JWT token validation
   - Scope-based authorization
   - Consent screen

3. **Security Enhancements:**
   - HTTPS enforcement
   - Token encryption
   - Session management
   - CSRF protection 