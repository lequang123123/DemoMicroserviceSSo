# Microservice SSO với AWS Lambda và Serverless Framework

Dự án này triển khai hệ thống microservice với Single Sign-On (SSO) sử dụng AWS Lambda, API Gateway, Cognito, và DynamoDB.

## 📋 Tổng quan

Hệ thống bao gồm các microservice sau:

- **Auth Service**: Xử lý authentication và authorization
- **User Service**: Quản lý thông tin người dùng
- **Order Service**: Quản lý đơn hàng
- **Product Service**: Quản lý sản phẩm
- **Health Check**: Kiểm tra trạng thái hệ thống

## 🏗️ Kiến trúc

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend App  │    │   Mobile App    │    │   3rd Party     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  API Gateway    │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Lambda Authorizer│
                    └─────────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │Auth Service │    │User Service │    │Order Service│
  └─────────────┘    └─────────────┘    └─────────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   DynamoDB      │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Cognito       │
                    └─────────────────┘
```

## 🛠️ Cài đặt

### Prerequisites

- Node.js 18.x hoặc cao hơn
- AWS CLI đã cấu hình
- Serverless Framework CLI

### Cài đặt dependencies

```bash
npm install
```

### Cấu hình Environment Variables

1. Copy file template environment:
```bash
cp env.example .env
```

2. Điền các giá trị thực tế trong file `.env`:
```bash
# Chỉnh sửa file .env với các giá trị của bạn
nano .env
```

### Cấu hình AWS

```bash
# Cấu hình AWS CLI
aws configure

# Hoặc sử dụng profile
export AWS_PROFILE=your-profile-name
```

## 🚀 Deployment

### Development Environment

```bash
# Deploy toàn bộ stack
npm run deploy

# Hoặc sử dụng lệnh serverless trực tiếp
sls deploy --stage dev
```

### Production Environment

```bash
# Deploy production
npm run deploy:prod

# Hoặc
sls deploy --stage prod
```

### Deploy từng function riêng lẻ

```bash
# Deploy một function cụ thể
sls deploy function --function authService
sls deploy function --function userService
sls deploy function --function orderService
sls deploy function --function productService
```

## 🧪 Testing

### Local Development

```bash
# Chạy serverless offline
npm run dev

# Hoặc
sls offline start
```

### Testing các endpoint

```bash
# Health check
curl https://your-api-url/health

# Register user
curl -X POST https://your-api-url/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!","given_name":"Test","family_name":"User"}'

# Login
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}'

# Get user profile (cần token)
curl -X GET https://your-api-url/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📁 Cấu trúc dự án

```
microserviceSSo/
├── config/                    # Cấu hình Serverless
│   ├── environment.yml        # Environment variables
│   └── iam.yml               # IAM permissions
├── functions/                 # Cấu hình functions
│   ├── auth.yml              # Auth service config
│   ├── user.yml              # User service config
│   ├── order.yml             # Order service config
│   ├── product.yml           # Product service config
│   └── health.yml            # Health check config
├── resources/                 # AWS resources
│   ├── cognito.yml           # Cognito configuration
│   ├── dynamodb.yml          # DynamoDB tables
│   └── outputs.yml           # CloudFormation outputs
├── lambda/                    # Lambda functions
│   ├── auth-service/         # Authentication service
│   ├── user-service/         # User management
│   ├── order-service/        # Order management
│   ├── product-service/      # Product management
│   ├── cognito-authorizer/   # JWT authorizer
│   └── health-check/         # Health check
├── serverless.yml            # Main Serverless config
├── package.json              # Dependencies
├── buildspec.yml             # CI/CD configuration
├── .gitignore               # Git ignore rules
├── env.example              # Environment template
└── README.md                # This file
```

## 🔐 Authentication Flow

1. **Register**: `/auth/register` - Tạo tài khoản mới
2. **Login**: `/auth/login` - Đăng nhập và nhận JWT token
3. **Refresh**: `/auth/refresh` - Làm mới token
4. **Logout**: `/auth/logout` - Đăng xuất
5. **Forgot Password**: `/auth/forgot-password` - Quên mật khẩu
6. **Reset Password**: `/auth/reset-password` - Đặt lại mật khẩu

