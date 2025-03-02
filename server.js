const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Secret key for JWT signing - in production, use environment variables
const JWT_SECRET = 'your-secret-key-1';

// Access key for admin login - in production, use environment variables
const ADMIN_ACCESS_KEY = '1'; // The single key for access as requested

// Store client details: key = clientId, value = { ws, jobId, userId, username, gameName, ping, fps, memory }
const clients = new Map();

// Middleware for parsing JSON and cookies
app.use(express.json());
app.use(cookieParser());

// Authentication middleware
const authenticate = (req, res, next) => {
    // Skip authentication for login route and static files
    if (req.path === '/auth/login' || req.path === '/login.html' ||
        req.path === '/login.js' || req.path === '/login.css' ||
        req.path === '/styles.css' ||
        req.path.startsWith('/favicon')) {
        return next();
    }

    // Check for token in Authorization header, cookies, or query parameter
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    
    // Check cookies if no token in header
    if (!token && req.cookies && req.cookies.ethosAuth) {
        token = req.cookies.ethosAuth;
    }
    
    // Check query parameter as a last resort (for WebSocket connections)
    if (!token && req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        // If no token and requesting index.html, redirect to login
        if (req.path === '/' || req.path === '/index.html') {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        // If token is invalid and requesting index.html, redirect to login
        if (req.path === '/' || req.path === '/index.html') {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Apply authentication middleware to all routes
app.use(authenticate);

// Heartbeat to detect dead connections
function heartbeat() {
    this.isAlive = true;
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.on('pong', heartbeat);

    // Check for token in query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (token) {
        try {
            // Verify token from query parameter
            const decoded = jwt.verify(token, JWT_SECRET);
            ws.isAdmin = decoded.role === 'admin';
            ws.isAuthenticated = true;
        } catch (err) {
            // Invalid token in query parameter
            ws.send(JSON.stringify({ action: 'authError', error: 'Invalid token' }));
        }
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Handle admin registration with authentication
            if (data.action === 'adminRegister') {
                if (data.token || ws.isAuthenticated) {
                    try {
                        // If not already authenticated, verify token from message
                        if (!ws.isAuthenticated && data.token) {
                            const decoded = jwt.verify(data.token, JWT_SECRET);
                            ws.isAdmin = true;
                            ws.isAuthenticated = true;
                        }
                        ws.send(JSON.stringify({ action: 'adminRegistered' }));
                    } catch (err) {
                        ws.send(JSON.stringify({ action: 'authError', error: 'Invalid token' }));
                    }
                } else {
                    ws.send(JSON.stringify({ action: 'authError', error: 'Authentication required' }));
                }
                return;
            }
            
            // For admin actions, require authentication
            if (data.action === 'adminRegister' || data.action.startsWith('admin')) {
                if (!ws.isAuthenticated) {
                    ws.send(JSON.stringify({ action: 'authError', error: 'Authentication required' }));
                    return;
                }
            }
            
            if (data.action === 'register') {
                const clientId = uuidv4();
                clients.set(clientId, {
                    ws,
                    id: clientId,
                    jobId: data.jobId || '',
                    userId: data.userId || '',
                    username: data.username || 'Anonymous',
                    gameName: data.gameName || 'Unknown Game',
                    ping: data.ping || 0,
                    fps: data.fps || 0,
                    memory: data.memory || 0
                });
                ws.send(JSON.stringify({ action: 'assignId', id: clientId }));
                
                // Broadcast client added event to all connected admin clients
                broadcastToAdmins({ action: 'clientAdded', clientId });
            } else if (data.action === 'updateMetrics' && data.id) {
                const client = clients.get(data.id);
                if (client) {
                    client.ping = data.ping || client.ping;
                    client.fps = data.fps || client.fps;
                    client.memory = data.memory || client.memory;
                }
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });
    
    ws.on('close', () => {
        let removedClientId = null;
        
        for (const [clientId, client] of clients) {
            if (client.ws === ws) {
                clients.delete(clientId);
                removedClientId = clientId;
                break;
            }
        }
        
        // If a client was removed, broadcast to all admin connections
        if (removedClientId) {
            broadcastToAdmins({ action: 'clientRemoved', clientId: removedClientId });
        }
    });
});

// Function to broadcast to all admin connections
function broadcastToAdmins(data) {
    wss.clients.forEach(client => {
        if (client.isAdmin && client.isAuthenticated && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Ping clients every 30 seconds to maintain connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// Serve static files from main directory
app.use(express.static('./'));

// Login endpoint
app.post('/auth/login', (req, res) => {
    const { key } = req.body;
    
    if (key === ADMIN_ACCESS_KEY) {
        // Generate JWT token
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        
        // Set token as a cookie that expires in 24 hours
        res.cookie('ethosAuth', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        // Also return token in response for localStorage
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid access key' });
    }
});

// Status endpoint for checking server health
app.get('/status', (req, res) => {
    res.json({ status: 'ok', clients: clients.size });
});

// API endpoint to get list of clients
app.get('/clients', (req, res) => {
    const clientsArray = [];
    
    // Convert Map to array for the response
    clients.forEach((value, key) => {
        clientsArray.push({
            id: key,
            jobId: value.jobId,
            userId: value.userId,
            username: value.username,
            gameName: value.gameName,
            ping: value.ping,
            fps: value.fps,
            memory: value.memory
        });
    });
    
    res.json(clientsArray);
});

// API endpoint to send commands
app.post('/sendCommand', express.json(), (req, res) => {
    const { target, command, params } = req.body;
    const message = JSON.stringify({ action: 'command', command, params });
    if (target === 'all') {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    } else {
        const client = clients.get(target);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    }
    res.sendStatus(200);
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});