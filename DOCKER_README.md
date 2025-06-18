# CryptoTradeNinja Docker Setup

This guide will help you deploy CryptoTradeNinja using Docker Desktop on Windows.

## Prerequisites

1. **Docker Desktop** - Make sure Docker Desktop is installed and running
2. **Git** - To clone the repository (if needed)
3. **Windows PowerShell** or **Command Prompt**

## Quick Start

### 1. Ensure Docker Desktop is Running

Make sure Docker Desktop is running on your Windows machine. You should see the Docker icon in your system tray.

### 2. Build and Start the Application

#### For Development (with hot reload):
```powershell
# Using the management script
.\docker-manage.bat start-dev

# Or manually
docker-compose -f docker-compose.dev.yml up -d
```

#### For Production:
```powershell
# Using the management script
.\docker-manage.bat build
.\docker-manage.bat start

# Or manually
docker-compose build
docker-compose up -d
```

### 3. Setup Database

After the containers are running, set up the database:

```powershell
# Using the management script
.\docker-manage.bat setup-db

# Or manually
docker-compose exec app npm run db:push
```

### 4. Access the Application

- **Frontend**: http://localhost:5000
- **API**: http://localhost:5000/api
- **WebSocket**: ws://localhost:3001
- **Database Studio**: Run `.\docker-manage.bat db-studio`

## Docker Management Script

We've provided convenient scripts to manage your Docker deployment:

### Windows (.bat file):
```powershell
.\docker-manage.bat [command]
```

### Available Commands:

- `build` - Build the application
- `start` - Start services in production mode
- `start-dev` - Start services in development mode
- `stop` - Stop all services
- `logs` - View production logs
- `logs-dev` - View development logs
- `setup-db` - Setup database (run migrations)
- `db-studio` - Open database studio
- `cleanup` - Clean up Docker resources
- `status` - Show status of running containers
- `help` - Show help message

### Examples:
```powershell
# Start development environment
.\docker-manage.bat start-dev

# View development logs
.\docker-manage.bat logs-dev

# Stop all services
.\docker-manage.bat stop

# Check status
.\docker-manage.bat status
```

## Docker Compose Files

### `docker-compose.yml` (Production)
- Uses the production Dockerfile
- Optimized builds with multi-stage Docker build
- Includes PostgreSQL and Redis
- Production environment variables

### `docker-compose.dev.yml` (Development)
- Uses the development Dockerfile
- Includes hot reload and development tools
- Mounts source code as volumes for live editing
- Development environment variables

## Environment Variables

### Production Environment (`.env.docker`)
The application uses these environment variables in Docker:

```bash
NODE_ENV=production
PORT=5000
WS_PORT=3001
DATABASE_URL=postgresql://postgres:Dek.09041976@postgres:5432/cryptotradeninja
JWT_SECRET=your-secure-jwt-secret-key-change-this-in-production
ENCRYPTION_KEY=your-secure-encryption-key-change-this-in-production
ALLOWED_ORIGINS=http://localhost:5000,http://localhost:3000,http://127.0.0.1:5000
```

**⚠️ IMPORTANT**: Change the JWT_SECRET and ENCRYPTION_KEY values in production!

## Services

### Application Container (`app`)
- Runs the Node.js/Express backend and serves the React frontend
- Exposes ports 5000 (HTTP) and 3001 (WebSocket)
- Includes health checks

### PostgreSQL Database (`postgres`)
- Official PostgreSQL 15 image
- Persistent data storage using Docker volumes
- Health checks to ensure database is ready

### Redis (`redis`)
- Official Redis 7 Alpine image
- Used for session storage and caching
- Persistent data storage

## Volumes

- `postgres_data` - PostgreSQL database files
- `redis_data` - Redis data files
- `app_logs` - Application log files
- `node_modules` - Node.js dependencies (dev mode)

## Networks

- `cryptotradeninja-network` - Internal Docker network for service communication

## Troubleshooting

### Docker Desktop Not Running
```
Error: Docker is not running. Please start Docker Desktop first.
```
**Solution**: Start Docker Desktop and wait for it to fully initialize.

### Port Conflicts
If you get port conflict errors:
1. Stop any services running on ports 5000, 3001, 5432, or 6379
2. Or modify the port mappings in the docker-compose files

### Database Connection Issues
```
Error: Database connection failed
```
**Solution**: 
1. Ensure PostgreSQL container is healthy: `docker-compose ps`
2. Check logs: `.\docker-manage.bat logs`
3. Restart services: `.\docker-manage.bat stop` then `.\docker-manage.bat start`

### Permission Issues
On Windows, if you encounter permission issues:
1. Run PowerShell or Command Prompt as Administrator
2. Ensure Docker Desktop has proper permissions

### Container Won't Start
1. Check Docker Desktop resources (CPU, Memory)
2. Check logs: `.\docker-manage.bat logs`
3. Clean up and rebuild: `.\docker-manage.bat cleanup` then `.\docker-manage.bat build`

## Development Workflow

### For Active Development:
1. Start development environment: `.\docker-manage.bat start-dev`
2. Edit files in your IDE - changes will be reflected immediately
3. View logs: `.\docker-manage.bat logs-dev`
4. Access database studio: `.\docker-manage.bat db-studio`

### For Production Testing:
1. Build production image: `.\docker-manage.bat build`
2. Start production environment: `.\docker-manage.bat start`
3. Test the application at http://localhost:5000

## Security Considerations

1. **Change Default Secrets**: Update JWT_SECRET and ENCRYPTION_KEY in production
2. **Database Passwords**: Change the default PostgreSQL password
3. **Network Security**: Use proper firewall rules in production
4. **HTTPS**: Add SSL/TLS termination for production deployments

## Monitoring

### View Container Status:
```powershell
.\docker-manage.bat status
```

### View Logs:
```powershell
# Production logs
.\docker-manage.bat logs

# Development logs  
.\docker-manage.bat logs-dev
```

### Access Container Shell:
```powershell
# Access application container
docker-compose exec app sh

# Access database container
docker-compose exec postgres psql -U postgres -d cryptotradeninja
```

## Backup and Restore

### Backup Database:
```powershell
docker-compose exec postgres pg_dump -U postgres cryptotradeninja > backup.sql
```

### Restore Database:
```powershell
docker-compose exec -T postgres psql -U postgres cryptotradeninja < backup.sql
```

## Cleanup

To completely remove all Docker resources:
```powershell
.\docker-manage.bat cleanup
```

This will:
- Stop all containers
- Remove containers and networks
- Remove unused Docker resources
- Keep volumes (use `docker volume prune` to remove volumes)

## Support

If you encounter issues:
1. Check the logs: `.\docker-manage.bat logs`
2. Verify Docker Desktop is running and has sufficient resources
3. Ensure no other services are using the required ports
4. Try rebuilding: `.\docker-manage.bat cleanup` then `.\docker-manage.bat build`
