/**
 * Cognito Backup & Restore Utility
 * Backup users trước khi deploy để tránh mất data
 */
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const cognito = new AWS.CognitoIdentityServiceProvider();

class CognitoBackup {
    constructor(userPoolId, region = 'us-east-1') {
        this.userPoolId = userPoolId;
        this.region = region;
        AWS.config.update({ region: this.region });
    }

    /**
     * Backup all users từ Cognito User Pool
     */
    async backupUsers() {
        console.log('🔄 Starting Cognito users backup...');
        
        try {
            const users = [];
            let paginationToken = null;
            
            do {
                const params = {
                    UserPoolId: this.userPoolId,
                    Limit: 60, // Max per request
                    ...(paginationToken && { PaginationToken: paginationToken })
                };
                
                const result = await cognito.listUsers(params).promise();
                users.push(...result.Users);
                paginationToken = result.PaginationToken;
                
                console.log(`📥 Downloaded ${users.length} users...`);
            } while (paginationToken);
            
            // Save backup to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = `cognito-backup-${timestamp}.json`;
            
            const backupData = {
                userPoolId: this.userPoolId,
                region: this.region,
                timestamp: new Date().toISOString(),
                userCount: users.length,
                users: users.map(user => ({
                    Username: user.Username,
                    UserAttributes: user.Attributes,
                    UserStatus: user.UserStatus,
                    Enabled: user.Enabled,
                    UserCreateDate: user.UserCreateDate,
                    UserLastModifiedDate: user.UserLastModifiedDate
                }))
            };
            
            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            console.log(`✅ Backup complete: ${backupFile}`);
            console.log(`📊 Total users backed up: ${users.length}`);
            
            return backupFile;
            
        } catch (error) {
            console.error('❌ Backup failed:', error.message);
            throw error;
        }
    }

    /**
     * Restore users từ backup file
     */
    async restoreUsers(backupFile) {
        console.log(`🔄 Starting restore from: ${backupFile}`);
        
        try {
            const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            const users = backupData.users;
            
            console.log(`📊 Restoring ${users.length} users...`);
            
            let restored = 0;
            let errors = 0;
            
            for (const user of users) {
                try {
                    // Create user trong new User Pool
                    const createParams = {
                        UserPoolId: this.userPoolId,
                        Username: user.Username,
                        UserAttributes: user.UserAttributes,
                        MessageAction: 'SUPPRESS', // Don't send welcome email
                        TemporaryPassword: 'TempPassword123!', // Will need to be reset
                    };
                    
                    await cognito.adminCreateUser(createParams).promise();
                    
                    // Set user status
                    if (user.UserStatus === 'CONFIRMED') {
                        await cognito.adminConfirmSignUp({
                            UserPoolId: this.userPoolId,
                            Username: user.Username
                        }).promise();
                    }
                    
                    restored++;
                    console.log(`✅ Restored: ${user.Username}`);
                    
                } catch (error) {
                    errors++;
                    console.error(`❌ Failed to restore ${user.Username}:`, error.message);
                    
                    // Continue với users khác
                    continue;
                }
            }
            
            console.log(`🎉 Restore complete!`);
            console.log(`✅ Successfully restored: ${restored} users`);
            console.log(`❌ Failed: ${errors} users`);
            
            return { restored, errors };
            
        } catch (error) {
            console.error('❌ Restore failed:', error.message);
            throw error;
        }
    }

    /**
     * Export User Pool configuration
     */
    async backupConfiguration() {
        console.log('🔄 Backing up User Pool configuration...');
        
        try {
            const userPool = await cognito.describeUserPool({
                UserPoolId: this.userPoolId
            }).promise();
            
            const clients = await cognito.listUserPoolClients({
                UserPoolId: this.userPoolId
            }).promise();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const configFile = `cognito-config-${timestamp}.json`;
            
            const configData = {
                userPool: userPool.UserPool,
                clients: clients.UserPoolClients,
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
            console.log(`✅ Configuration backup: ${configFile}`);
            
            return configFile;
            
        } catch (error) {
            console.error('❌ Configuration backup failed:', error.message);
            throw error;
        }
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const userPoolId = args[1];
    
    if (!command || !userPoolId) {
        console.log('Usage:');
        console.log('  node backup-cognito.js backup <USER_POOL_ID>');
        console.log('  node backup-cognito.js restore <USER_POOL_ID> <BACKUP_FILE>');
        console.log('  node backup-cognito.js config <USER_POOL_ID>');
        console.log('');
        console.log('Examples:');
        console.log('  node backup-cognito.js backup us-east-1_8ML8938m2');
        console.log('  node backup-cognito.js restore us-east-1_NEW123 cognito-backup-2025-01-07.json');
        console.log('  node backup-cognito.js config us-east-1_8ML8938m2');
        process.exit(1);
    }
    
    const backup = new CognitoBackup(userPoolId);
    
    (async () => {
        try {
            switch (command) {
                case 'backup':
                    await backup.backupUsers();
                    break;
                    
                case 'restore':
                    const backupFile = args[2];
                    if (!backupFile) {
                        console.error('❌ Backup file required for restore');
                        process.exit(1);
                    }
                    await backup.restoreUsers(backupFile);
                    break;
                    
                case 'config':
                    await backup.backupConfiguration();
                    break;
                    
                default:
                    console.error('❌ Invalid command:', command);
                    process.exit(1);
            }
        } catch (error) {
            console.error('❌ Operation failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = CognitoBackup; 