# 🚀 Microservice SSO với AWS Lambda

**Complete OAuth2 & SSO system** với AWS Lambda, API Gateway, Cognito, và DynamoDB.

## 🎯 Overview

**5 Microservices** với **Single Sign-On** authentication:
- 🔐 **Auth Service** - OAuth2 authentication flows
- 👥 **User Service** - User profile management  
- 📦 **Product Service** - Product catalog
- 🛒 **Order Service** - Order processing
- 🏥 **Health Check** - Service monitoring

## 🔄 OAuth2 & SSO Flows

### 🔐 **Flow 1: OAuth2 Password Grant** (Direct Authentication)

```mermaid
sequenceDiagram
    participant User as 👤 User/Client
    participant Frontend as 🌐 Frontend App
    participant APIGW as 🚪 API Gateway
    participant Auth as 🔐 Lambda Authorizer
    participant AuthSvc as 🛡️ Auth Service Lambda
    participant UserSvc as 👥 User Service Lambda  
    participant Cognito as 🧠 AWS Cognito
    participant DDB as 💾 DynamoDB

    Note over User, DDB: OAuth2 Password Grant Flow
    
    User->>Frontend: 1. Enter credentials
    Frontend->>APIGW: 2. POST /oauth2/token<br/>grant_type=password
    APIGW->>AuthSvc: 3. Route to Auth Service
    AuthSvc->>Cognito: 4. adminInitiateAuth()
    Cognito-->>AuthSvc: 5. JWT tokens (access, id, refresh)
    AuthSvc-->>Frontend: 6. OAuth2 response
    Frontend-->>User: 7. Login successful

    Note over User, DDB: Protected API Request with JWT
    
    User->>Frontend: 8. Request user profile
    Frontend->>APIGW: 9. GET /users/profile<br/>Authorization: Bearer TOKEN
    APIGW->>Auth: 10. Validate JWT token
    Auth->>Cognito: 11. Get JWKS public keys
    Cognito-->>Auth: 12. Return keys
    Auth->>Auth: 13. Verify JWT signature
    
    alt JWT Valid
        Auth-->>APIGW: 14. Allow + user context
        APIGW->>UserSvc: 15. Forward + auth context
        UserSvc->>DDB: 16. Query user data
        DDB-->>UserSvc: 17. Return data
        UserSvc-->>Frontend: 18. User profile
    else JWT Invalid
        Auth-->>APIGW: 14b. Deny (401)
        APIGW-->>Frontend: 15b. Unauthorized
    end

    Note over User, DDB: Cross-Service SSO
    
    User->>Frontend: 19. Get user orders
    Frontend->>APIGW: 20. GET /users/orders<br/>Same JWT token
    APIGW->>Auth: 21. Validate JWT (SSO)
    Auth-->>APIGW: 22. Allow (same context)
    APIGW->>UserSvc: 23. Route to User Service
    UserSvc->>APIGW: 24. Internal: GET /orders<br/>Same JWT (SSO)
    APIGW->>Auth: 25. Validate (SSO maintained)
    Auth-->>APIGW: 26. Allow
    APIGW->>OrderSvc: 27. Route to Order Service
    OrderSvc->>DDB: 28. Query orders
    DDB-->>OrderSvc: 29. Return orders
    OrderSvc-->>UserSvc: 30. Order data
    UserSvc-->>Frontend: 31. Combined response
```

### 🔗 **Flow 2: OAuth2 Authorization Code** (Standard Enterprise Flow)

