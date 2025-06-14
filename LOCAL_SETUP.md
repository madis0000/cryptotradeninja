# Local Development Setup

## Overview
This document outlines the steps to set up the CryptoTradeNinja project for local development using VS Code and PostgreSQL, transitioning from the original Replit environment.

## Prerequisites

### 1. PostgreSQL Installation
- PostgreSQL server running locally on port 5432
- Default user: `postgres`
- Password: `Dek.09041976`

### 2. Node.js and npm
- Node.js version 18+ installed
- npm package manager

### 3. Development Tools
- Visual Studio Code
- Git

## Setup Instructions

### 1. Clone and Install Dependencies
```bash
git clone https://github.com/madis0000/cryptotradeninja.git
cd cryptotradeninja
npm install
```

### 2. Environment Configuration
The `.env` file is already configured for local development:
```env
NODE_ENV=development
WS_PORT=3001
PORT=5000

# Local PostgreSQL Database Configuration
DATABASE_URL=postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja

# Security Keys (Change these in production)
JWT_SECRET=your-jwt-secret-key-change-in-production
ENCRYPTION_KEY=your-encryption-key-change-in-production

# CORS Origins (comma-separated list for production)
ALLOWED_ORIGINS=http://localhost:5000,http://localhost:3000,http://127.0.0.1:5000
```

### 3. Database Setup
The database `cryptotradeninja` has been created with the following tables:
- `users` - User accounts and authentication
- `trading_bots` - Trading bot configurations
- `bot_cycles` - Trading bot execution cycles
- `cycle_orders` - Orders within trading cycles
- `trades` - Executed trades
- `portfolio` - Portfolio management
- `exchanges` - Exchange configurations
- `user_settings` - User preferences

### 4. Database Commands
```bash
# Push schema to database
npm run db:push

# Generate migration files
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### 5. Development Commands
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run check
```

## Changes from Replit Environment

### 1. Dependencies Removed
- `@neondatabase/serverless` - Replaced with `pg` for local PostgreSQL
- `@replit/vite-plugin-cartographer` - Replit-specific plugin
- `@replit/vite-plugin-runtime-error-modal` - Replit-specific plugin
- `crypto` - Deprecated package (now using Node.js built-in)

### 2. Dependencies Added
- `pg` - PostgreSQL client for Node.js
- `@types/pg` - TypeScript definitions for pg

### 3. Configuration Changes
- **Database**: Switched from Neon Database to local PostgreSQL
- **Vite Config**: Removed Replit-specific plugins and configurations
- **Server Config**: Updated deployment detection to exclude Replit-specific environment variables
- **Environment**: Updated for local development with proper CORS and security settings

### 4. Server Configuration
- **Development**: Runs on `localhost:5000` (backend) and `localhost:3000` (frontend)
- **WebSocket**: Separate port (`3001`) for development to avoid Vite HMR conflicts
- **Database**: Local PostgreSQL connection with proper connection pooling

## Development Workflow

### 1. Starting Development
```bash
npm run dev
```
This starts:
- Backend server on `http://localhost:5000`
- WebSocket server on `ws://localhost:3001`
- Frontend development server on `http://localhost:3000` (via Vite)

### 2. Database Management
- Use `npm run db:studio` to open Drizzle Studio for database visualization
- Use `npm run db:push` to sync schema changes
- Database is automatically created and configured

### 3. VS Code Configuration
The project includes VS Code settings that:
- Reference the PRD document for AI assistance
- Configure debugging and development tools
- Set up proper TypeScript and formatting options

## Port Configuration (Preserved from Original)
- **Main Server**: 5000 (configurable via `PORT` environment variable)
- **WebSocket** (Dev): 3001 (configurable via `WS_PORT` environment variable)
- **Frontend** (Dev): 3000 (Vite development server)

## Security Notes
- Environment variables contain development values
- Change `JWT_SECRET` and `ENCRYPTION_KEY` for production
- Database password is configured for local PostgreSQL setup
- CORS is configured for local development origins

## Troubleshooting

### Database Connection Issues
1. Ensure PostgreSQL is running on localhost:5432
2. Verify the password in `.env` matches your PostgreSQL setup
3. Check if the `cryptotradeninja` database exists

### Port Conflicts
1. Check if ports 5000, 3000, or 3001 are already in use
2. Modify the ports in `.env` file if needed
3. Restart the development server

### Missing Dependencies
1. Run `npm install` to ensure all dependencies are installed
2. Check for any peer dependency warnings
3. Update dependencies if needed

## Production Deployment
The application is ready for production deployment with:
- Proper environment variable configuration
- Production build optimization
- Security headers and CORS configuration
- Database connection pooling

For production deployment, update the environment variables accordingly and use:
```bash
npm run build
npm start
```
