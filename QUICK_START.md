# Quick Start Guide - CryptoTradeNinja

## 🚀 Getting Started (2 Terminals Required)

### Prerequisites
- PostgreSQL running locally with database `cryptotradeninja`
- Node.js installed

### Step 1: Setup
```bash
git clone https://github.com/madis0000/cryptotradeninja.git
cd cryptotradeninja
npm install
```

### Step 2: Database
```bash
npm run db:push
```

### Step 3: Development (2 Terminals)

**Terminal 1 - Backend:**
```bash
npm run dev
```
✅ Backend API: http://localhost:5000  
✅ Trading WebSocket: ws://localhost:3001

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```
✅ Frontend App: http://localhost:3000

### Step 4: Access Application
Open your browser to: **http://localhost:3000**

---

## 🔧 Alternative Commands

**Backend:**
- `npm run dev` or `npm run dev:backend`

**Frontend:**
- `npm run dev:frontend` or `npx vite`

## 📋 Port Configuration
- **Frontend (Vite)**: Port 3000
- **Backend (Express)**: Port 5000  
- **Trading WebSocket**: Port 3001
- **Vite HMR WebSocket**: Automatically managed by Vite

## ❗ Important Notes
- **ALWAYS** run frontend and backend in separate terminals
- Frontend connects to backend automatically
- Trading WebSocket handles all market data and bot communications
- Vite HMR WebSocket is separate and handles hot reloading only

## 🐛 Troubleshooting
- If WebSocket shows "connecting...", check that backend is running on port 5000
- If frontend won't start, check that port 3000 is available
- Database issues? Verify PostgreSQL is running and `cryptotradeninja` database exists