```mermaid
sequenceDiagram
    participant User as 👤 User/Client
    participant Browser as 🌐 Browser
    participant Frontend as 💻 Frontend App
    participant APIGW as 🚪 API Gateway
    participant AuthSvc as 🛡️ Auth Service Lambda
    participant AuthUI as 🔐 Authorization Server<br/>(Custom Login Page)
    participant Cognito as 🧠 AWS Cognito
    participant Auth as 🔒 Lambda Authorizer
    participant UserSvc as 👥 User Service Lambda

    Note over User, UserSvc: OAuth2 Authorization Code Flow (Standard)
    
    %% Step 1: Initiate Authorization
    User->>Frontend: 1. Click "Login with SSO"
    Frontend->>APIGW: 2. GET /oauth2/authorize?<br/>response_type=code&client_id=xxx&<br/>redirect_uri=callback&state=xyz
    APIGW->>AuthSvc: 3. Handle authorization request
    AuthSvc->>AuthSvc: 4. Generate state & validate params
    AuthSvc-->>APIGW: 5. Return authorization URL
    APIGW-->>Frontend: 6. Custom login URL
    Frontend->>Browser: 7. Redirect to login page
    
    %% Step 2: User Authentication
    Browser->>AuthUI: 8. Display login form
    User->>AuthUI: 9. Enter credentials
    AuthUI->>APIGW: 10. POST /oauth2/login<br/>(email, password, state)
    APIGW->>AuthSvc: 11. Validate credentials
    AuthSvc->>Cognito: 12. adminInitiateAuth()
    Cognito-->>AuthSvc: 13. Authentication success
    AuthSvc->>AuthSvc: 14. Generate authorization code
    AuthSvc-->>APIGW: 15. Return auth code
    APIGW-->>AuthUI: 16. Auth code + redirect
    
    %% Step 3: Authorization Code Exchange
    AuthUI->>Browser: 17. Redirect to callback URL<br/>?code=AUTH_CODE&state=xyz
    Browser->>Frontend: 18. Callback with code
    Frontend->>Frontend: 19. Validate state parameter
    Frontend->>APIGW: 20. POST /oauth2/token<br/>grant_type=authorization_code<br/>code=AUTH_CODE
    APIGW->>AuthSvc: 21. Exchange code for tokens
    AuthSvc->>AuthSvc: 22. Validate authorization code
    AuthSvc->>Cognito: 23. Get user tokens (if valid)
    Cognito-->>AuthSvc: 24. JWT tokens (access, id, refresh)
    AuthSvc-->>APIGW: 25. Return OAuth2 token response
    APIGW-->>Frontend: 26. JWT tokens
    Frontend->>Frontend: 27. Store tokens securely
    Frontend-->>User: 28. Login successful + SSO enabled
    
    Note over User, UserSvc: Use JWT Token for Protected Resources
    
    %% Step 4: Protected API Access
    User->>Frontend: 29. Access protected resource
    Frontend->>APIGW: 30. GET /users/profile<br/>Authorization: Bearer ACCESS_TOKEN
    APIGW->>Auth: 31. Validate JWT token
    Auth->>Cognito: 32. Verify with JWKS
    Cognito-->>Auth: 33. Token valid
    Auth-->>APIGW: 34. Allow + user context
    APIGW->>UserSvc: 35. Forward request
    UserSvc-->>APIGW: 36. User profile data
    APIGW-->>Frontend: 37. Return data
    Frontend-->>User: 38. Display profile (SSO complete)
    
    Note over User, UserSvc: Token Refresh Flow
    
    %% Step 5: Token Refresh (when access token expires)
    Frontend->>Frontend: 39. Detect token expiring
    Frontend->>APIGW: 40. POST /oauth2/token<br/>grant_type=refresh_token<br/>refresh_token=xxx
    APIGW->>AuthSvc: 41. Process refresh
    AuthSvc->>Cognito: 42. Refresh token validation
    Cognito-->>AuthSvc: 43. New access & ID tokens
    AuthSvc-->>APIGW: 44. Return new tokens
    APIGW-->>Frontend: 45. Updated tokens
    Frontend->>Frontend: 46. Update stored tokens
    Note over Frontend: SSO maintained across all services
```

## 🏗️ Architecture

### **AWS Components**
- **API Gateway**: Single entry point, CORS, routing
- **Lambda Authorizer**: JWT validation với Cognito JWKS
- **Cognito User Pool**: User authentication & JWT issuing
- **Lambda Functions**: Business logic microservices
- **DynamoDB**: NoSQL database cho từng service

### **OAuth2 Flows Supported**
- ✅ **Password Grant**: Username/password → JWT tokens
- ✅ **Authorization Code**: Redirect-based flow
- ✅ **Client Credentials**: Service-to-service auth
- ✅ **Refresh Token**: Token renewal

### **SSO Features**
- 🔑 **Single Login**: One JWT for all services
- 🔄 **Token Reuse**: Cross-service authentication
- 🛡️ **Centralized Auth**: Cognito manages all users
- 📊 **Stateless**: JWT contains user context

## 🚀 Quick Start

### **Prerequisites**
```bash
# Required
node -v    # >= 18.x
aws --version
npm install -g serverless
```

### **Setup**
```bash
# 1. Install dependencies
npm install

# 2. Configure AWS
aws configure
# or
export AWS_PROFILE=your-profile

# 3. Deploy to AWS
npm run deploy
```

