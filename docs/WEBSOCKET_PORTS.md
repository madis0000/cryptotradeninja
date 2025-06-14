# Port Configuration and WebSocket Management

## Port Allocation Strategy

To avoid conflicts between Vite's development server and our custom trading WebSocket, we use the following port allocation:

### Development Environment

| Service | Port | Purpose | Protocol |
|---------|------|---------|----------|
| **Vite Dev Server** | 3000 | React frontend with HMR | HTTP |
| **Vite HMR WebSocket** | 3002 | Hot Module Replacement | WebSocket |
| **Express API Server** | 5000 | REST API endpoints | HTTP |
| **Trading WebSocket** | 3001 | Real-time trading data | WebSocket |

### Production Environment

| Service | Port | Purpose | Protocol |
|---------|------|---------|----------|
| **Express Server** | 5000 | Static files + API + WebSocket | HTTP/WebSocket |

## WebSocket Separation Logic

### Development Mode
- **Vite WebSocket** (`ws://localhost:3002`) - Used for Hot Module Replacement (HMR)
- **Trading WebSocket** (`ws://localhost:3001`) - Used for real-time trading data, market updates, and bot communications

### Why Separate Ports in Development?
1. **Avoid Conflicts**: Vite's HMR WebSocket won't interfere with trading data streams
2. **Better Debugging**: Each service can be monitored independently
3. **Development Flexibility**: Frontend can be restarted without affecting trading connections
4. **Clear Separation**: Different concerns handled by different services

## Client-Side Connection Logic

The client automatically detects the environment and connects to the appropriate WebSocket:

```typescript
// Development: ws://localhost:3001/api/ws
// Production: ws://current-host:current-port/api/ws
```

## Server-Side WebSocket Initialization

### Development Mode
```typescript
// Creates separate HTTP server for WebSocket on port 3001
const wsServer = createServer();
wsService = new WebSocketService(wsServer);
wsServer.listen(3001, '0.0.0.0');
```

### Production Mode
```typescript
// Uses same HTTP server for both API and WebSocket
wsService = new WebSocketService(httpServer);
```

## Configuration Files

### `.env`
```env
PORT=5000           # Express server
WS_PORT=3001        # Trading WebSocket (dev only)
```

### `vite.config.ts`
```typescript
server: {
  port: 3000,       # Frontend dev server
  hmr: {
    port: 3002,     # Vite HMR WebSocket
  }
}
```

## Troubleshooting WebSocket Connections

### Common Issues
1. **Port Conflicts**: Ensure no other services use ports 3000, 3001, 3002, or 5000
2. **Firewall**: Allow WebSocket connections on these ports
3. **Environment Detection**: Client correctly detects dev vs prod environment

### Verification Commands
```bash
# Check if ports are available
netstat -an | findstr ":3000"
netstat -an | findstr ":3001" 
netstat -an | findstr ":3002"
netstat -an | findstr ":5000"

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" http://localhost:3001/api/ws
```

## Best Practices

1. **Always use separate ports in development** to avoid HMR conflicts
2. **Use same port in production** to simplify deployment
3. **Environment detection** should be robust and handle edge cases
4. **Graceful fallbacks** if WebSocket connections fail
5. **Clear logging** to identify which WebSocket service is being used

This configuration ensures that Vite's development features work seamlessly alongside our custom trading WebSocket service.
