# 🛡️ Deployment Checklist - Tránh mất data

## ✅ **Pre-Deployment (BẮT BUỘC)**

### **1. 💾 Backup Current Data**
```bash
# Backup Cognito users
npm run backup:cognito

# Backup Cognito configuration
npm run backup:config

# Verify backup files được tạo
ls -la cognito-backup-*.json
ls -la cognito-config-*.json
```

### **2. 🔍 Check CloudFormation Drift**
```bash
# Get current stack info
aws cloudformation describe-stacks --stack-name microservice-sso-optimized-dev

# Check for drift
aws cloudformation detect-stack-drift --stack-name microservice-sso-optimized-dev
```

### **3. 📋 Validate Serverless Config**
```bash
# Validate configuration
npm run validate

# Check what will be deployed
serverless print --config serverless-optimized.yml > deployment-preview.yml
```

### **4. 🔐 Verify Protection Policies**
Ensure `DeletionPolicy: Retain` is set for:
- ✅ CognitoUserPool
- ✅ CognitoUserPoolClient  
- ✅ UsersTable
- ✅ ProductsTable
- ✅ OrdersTable

## 🚀 **Safe Deployment Options**

### **Option 1: Safe Deploy (Recommended)**
```bash
# This will backup first, then deploy
npm run deploy:safe
```

### **Option 2: Manual Step-by-Step**
```bash
# Step 1: Backup
npm run backup:cognito
npm run backup:config

# Step 2: Deploy  
npm run deploy:optimized

# Step 3: Verify
curl https://3en4uopxs1.execute-api.us-east-1.amazonaws.com/dev/health
```

### **Option 3: Blue-Green Deployment**
```bash
# Deploy to new stage first
serverless deploy --stage staging --config serverless-optimized.yml

# Test staging thoroughly
curl https://your-staging-api/health

# Switch production when ready
serverless deploy --stage prod --config serverless-optimized.yml
```

## ⚠️ **NEVER DO THESE**

### **❌ Dangerous Commands**
```bash
# DON'T use remove without backup
serverless remove                    # ❌ Will delete everything

# DON'T force deploy without understanding
serverless deploy --force           # ⚠️  Can trigger recreations

# DON'T change logical resource names
# In serverless.yml: changing CognitoUserPool → UserPool will recreate
```

### **❌ Dangerous Config Changes**
```yaml
# DON'T change these without backup:
CognitoUserPool:
  Properties:
    UsernameAttributes:       # ❌ Triggers replacement
      - email
    UserPoolName:            # ⚠️  Can trigger replacement
    DeletionPolicy:          # ❌ Never remove this
```

## 🔄 **Post-Deployment Verification**

### **1. 🧪 Test Core Functions**
```bash
# Health check
curl https://your-api-url/dev/health

# Auth test
curl https://your-api-url/dev/auth/test

# Test with existing user
curl -X POST https://your-api-url/dev/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"password","username":"sso-test@example.com","password":"SSOTest123!","client_id":"YOUR_CLIENT_ID"}'
```

### **2. 📊 Verify Data Integrity**
```bash
# Check Cognito User Pool ID hasn't changed
aws cognito-idp list-user-pools --max-items 20

# Check DynamoDB tables exist
aws dynamodb list-tables

# Test existing user login
# (If this fails, you may need to restore from backup)
```

### **3. 🔍 Monitor CloudWatch**
- Check Lambda function logs
- Verify no unusual errors
- Monitor API Gateway metrics

## 🆘 **Recovery Procedures**

### **If Data is Lost:**

#### **1. 📥 Restore Users from Backup**
```bash
# Find your backup file
ls -la cognito-backup-*.json

# Get new User Pool ID after recreation
aws cognito-idp list-user-pools --max-items 20

# Restore users to new pool
node backup-cognito.js restore us-east-1_NEW_POOL_ID cognito-backup-YYYY-MM-DD.json
```

#### **2. 🔄 Update Environment Variables**
```bash
# Update Lambda functions với new User Pool ID
serverless deploy function --function authService
```

#### **3. 📋 Recreate Test Users**
```bash
# Register test users again
curl -X POST https://your-api-url/dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"sso-test@example.com","password":"SSOTest123!","name":"SSO Test User"}'
```

## 📈 **Best Practices**

### **✅ DO**
- ✅ Always backup before major changes
- ✅ Use `DeletionPolicy: Retain` cho critical resources
- ✅ Test deployment trên staging environment trước
- ✅ Keep backup files versioned và dated
- ✅ Document any manual changes outside CloudFormation
- ✅ Use infrastructure versioning (git tags)

### **❌ DON'T**
- ❌ Deploy trực tiếp lên production without testing
- ❌ Remove DeletionPolicy từ critical resources  
- ❌ Change resource logical IDs unnecessarily
- ❌ Make manual changes via AWS Console
- ❌ Deploy when CloudFormation drift detected
- ❌ Ignore backup file timestamps

## 🔧 **Emergency Contacts & Resources**

### **Recovery Commands Cheat Sheet**
```bash
# Quick backup
npm run backup:cognito

# Emergency restore  
node backup-cognito.js restore NEW_POOL_ID backup-file.json

# Stack rollback (if supported)
aws cloudformation cancel-update-stack --stack-name your-stack

# Check stack events
aws cloudformation describe-stack-events --stack-name your-stack
```

### **Important Resource IDs (Current)**
- **User Pool**: `us-east-1_8ML8938m2`
- **Client ID**: `1rtq4ll07cvvatg432efpnjtta`
- **API URL**: `https://3en4uopxs1.execute-api.us-east-1.amazonaws.com/dev`

---

**⚡ Remember: "Backup first, deploy second, verify third!"** 