const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

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

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Default to index.html if root path
    if (pathname === '/') {
        pathname = '/oauth2-sso-test.html';
    }

    // Handle OAuth2 callback route
    if (pathname === '/callback') {
        // Serve the same HTML file but with callback handling
        pathname = '/oauth2-sso-test.html';
    }

    // Handle OAuth2 login route (Authorization Code Flow)
    if (pathname === '/oauth2-login') {
        // Serve custom OAuth2 login page
        const query = parsedUrl.query || '';
        const params = new URLSearchParams(query);
        
        const loginPage = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>OAuth2 Login - Microservice SSO</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        height: 100vh; display: flex; align-items: center; justify-content: center;
                    }
                    .login-container {
                        background: white; border-radius: 12px; padding: 40px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 400px; width: 100%;
                    }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { color: #333; margin-bottom: 10px; }
                    .header p { color: #666; font-size: 14px; }
                    .form-group { margin-bottom: 20px; }
                    .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
                    .form-group input {
                        width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;
                        font-size: 16px; transition: border-color 0.3s;
                    }
                    .form-group input:focus { outline: none; border-color: #667eea; }
                    .btn {
                        width: 100%; padding: 12px; background: #667eea; color: white;
                        border: none; border-radius: 8px; font-size: 16px; font-weight: 600;
                        cursor: pointer; transition: background 0.3s;
                    }
                    .btn:hover { background: #5a6fd8; }
                    .btn:disabled { background: #ccc; cursor: not-allowed; }
                    .oauth-info {
                        background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px;
                        border-left: 4px solid #667eea;
                    }
                    .oauth-info h3 { color: #333; margin-bottom: 10px; font-size: 14px; }
                    .oauth-info p { color: #666; font-size: 12px; margin-bottom: 5px; }
                    .error { color: #e74c3c; font-size: 14px; margin-top: 10px; }
                    .success { color: #27ae60; font-size: 14px; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="login-container">
                    <div class="header">
                        <h1>🔐 OAuth2 Login</h1>
                        <p>Secure authentication for microservice access</p>
                    </div>

                    <div class="oauth-info">
                        <h3>📋 OAuth2 Authorization Request</h3>
                        <p><strong>Client ID:</strong> ${params.get('client_id') || 'N/A'}</p>
                        <p><strong>Scope:</strong> ${params.get('scope') || 'N/A'}</p>
                        <p><strong>Response Type:</strong> ${params.get('response_type') || 'N/A'}</p>
                        <p><strong>State:</strong> ${params.get('state') || 'N/A'}</p>
                    </div>

                    <form id="loginForm">
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input type="email" id="email" name="email" required 
                                   placeholder="Enter your email" value="sso-test@example.com">
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required 
                                   placeholder="Enter your password" value="SSOTest123!">
                        </div>
                        
                        <button type="submit" class="btn" id="loginBtn">
                            🔑 Login & Authorize
                        </button>
                        
                        <div id="message"></div>
                    </form>

                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    
                    <p style="text-align: center; color: #666; font-size: 12px;">
                        This login will authorize the application to access your account.<br>
                        <a href="/" style="color: #667eea;">← Back to OAuth2 Test Dashboard</a>
                    </p>
                </div>

                <script>
                    const API_BASE = 'https://f0ct5flua5.execute-api.us-east-1.amazonaws.com/dev';
                    const urlParams = new URLSearchParams(window.location.search);
                    
                    document.getElementById('loginForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        
                        const loginBtn = document.getElementById('loginBtn');
                        const message = document.getElementById('message');
                        
                        loginBtn.disabled = true;
                        loginBtn.textContent = '🔄 Authenticating...';
                        message.innerHTML = '';
                        
                        try {
                            const email = document.getElementById('email').value;
                            const password = document.getElementById('password').value;
                            
                            // Step 1: Authenticate via OAuth2 Password Grant
                            const authResponse = await fetch(API_BASE + '/oauth2/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    grant_type: 'password',
                                    username: email,
                                    password: password,
                                    client_id: urlParams.get('client_id')
                                })
                            });
                            
                            const authData = await authResponse.json();
                            
                            if (!authResponse.ok) {
                                throw new Error(authData.message || 'Authentication failed');
                            }
                            
                            // Step 2: Generate authorization code
                            const authCode = 'AUTH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            
                            // Step 3: Redirect with authorization code
                            const redirectUri = urlParams.get('redirect_uri');
                            const state = urlParams.get('state');
                            
                            const callbackUrl = redirectUri + 
                                '?code=' + encodeURIComponent(authCode) + 
                                '&state=' + encodeURIComponent(state || '') +
                                '&access_token=' + encodeURIComponent(authData.access_token) +
                                '&id_token=' + encodeURIComponent(authData.id_token) +
                                '&token_type=Bearer';
                            
                            message.innerHTML = '<div class="success">✅ Authentication successful! Redirecting...</div>';
                            
                            setTimeout(() => {
                                window.location.href = callbackUrl;
                            }, 1000);
                            
                        } catch (error) {
                            console.error('Login error:', error);
                            message.innerHTML = '<div class="error">❌ ' + error.message + '</div>';
                            loginBtn.disabled = false;
                            loginBtn.textContent = '🔑 Login & Authorize';
                        }
                    });

                    // Auto-fill demo credentials
                    console.log('🔧 OAuth2 Login Page Ready');
                    console.log('📋 Demo credentials pre-filled for testing');
                </script>
            </body>
            </html>
        `;
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginPage);
        return;
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
    console.log(`🔗 OAuth2 Callback URL: http://localhost:${PORT}/callback`);
    console.log('');
    console.log('📋 Features:');
    console.log('✅ OAuth2 Authorization Code Flow');
    console.log('✅ OAuth2 Client Credentials Flow');
    console.log('✅ JWT Token Management');
    console.log('✅ SSO Cross-Service Testing');
    console.log('✅ Interactive UI for all endpoints');
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