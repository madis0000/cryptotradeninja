@echo off
REM CryptoTradeNinja Docker Management Script for Windows
REM This script helps manage the Docker containers for the CryptoTradeNinja application

setlocal enabledelayedexpansion

REM Function to check if Docker is running
:check_docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    exit /b 1
)
echo [SUCCESS] Docker is running
goto :eof

REM Function to build the application
:build_app
echo [INFO] Building CryptoTradeNinja application...
docker-compose build
if errorlevel 1 (
    echo [ERROR] Failed to build application
    exit /b 1
)
echo [SUCCESS] Application built successfully
goto :eof

REM Function to start services in production mode
:start_production
echo [INFO] Starting CryptoTradeNinja in production mode...
docker-compose up -d
if errorlevel 1 (
    echo [ERROR] Failed to start production services
    exit /b 1
)
echo [SUCCESS] Production services started
echo [INFO] Services running:
docker-compose ps
goto :eof

REM Function to start services in development mode
:start_development
echo [INFO] Starting CryptoTradeNinja in development mode...
docker-compose -f docker-compose.dev.yml up -d
if errorlevel 1 (
    echo [ERROR] Failed to start development services
    exit /b 1
)
echo [SUCCESS] Development services started
echo [INFO] Services running:
docker-compose -f docker-compose.dev.yml ps
goto :eof

REM Function to stop services
:stop_services
echo [INFO] Stopping all CryptoTradeNinja services...
docker-compose down
docker-compose -f docker-compose.dev.yml down
echo [SUCCESS] All services stopped
goto :eof

REM Function to view logs
:view_logs
if "%2"=="dev" (
    docker-compose -f docker-compose.dev.yml logs -f
) else (
    docker-compose logs -f
)
goto :eof

REM Function to setup database
:setup_database
echo [INFO] Setting up database...
docker-compose exec app npm run db:push
if errorlevel 1 (
    echo [ERROR] Failed to setup database
    exit /b 1
)
echo [SUCCESS] Database setup completed
goto :eof

REM Function to open database studio
:open_db_studio
echo [INFO] Opening database studio...
docker-compose exec app npm run db:studio
goto :eof

REM Function to clean up Docker resources
:cleanup
echo [INFO] Cleaning up Docker resources...
docker-compose down -v
docker-compose -f docker-compose.dev.yml down -v
docker system prune -f
echo [SUCCESS] Cleanup completed
goto :eof

REM Function to show status
:show_status
echo [INFO] Docker containers status:
docker ps -a --filter "name=cryptotradeninja"
echo.
echo [INFO] Docker networks:
docker network ls --filter "name=cryptotradeninja"
echo.
echo [INFO] Docker volumes:
docker volume ls --filter "name=cryptotradeninja"
goto :eof

REM Function to show help
:show_help
echo CryptoTradeNinja Docker Management Script
echo.
echo Usage: %0 [COMMAND]
echo.
echo Commands:
echo   build           Build the application
echo   start           Start services in production mode
echo   start-dev       Start services in development mode
echo   stop            Stop all services
echo   logs            View production logs
echo   logs-dev        View development logs
echo   setup-db        Setup database (run migrations)
echo   db-studio       Open database studio
echo   cleanup         Clean up Docker resources
echo   status          Show status of running containers
echo   help            Show this help message
echo.
echo Examples:
echo   %0 build         # Build the application
echo   %0 start-dev     # Start in development mode
echo   %0 logs-dev      # View development logs
echo   %0 stop          # Stop all services
goto :eof

REM Main script logic
if "%1"=="build" (
    call :check_docker
    if not errorlevel 1 call :build_app
) else if "%1"=="start" (
    call :check_docker
    if not errorlevel 1 call :start_production
) else if "%1"=="start-dev" (
    call :check_docker
    if not errorlevel 1 call :start_development
) else if "%1"=="stop" (
    call :check_docker
    if not errorlevel 1 call :stop_services
) else if "%1"=="logs" (
    call :view_logs
) else if "%1"=="logs-dev" (
    call :view_logs logs dev
) else if "%1"=="setup-db" (
    call :check_docker
    if not errorlevel 1 call :setup_database
) else if "%1"=="db-studio" (
    call :check_docker
    if not errorlevel 1 call :open_db_studio
) else if "%1"=="cleanup" (
    call :check_docker
    if not errorlevel 1 call :cleanup
) else if "%1"=="status" (
    call :check_docker
    if not errorlevel 1 call :show_status
) else if "%1"=="help" (
    call :show_help
) else if "%1"=="--help" (
    call :show_help
) else if "%1"=="-h" (
    call :show_help
) else if "%1"=="" (
    call :show_help
) else (
    echo [ERROR] Unknown command: %1
    call :show_help
    exit /b 1
)
