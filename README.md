# OAuth2 Implementation Documentation

## 🚀 OAuth2 & SSO Test Server

### Quick Start
```bash
node serve.js
```

**Server Information:**
- 📱 Frontend URL: http://localhost:3000
- 🔗 OAuth2 Callback URL: http://localhost:3000/callback

### Features
✅ OAuth2 Authorization Code Flow  
✅ OAuth2 Client Credentials Flow  
✅ JWT Token Management  
✅ SSO Cross-Service Testing  
✅ Interactive UI for all endpoints

## 📋 OAuth2 Grant Types Overview

### 1. Authorization Code Grant (Most Secure)
**Use Case:** Web applications with server-side backend
- **Step 1:** Redirect user to authorization server
- **Step 2:** Exchange authorization code for access token
- **Security:** Most secure, tokens never exposed to browser

### 2. Implicit Grant (Deprecated)
**Use Case:** Single-page applications (SPA) - **NOT RECOMMENDED**
- Tokens returned directly in URL fragment
- Security risk: tokens exposed in browser history

### 3. Resource Owner Password Credentials Grant
**Use Case:** Trusted applications (mobile apps, first-party apps)
- Direct username/password authentication
- Used in our demo with `sso-test@example.com / SSOTest123!`

### 4. Client Credentials Grant
**Use Case:** Service-to-service authentication
- Machine-to-machine communication
- No user context required

### 5. Refresh Token Grant
**Use Case:** Token renewal without re-authentication
- Extends user session
- More secure than long-lived access tokens

### 6. Device Authorization Grant
**Use Case:** IoT devices, smart TVs, limited input devices
- Device shows code, user authorizes on separate device

### PKCE Enhancement
**Use Case:** Public clients (mobile apps, SPAs)
- Adds code challenge/verifier for extra security
- Prevents authorization code interception attacks

## 🏗️ System Architecture

### AWS Cognito Integration
- **User Pool:** Manages user registration and authentication
- **App Client:** Handles OAuth2 flows
- **JWT Tokens:** Industry-standard authentication tokens

### Lambda Functions
- **auth-service-minimal.js:** HTTP-compatible Cognito authentication
- **auth-service.js:** Full Lambda event format with DynamoDB integration
- **user-service.js:** User management and DynamoDB operations

### Frontend Implementation
- **OAuth2 Login Page:** Custom HTML with parameter display
- **Demo Credentials:** Pre-filled for testing
- **Auto-redirect:** Seamless callback flow with tokens

## 🔧 API Endpoints

### Authentication Endpoints
```
POST /register        - User registration
POST /login          - User authentication
POST /oauth2/token   - OAuth2 token endpoint
GET  /oauth2/authorize - OAuth2 authorization endpoint
POST /oauth2/password - Password grant flow
POST /oauth2/client_credentials - Client credentials flow
```

### Protected Endpoints
```
GET  /user/profile   - User profile (JWT required)
GET  /orders        - User orders (JWT required)
GET  /products      - Product catalog (JWT required)
GET  /health        - Health check
```

### OAuth2 Flow URLs
```
GET  /oauth2-login  - OAuth2 login page
GET  /callback      - OAuth2 callback handler
```

## 🧪 Testing Examples

### User Registration
```bash
curl -X POST https://your-api-gateway-url/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123!",
    "email": "test@example.com"
  }'
```

### User Login
```bash
curl -X POST https://your-api-gateway-url/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123!"
  }'
```

### OAuth2 Password Grant
```bash
curl -X POST https://your-api-gateway-url/oauth2/password \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sso-test@example.com",
    "password": "SSOTest123!",
    "client_id": "your-client-id"
  }'
```

### OAuth2 Authorization Code Flow
```bash
# Step 1: Get authorization code
curl "https://your-api-gateway-url/oauth2/authorize?response_type=code&client_id=your-client-id&redirect_uri=http://localhost:3000/callback&scope=openid"

# Step 2: Exchange code for tokens
curl -X POST https://your-api-gateway-url/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_1751964088605_6ktamr9na",
    "client_id": "your-client-id",
    "redirect_uri": "http://localhost:3000/callback"
  }'
```

### OAuth2 Client Credentials
```bash
curl -X POST https://your-api-gateway-url/oauth2/client_credentials \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "scope": "service"
  }'
```

