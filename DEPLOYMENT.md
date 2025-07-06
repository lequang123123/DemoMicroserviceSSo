# Hướng dẫn Deploy Microservice SSO

## 📋 Checklist trước khi Deploy

- [ ] AWS CLI đã cài đặt và cấu hình
- [ ] Node.js 18.x+ đã cài đặt
- [ ] Serverless Framework CLI đã cài đặt
- [ ] Tất cả dependencies đã cài đặt
- [ ] Environment variables đã cấu hình

## 🚀 Deploy Steps

### 1. Chuẩn bị môi trường

```bash
# Cài đặt Serverless Framework CLI
npm install -g serverless

# Cài đặt dependencies
npm install

# Cấu hình AWS credentials
aws configure
# Hoặc sử dụng AWS profile
export AWS_PROFILE=your-profile-name
```

### 2. Validate Configuration

```bash
# Kiểm tra cấu hình Serverless
npm run validate

# Xem preview của resources sẽ được tạo
npm run print
```

### 3. Deploy Development Environment

```bash
# Deploy development stack
npm run deploy:dev

# Hoặc dùng lệnh serverless trực tiếp
sls deploy --stage dev --region us-east-1

// Deploy from file serverless-optimized.yml
sls deploy --config serverless-optimized.yml
```

### 4. Deploy Production Environment

```bash
# Deploy production stack
npm run deploy:prod

# Hoặc dùng lệnh serverless trực tiếp
sls deploy --stage prod --region us-east-1
```

### 5. Kiểm tra Deploy

```bash
# Xem thông tin stack
sls info --stage dev

# Test health check endpoint
curl https://your-api-gateway-url/health

# Xem logs
sls logs --function healthCheck --stage dev
```

## 🔧 Deploy Configuration

### Environment Variables

Cấu hình các biến môi trường trong file `env.dev` hoặc `env.prod`:

```bash
# Copy template
cp env.example env.dev

# Chỉnh sửa các giá trị
nano env.dev
```

### Stage-specific Configuration

```yaml
# serverless.yml
provider:
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}
  
custom:
  stage: ${self:provider.stage}
  region: ${self:provider.region}
```

### Memory và Timeout Settings

```yaml
# serverless.yml
provider:
  memorySize: 128  # MB
  timeout: 50      # seconds
```

## 📊 Monitoring sau Deploy

### CloudWatch Logs

```bash
# Xem logs real-time
sls logs --function authService --stage dev --tail

# Xem logs của tất cả functions
sls logs --stage dev --tail
```

### CloudWatch Metrics

1. **Lambda Metrics**:
   - Duration
   - Error rate
   - Throttles
   - Cold starts

2. **API Gateway Metrics**:
   - Request count
   - Latency
   - 4XX/5XX errors
   - Cache hits/misses

3. **DynamoDB Metrics**:
   - Read/Write capacity
   - Throttled requests
   - System errors

### Health Check Monitoring

```bash
# Kiểm tra health status
curl https://your-api-gateway-url/health

# Response mẫu
{
  "status": "healthy",
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "1.0.0",
    "environment": "dev",
    "uptime": 45.123
  }
}
```

## 🔐 Security Configuration

### IAM Roles

```yaml
# config/iam.yml
role:
  statements:
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:GetItem
        - dynamodb:PutItem
      Resource: !GetAtt UsersTable.Arn
```

### CORS Configuration

```yaml
# functions/auth.yml
events:
  - http:
      path: /auth/login
      method: post
      cors:
        origin: '*'
        headers:
          - Content-Type
          - X-Amz-Date
          - Authorization
```

### Environment Variables Security

```bash
# Không commit sensitive data
echo "*.env" >> .gitignore

# Sử dụng AWS Parameter Store cho production
aws ssm put-parameter \
  --name "/microservice-sso/prod/jwt-secret" \
  --value "your-secret-key" \
  --type "SecureString"
```

## 📈 Performance Optimization

### Cold Start Optimization

```yaml
# serverless.yml
custom:
  warmup:
    enabled: true
    events:
      - schedule: rate(5 minutes)
    concurrency: 1
```

### Memory Optimization

```bash
# Test với memory khác nhau
sls deploy --stage dev --memorySize 256
sls deploy --stage dev --memorySize 512
```

### Bundle Optimization

```bash
# Loại bỏ unused dependencies
npm prune --production

# Sử dụng webpack để bundle
npm install --save-dev webpack webpack-node-externals
```

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied**:
   ```bash
   # Kiểm tra IAM permissions
   aws sts get-caller-identity
   ```

2. **Function Timeout**:
   ```yaml
   # Tăng timeout
   provider:
     timeout: 30
   ```

3. **Memory Limit**:
   ```yaml
   # Tăng memory
   provider:
     memorySize: 256
   ```

4. **DynamoDB Throttling**:
   ```yaml
   # Chuyển sang on-demand billing
   BillingMode: PAY_PER_REQUEST
   ```

### Debug Commands

```bash
# Invoke function locally
sls invoke local --function authService --data '{"body": "{\"email\":\"test@example.com\"}"}'

# Invoke function trên AWS
sls invoke --function authService --data '{"body": "{\"email\":\"test@example.com\"}"}'

# Package mà không deploy
sls package

# Remove stack hoàn toàn
sls remove --stage dev
```

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS
on:
  push:
    branches: [master]]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run deploy:prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### AWS CodePipeline

```yaml
# buildspec.yml
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm install -g serverless
  pre_build:
    commands:
      - npm install
  build:
    commands:
      - sls deploy --stage prod
```

## 📊 Cost Optimization

### Pricing Calculator

```bash
# Estimate costs
aws pricing get-products --service-code AWSLambda
```

### Resource Optimization

1. **Memory Right-sizing**:
   - Monitor memory usage
   - Adjust based on actual usage

2. **Execution Time**:
   - Optimize code performance
   - Use efficient algorithms

3. **Request Frequency**:
   - Implement caching
   - Use CDN cho static content

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] IAM roles có least privilege
- [ ] CORS properly configured
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Monitoring alerts set up
- [ ] Backup strategy implemented
- [ ] Security scan completed
- [ ] Performance testing done
- [ ] Documentation updated

## 📞 Support

### Log Analysis

```bash
# Search logs for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/microservice-sso-dev-authService \
  --filter-pattern "ERROR"

# Export logs
aws logs export-task \
  --destination-bucket my-log-bucket \
  --log-group-name /aws/lambda/microservice-sso-dev-authService
```

### Health Monitoring

```bash
# Create CloudWatch alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "Lambda-Errors" \
  --alarm-description "Monitor Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

## 🔧 Advanced Configuration

### Custom Domains

```yaml
# Sử dụng plugin
plugins:
  - serverless-domain-manager

custom:
  customDomain:
    domainName: api.yourdomain.com
    stage: ${self:provider.stage}
    createRoute53Record: true
```

### VPC Configuration

```yaml
# serverless.yml
provider:
  vpc:
    securityGroupIds:
      - sg-12345678
    subnetIds:
      - subnet-12345678
      - subnet-87654321
```

### Environment-specific Resources

```yaml
# resources/dynamodb.yml
Resources:
  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: ${self:custom.dynamodb.billingMode}
      
custom:
  dynamodb:
    billingMode:
      dev: PAY_PER_REQUEST
      prod: PROVISIONED
```

---

💡 **Tip**: Luôn test trên development environment trước khi deploy production!

🚀 **Happy Deploying!** 