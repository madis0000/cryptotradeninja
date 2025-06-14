# CryptoTradeNinja - Product Requirements Document

## Project Overview
CryptoTradeNinja is a cryptocurrency trading bot application that provides automated trading capabilities with real-time market data and advanced trading strategies.

## Key Features
- Real-time cryptocurrency market data via WebSocket connections
- Automated trading bots with configurable strategies
- Martingale trading strategy implementation
- Multi-symbol trading support (BTC, ETH, ADA, DOGE, SOL, AVAX, DOT, ICP, XRP, LINK)
- Real-time chart visualization with kline data
- Bot management and monitoring
- Order execution (Market and Limit orders)
- Trading history and performance tracking

## Technical Stack
- **Frontend**: React/Vite application with TypeScript
- **Backend**: Node.js server with WebSocket support
- **Database**: SQLite with Drizzle ORM
- **Styling**: TailwindCSS with shadcn/ui components
- **Real-time Communication**: WebSocket for live market data
- **Trading API**: Binance Testnet integration

## Architecture
- Client-server architecture with WebSocket communication
- Modular bot system with configurable trading strategies
- Real-time market data streaming
- Persistent bot state management
- Comprehensive logging system

## Development Guidelines
- Follow TypeScript best practices
- Maintain clean code architecture
- Implement proper error handling
- Ensure real-time data synchronization
- Focus on performance optimization for high-frequency trading

## Deployment
- Production build configuration
- Environment-specific configurations
- Logging and monitoring setup

---
*This PRD should be referenced by AI agents working on this project to maintain consistency with project goals and architecture.*
