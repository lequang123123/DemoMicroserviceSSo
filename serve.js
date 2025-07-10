const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');

const PORT = 3000;
const API_BASE = 'https://3en4uopxs1.execute-api.us-east-1.amazonaws.com/dev';

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Proxy OAuth2 and auth requests to Lambda
    if (pathname.startsWith('/oauth2/') || pathname.startsWith('/auth/')) {
        try {
            const lambdaPath = pathname;
            const lambdaUrl = `${API_BASE}${lambdaPath}`;
            
            // Prepare headers
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'User-Agent': req.headers['user-agent'] || 'OAuth2-Test-Server'
            };

            // Add authorization header if present
            if (req.headers.authorization) {
                headers['Authorization'] = req.headers.authorization;
            }

            // Prepare request options
            const requestOptions = {
                hostname: '3en4uopxs1.execute-api.us-east-1.amazonaws.com',
                port: 443,
                path: `/dev${lambdaPath}${parsedUrl.search || ''}`,
                method: req.method,
                headers: headers
            };

            let requestData = null;
            if (req.method === 'POST' || req.method === 'PUT') {
                let body = '';
                req.on('data', (chunk) => {
                    body += chunk;
                });
                req.on('end', () => {
                    requestData = body;
                    makeRequest(requestOptions, requestData)
                        .then(response => {
                            // Copy response headers
                            Object.keys(response.headers).forEach(key => {
                                if (key.toLowerCase() !== 'transfer-encoding') {
                                    res.setHeader(key, response.headers[key]);
                                }
                            });
                            
                            res.writeHead(response.statusCode);
                            res.end(response.body);
                        })
                        .catch(error => {
                            console.error('Lambda request error:', error);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Internal server error' }));
                        });
                });
                return;
            } else {
                // For GET requests
                const response = await makeRequest(requestOptions);
                
                // Copy response headers
                Object.keys(response.headers).forEach(key => {
                    if (key.toLowerCase() !== 'transfer-encoding') {
                        res.setHeader(key, response.headers[key]);
                    }
                });
                
                res.writeHead(response.statusCode);
                res.end(response.body);
                return;
            }
        } catch (error) {
            console.error('Proxy error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
            return;
        }
    }

    // Default to dashboard if root path
    if (pathname === '/') {
        pathname = '/ui/dashboard.html';
    }

    // Handle OAuth2 callback route
    if (pathname === '/callback') {
        // Serve the same HTML file but with callback handling
        pathname = '/oauth2-demo.html';
    }

    // Handle OAuth2 SSO test page
    if (pathname === '/oauth2-sso-test') {
        pathname = '/ui/oauth2-sso-test.html';
    }

    const filePath = path.join(__dirname, pathname);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>404 Not Found</title></head>
                    <body>
                        <h1>404 - File Not Found</h1>
                        <p>The requested file was not found.</p>
                        <p><a href="/">Go to OAuth2 Test App</a></p>
                    </body>
                    </html>
                `);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log('🚀 OAuth2 & SSO Test Server Started!');
    console.log(`📱 Frontend URL: http://localhost:${PORT}`);
    console.log(`🔗 OAuth2 Callback URL: http://localhost:${PORT}/oauth2-demo.html`);
    console.log(`🔗 Lambda API URL: ${API_BASE}`);
    console.log('');
    console.log('📋 Features:');
    console.log('✅ OAuth2 Authorization Code Flow');
    console.log('✅ OAuth2 Client Credentials Flow');
    console.log('✅ JWT Token Management');
    console.log('✅ SSO Cross-Service Testing');
    console.log('✅ Interactive UI for all endpoints');
    console.log('✅ Lambda API Proxy');
    console.log('');
    console.log('🔧 Ready to test OAuth2 & SSO!');
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please try a different port.`);
    } else {
        console.error('❌ Server error:', err);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped.');
        process.exit(0);
    });
}); 