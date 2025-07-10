# 🔐 Microservice OAuth2 SSO Authentication & User Management

Microservice authentication và user management system sử dụng **AWS Lambda**, **Amazon Cognito**, và **OAuth2** để cung cấp Single Sign-On (SSO) cho các ứng dụng.

## 🎯 Tính năng chính

### 🔑 Authentication Service
- **OAuth2 Authorization Code Flow** - Chuẩn OAuth2 hoàn chỉnh
- **Password Grant Flow** - Đăng nhập trực tiếp với email/password
- **Client Credentials Flow** - Xác thực service-to-service
- **Refresh Token** - Gia hạn token tự động
- **JWT Token Management** - Access token, ID token, Refresh token
- **Amazon Cognito Integration** - User pool management

### 👤 User Management Service
- **User CRUD Operations** - Tạo, đọc, cập nhật, xóa user
- **Profile Management** - Quản lý thông tin cá nhân
- **Role-based Access Control** - Admin/User permissions
- **Cognito Sync** - Đồng bộ dữ liệu từ Cognito
- **Multi-tenant Support** - Hỗ trợ nhiều tenant

### 🌐 Single Sign-On (SSO)
- **Cross-service Authentication** - Đăng nhập một lần, truy cập mọi nơi
- **JWT-based Authorization** - Stateless authentication
- **Microservice Integration** - Dễ dàng tích hợp với các service khác

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Auth Service  │    │  User Service   │
│                 │    │                 │    │                 │
│ • OAuth2 Login  │────│ • Authorization │────│ • User CRUD     │
│ • JWT Storage   │    │ • Token Issue   │    │ • Profile Mgmt  │
│ • API Calls     │    │ • SSO Provider  │    │ • Role Check    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐               │
         │              │   API Gateway   │               │
         │              │                 │               │
         └──────────────│ • CORS Handling │───────────────┘
                        │ • Route Management│
                        │ • Authorization │
                        └─────────────────┘
                                 │
                    ┌─────────────────────────────┐
                    │       AWS Resources         │
                    │                             │
                    │ • Cognito User Pool         │
                    │ • DynamoDB Tables          │
                    │ • Lambda Functions         │
                    │ • CloudFormation           │
                    └─────────────────────────────┘
```

## 🚀 Bắt đầu nhanh

### Prerequisites
- **Node.js** 18.x hoặc cao hơn
- **AWS CLI** được cấu hình
- **Serverless Framework** 2.x
- **AWS Account** với quyền Lambda, Cognito, DynamoDB

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình environment

```bash
cp env.example env.dev
# Chỉnh sửa env.dev với thông tin AWS của bạn
```

### 3. Deploy lên AWS

```bash
npm run deploy:auth
```

### 4. Chạy local server

```bash
npm start
```

Frontend demo sẽ chạy tại `http://localhost:3000`

## 📋 API Endpoints

### 🔐 Authentication Service

#### Public Endpoints
```
GET  /health                    # Health check
GET  /auth/test                 # Service info
POST /auth/register             # User registration
POST /auth/login                # User login

# OAuth2 Flow
GET  /oauth2/authorize          # Authorization endpoint
POST /oauth2/token              # Token endpoint
POST /oauth2/refresh            # Refresh token
```

#### Protected Endpoints (require JWT)
```
GET  /auth/profile              # Get user profile
POST /auth/logout               # User logout
```

### 👤 User Management Service

#### Protected Endpoints (require JWT)
```
GET  /users                     # List users (admin) or own profile
POST /users                     # User actions (getProfile, updateProfile, etc.)
GET  /users/{id}                # Get user by ID
PUT  /users/{id}                # Update user
DELETE /users/{id}              # Delete user (admin only)
```

## 🔧 Configuration

### Environment Variables
```bash
# AWS Configuration
AWS_REGION=us-east-1
STAGE=dev

# Service Configuration
SERVICE_NAME=microservice-sso-auth-only
```

