exports.handler = async (event) => {
    console.log('Health Check Event:', JSON.stringify(event, null, 2));
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.VERSION || '1.0.0',
        environment: process.env.STAGE || 'dev',
        region: process.env.REGION || 'us-east-1',
        service: 'microservice-sso',
        uptime: process.uptime(),
        memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external
        },
        nodejs: process.version,
        platform: process.platform,
        arch: process.arch
    };
    
    // Perform basic health checks
    const checks = {
        lambda: true,
        environment: checkEnvironmentVariables(),
        memory: checkMemoryUsage()
    };
    
    const isHealthy = Object.values(checks).every(check => check === true);
    
    return {
        statusCode: isHealthy ? 200 : 503,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
            status: isHealthy ? 'healthy' : 'unhealthy',
            data: healthData,
            checks: checks
        })
    };
};

function checkEnvironmentVariables() {
    const requiredEnvVars = [
        'USER_POOL_ID',
        'USER_POOL_CLIENT_ID',
        'USERS_TABLE_NAME',
        'ORDERS_TABLE_NAME',
        'PRODUCTS_TABLE_NAME',
        'SESSIONS_TABLE_NAME'
    ];
    
    return requiredEnvVars.every(envVar => process.env[envVar]);
}

function checkMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const maxMemory = 128 * 1024 * 1024; // 512MB in bytes
    const usedPercentage = (memoryUsage.heapUsed / maxMemory) * 100;
    
    return usedPercentage < 90; // Return false if memory usage > 90%
} 