# Crypto Trading Platform

A sophisticated crypto trading platform with advanced real-time communication infrastructure, focusing on robust multi-exchange trading bot management and precise market data visualization.

## Deployment

The application is now configured for production deployment with proper port handling and environment variable support.

### Environment Variables for Production

- `PORT` - Server port (defaults to 5000)
- `HOST` - Server host (defaults to 0.0.0.0)
- `NODE_ENV` - Set to "production" for production deployment
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT token signing
- `ENCRYPTION_KEY` - Key for API credential encryption
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### Build and Start

```bash
npm run build
npm start
```

## Development

```bash
npm run dev
```

## Features

- Multi-exchange trading bot management
- Real-time market data visualization
- WebSocket-based communication
- PostgreSQL data persistence
- TypeScript for type safety
- Modern React frontend with Shadcn/ui components