### Using JWT Tokens
```bash
# Add Authorization header to protected endpoints
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  https://your-api-gateway-url/user/profile
```

## 🔑 JWT Token Structure

### Access Token Example
```json
{
  "sub": "0478a408-5061-7056-3408-45fd0c2b2fb1",
  "aud": "your-client-id",
  "cognito:groups": ["Users"],
  "email_verified": true,
  "iss": "https://cognito-idp.region.amazonaws.com/user-pool-id",
  "cognito:username": "testuser",
  "aud": "client-id",
  "token_use": "access",
  "scope": "openid",
  "exp": 1751967688,
  "iat": 1751964088,
  "version": 2,
  "jti": "token-id",
  "client_id": "your-client-id"
}
```

### ID Token Example
```json
{
  "sub": "0478a408-5061-7056-3408-45fd0c2b2fb1",
  "aud": "your-client-id",
  "cognito:groups": ["Users"],
  "email_verified": true,
  "iss": "https://cognito-idp.region.amazonaws.com/user-pool-id",
  "cognito:username": "testuser",
  "aud": "client-id",
  "token_use": "id",
  "exp": 1751967688,
  "iat": 1751964088,
  "email": "test@example.com"
}
```

## 🆚 AWS Cognito vs Google OAuth2

| Feature | AWS Cognito | Google OAuth2 |
|---------|-------------|---------------|
| **Architecture** | All-in-one identity service | OAuth2 provider + Google APIs |
| **User Management** | Built-in user pools | Google account system |
| **Customization** | High (custom domains, UI, flows) | Limited (Google branding) |
| **Enterprise Features** | SAML, OIDC, MFA, Groups | Google Workspace integration |
| **Pricing** | Pay per MAU | Free up to limits, then pay |
| **Token Format** | JWT with custom claims | JWT with Google claims |
| **Scopes** | Custom + OpenID | Google services + OpenID |

## 🐛 Common Issues & Solutions

### 1. Port 3000 Already in Use
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 node serve.js
```

### 2. Invalid Action Errors
- **Cause:** Lambda functions expect Lambda event format, not HTTP format
- **Solution:** Use `auth-service-minimal.js` for HTTP compatibility

### 3. DynamoDB User Not Found
- **Cause:** Registration only creates Cognito user, not DynamoDB record
- **Solution:** Ensure user service creates DynamoDB record after registration

### 4. Protected Endpoints Return null
- **Cause:** JWT token validation or event format issues
- **Solution:** Check JWT token format and Lambda event structure

## 🔧 Configuration

### Environment Variables
```bash
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
USER_SERVICE_NAME=microserviceSSO-optimized-user-service
SESSIONS_TABLE_NAME=microserviceSSO-optimized-Sessions
```

### Serverless Configuration
```yaml
# serverless-optimized.yml
functions:
  auth-service:
    handler: lambda/auth-service-minimal/auth-service-minimal.handler
    environment:
      COGNITO_USER_POOL_ID: ${env:COGNITO_USER_POOL_ID}
      COGNITO_CLIENT_ID: ${env:COGNITO_CLIENT_ID}
```

## 📈 Testing Results

### ✅ Working Features
- User registration with Cognito
- User login with JWT tokens
- OAuth2 Password Grant with real tokens
- OAuth2 Authorization Code Flow with demo tokens
- OAuth2 Client Credentials for service authentication
- JWT token decoding and user info extraction
- OAuth2 login page with complete authorization flow

### ⚠️ Known Issues
- Protected endpoints returning `{"message": null}`
- Manual DynamoDB user creation required
- Lambda vs HTTP event format incompatibility

## 🚀 Deployment

### Development
```bash
npm install
serverless deploy --config serverless-optimized.yml --stage dev
```

### Production
```bash
serverless deploy --config serverless-optimized.yml --stage prod
```

### Local Testing
```bash
node serve.js
# Visit http://localhost:3000 for interactive testing
```

## 📚 Additional Resources

- [OAuth2 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [JWT.io Token Debugger](https://jwt.io/)
- [OAuth2 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)

---

**Last Updated:** January 2025  
**Version:** 1.0  
**Project:** Microservice SSO Implementation 