## 📊 API Endpoints

### Authentication Service
- `POST /auth/register` - Đăng ký người dùng mới
- `POST /auth/login` - Đăng nhập
- `POST /auth/refresh` - Làm mới token
- `POST /auth/logout` - Đăng xuất
- `POST /auth/forgot-password` - Quên mật khẩu
- `POST /auth/reset-password` - Đặt lại mật khẩu

### User Service
- `GET /users/profile` - Lấy thông tin profile
- `PUT /users/profile` - Cập nhật profile
- `GET /users/{userId}` - Lấy thông tin user (admin)
- `PUT /users/{userId}` - Cập nhật user (admin)
- `DELETE /users/{userId}` - Xóa user (admin)

### Order Service
- `POST /orders` - Tạo đơn hàng mới
- `GET /orders` - Lấy danh sách đơn hàng của user
- `GET /orders/{orderId}` - Lấy chi tiết đơn hàng
- `PUT /orders/{orderId}` - Cập nhật đơn hàng
- `DELETE /orders/{orderId}` - Hủy đơn hàng

### Product Service
- `GET /products` - Lấy danh sách sản phẩm (public)
- `GET /products/{productId}` - Lấy chi tiết sản phẩm (public)
- `POST /products` - Tạo sản phẩm mới (admin)
- `PUT /products/{productId}` - Cập nhật sản phẩm (admin)
- `DELETE /products/{productId}` - Xóa sản phẩm (admin)

### Health Check
- `GET /health` - Kiểm tra trạng thái hệ thống

## 🎯 Features

- ✅ JWT Authentication với Cognito
- ✅ Role-based Access Control (RBAC)
- ✅ Microservice Architecture
- ✅ Serverless Framework
- ✅ DynamoDB NoSQL Database
- ✅ API Gateway với CORS
- ✅ Lambda Authorizer
- ✅ CloudWatch Logging
- ✅ Environment-based Deployment
- ✅ Health Check Endpoint
- ✅ Modular Configuration

## 🔧 Monitoring & Logging

### CloudWatch Logs

```bash
# Xem logs của function
sls logs --function authService
sls logs --function userService
sls logs --function orderService
```

### Metrics

- API Gateway request/response metrics
- Lambda function duration và error rates
- DynamoDB read/write capacity metrics
- Cognito authentication metrics

## 🛡️ Security

- JWT token validation
- Role-based access control
- CORS configuration
- Input validation
- Error handling không expose sensitive data
- Rate limiting (có thể enable)

## 📈 Performance

- Lambda function warmup
- DynamoDB on-demand billing
- API Gateway caching (có thể enable)
- Optimal memory allocation (128MB)

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied**: Kiểm tra IAM roles và policies
2. **Function Timeout**: Tăng timeout trong serverless.yml
3. **DynamoDB Access**: Đảm bảo IAM permissions cho DynamoDB
4. **CORS Issues**: Kiểm tra CORS configuration

### Debug Commands

```bash
# Kiểm tra stack info
sls info

# Invoke function locally
sls invoke local --function authService --data '{"body":"{\"email\":\"test@example.com\"}"}'

# Remove stack
sls remove
```

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - xem file LICENSE để biết thêm details.

## 📞 Support

- Email: your-email@example.com
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)

## 🔄 CI/CD

Dự án sử dụng AWS CodePipeline với buildspec.yml để tự động deploy khi có thay đổi code.

### Pipeline Stages

1. **Source**: Lấy code từ repository
2. **Build**: Chạy tests và build artifacts
3. **Deploy**: Deploy lên AWS

### Manual Deploy

```bash
# Build và deploy
npm run build
npm run deploy
```

## 🌟 Roadmap

- [ ] Add unit tests
- [ ] Implement API rate limiting
- [ ] Add email notifications
- [ ] Implement caching layer
- [ ] Add monitoring dashboard
- [ ] Implement backup strategy
- [ ] Add CI/CD pipeline
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation improvements 