### Serverless Configuration
File: `serverless-optimized.yml`
- Service name: `microservice-sso-auth-only`
- Runtime: Node.js 18.x
- Memory: 128MB
- Timeout: 30s

## 🎯 OAuth2 Flows Support

### 1. Authorization Code Flow
```javascript
// Step 1: Get authorization code
GET /oauth2/authorize?response_type=code&client_id=xxx&redirect_uri=xxx

// Step 2: Exchange code for tokens
POST /oauth2/token
{
  "grant_type": "authorization_code",
  "code": "auth_code",
  "client_id": "xxx",
  "redirect_uri": "xxx"
}
```

### 2. Password Grant Flow
```javascript
POST /oauth2/token
{
  "grant_type": "password",
  "username": "user@example.com",
  "password": "password123",
  "client_id": "xxx"
}
```

### 3. Client Credentials Flow
```javascript
POST /oauth2/token
{
  "grant_type": "client_credentials",
  "client_id": "xxx"
}
```

### 4. Refresh Token Flow
```javascript
POST /oauth2/refresh
{
  "refresh_token": "refresh_token_here"
}
```

## 🛡️ Security Features

- **JWT-based authentication** với Cognito
- **CORS protection** cho cross-origin requests
- **Role-based access control** (Admin/User)
- **Token expiration** và refresh mechanism
- **Input validation** và sanitization
- **Error handling** an toàn

## 📊 Database Schema

### Users Table (DynamoDB)
```javascript
{
  "userId": "string",           // Primary key
  "email": "string",            // GSI key
  "name": "string",
  "givenName": "string",
  "familyName": "string",
  "phone": "string",
  "role": "user|admin",
  "status": "active|inactive",
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### Sessions Table (DynamoDB)
```javascript
{
  "sessionId": "string",        // Primary key
  "userId": "string",
  "ttl": "number",              // TTL for auto-deletion
  "createdAt": "ISO string"
}
```

## 🧪 Testing

### Frontend Testing Dashboard
Truy cập `http://localhost:3000` để sử dụng testing dashboard với:
- Configuration panel
- Authentication testing
- OAuth2 flow testing
- Token management
- User service testing

### Manual API Testing
```bash
# Register user
curl -X POST https://your-api.amazonaws.com/dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST https://your-api.amazonaws.com/dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Get profile (with JWT)
curl -X GET https://your-api.amazonaws.com/dev/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📝 Scripts

```bash
npm start              # Chạy local server
npm run deploy:auth    # Deploy production
npm run remove         # Xóa deployment
npm test              # Chạy tests
npm run logs          # Xem logs
```

## 🤝 Integration

### Tích hợp với microservice khác

1. **Setup JWT Authorizer** trong service mới
2. **Sử dụng shared Cognito User Pool**
3. **Validate JWT token** từ Auth Service
4. **Extract user info** từ token payload

Example:
```javascript
// Trong service khác
const userInfo = event.requestContext.authorizer;
console.log('User ID:', userInfo.sub);
console.log('Email:', userInfo.email);
console.log('Role:', userInfo['custom:role']);
```

## 📈 Monitoring & Logging

- **CloudWatch Logs** cho tất cả Lambda functions
- **CloudWatch Metrics** cho performance monitoring
- **AWS X-Ray** cho distributed tracing (optional)
- **Custom metrics** cho business logic

## 🔮 Roadmap

- [ ] Social login integration (Google, Facebook)
- [ ] Multi-factor authentication (MFA)
- [ ] Advanced role management
- [ ] API rate limiting
- [ ] Advanced monitoring dashboard
- [ ] Mobile SDK support

## 📞 Support

Nếu bạn gặp vấn đề hoặc có câu hỏi:
1. Kiểm tra [Issues](./issues) đã có
2. Tạo issue mới với template
3. Liên hệ development team

---

**💡 Tip**: Sử dụng testing dashboard tại `http://localhost:3000` để dễ dàng test và debug các API endpoints! 