### **Test OAuth2 Flow**
```bash
# 1. Register user
curl -X POST https://your-api-url/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# 2. Login (OAuth2 Password Grant)
curl -X POST https://your-api-url/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"password","username":"test@example.com","password":"Test123!","client_id":"your-client-id"}'

# 3. Use JWT token for protected endpoints
curl -X GET https://your-api-url/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📋 API Endpoints

### **🔐 OAuth2 Authentication**
- `GET /oauth2/authorize` - Authorization code flow
- `POST /oauth2/token` - Token exchange (all grant types)
- `POST /oauth2/refresh` - Token refresh

### **👤 User Authentication**
- `POST /auth/register` - User registration
- `POST /auth/login` - Direct login
- `POST /auth/user-info` - Decode JWT tokens
- `GET /auth/profile` - Get user profile
- `POST /auth/logout` - Logout

### **🛡️ Protected Services**
- `GET /users` - User management (requires auth)
- `GET /products` - Product catalog  
- `GET /orders` - Order management (requires auth)
- `GET /health` - System health check

## 🎯 Current Deployment

### **✅ Production Ready**
- **API URL**: `https://f0ct5flua5.execute-api.us-east-1.amazonaws.com/dev`
- **User Pool**: `us-east-1_8ML8938m2`
- **Client ID**: `1rtq4ll07cvvatg432efpnjtta`
- **Test User**: `sso-test@example.com` / `SSOTest123!`

### **🧪 Frontend Test Dashboard**
```bash
# Local test server
node serve.js
# Open: http://localhost:3000

# Features:
# ✅ Interactive OAuth2 testing
# ✅ All grant flows UI
# ✅ JWT token management
# ✅ Cross-service SSO testing
```

## 📊 JWT Token Structure

### **Access Token** (Authorization)
```json
{
  "sub": "user-id",
  "username": "user-uuid", 
  "client_id": "app-client-id",
  "token_use": "access",
  "scope": "aws.cognito.signin.user.admin",
  "exp": 1234567890
}
```

### **ID Token** (User Identity)
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "name": "User Name",
  "email_verified": true,
  "token_use": "id",
  "exp": 1234567890
}
```

## 🔧 Development

### **Local Development**
```bash
npm run dev          # Serverless offline
npm test            # Run tests
npm run lint        # Code quality
```

### **Deployment**
```bash
npm run deploy      # Deploy to AWS
npm run deploy:prod # Production deploy
npm run info        # Stack info
npm run logs        # View logs
```

### **Utilities**
```bash
npm run remove      # Remove stack
npm run validate    # Validate config
npm run package     # Package functions
```

## 📁 Project Structure

```
microserviceSSo/
├── lambda/                    # 🔧 Lambda functions
│   ├── auth-service-minimal/  # OAuth2 + auth logic
│   ├── user-service/         # User management
│   ├── order-service/        # Order processing
│   ├── product-service/      # Product catalog
│   ├── cognito-authorizer/   # JWT validation
│   └── health-check/         # Health monitoring
├── shared/                   # 📦 Common utilities
├── serverless-optimized.yml  # ⭐ Main config
├── serverless-minimal.yml    # 🧪 Simple config
├── oauth2-sso-test.html      # 🌐 Test dashboard
├── guideline.md              # 📚 Complete guide
└── README.md                 # 📖 This file
```

## 🎯 Features

### **🔐 Authentication & Authorization**
- ✅ AWS Cognito User Pool
- ✅ JWT-based authentication
- ✅ Lambda Authorizer validation
- ✅ Role-based access control

### **🌐 OAuth2 & SSO**
- ✅ Complete OAuth2 implementation
- ✅ Multiple grant flows
- ✅ Cross-service Single Sign-On
- ✅ Token refresh mechanism

### **🏗️ Architecture**
- ✅ Serverless microservices
- ✅ API Gateway integration
- ✅ DynamoDB data persistence
- ✅ CloudFormation infrastructure

### **🛠️ Development**
- ✅ Environment-based deployment
- ✅ Optimized packaging
- ✅ Interactive test dashboard
- ✅ Complete documentation

## 📖 Documentation

- **[Complete Guide](guideline.md)** - Detailed architecture & implementation
- **[Deployment Guide](DEPLOYMENT.md)** - Step-by-step deployment
- **[Test Dashboard](oauth2-sso-test.html)** - Interactive OAuth2 testing

---

**🚀 Ready for production deployment with complete OAuth2 & SSO functionality!** 