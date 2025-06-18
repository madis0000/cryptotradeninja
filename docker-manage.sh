#!/bin/bash

# CryptoTradeNinja Docker Management Script
# This script helps manage the Docker containers for the CryptoTradeNinja application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop first."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to build the application
build_app() {
    print_status "Building CryptoTradeNinja application..."
    docker-compose build
    print_success "Application built successfully"
}

# Function to start services in production mode
start_production() {
    print_status "Starting CryptoTradeNinja in production mode..."
    docker-compose up -d
    print_success "Production services started"
    print_status "Services running:"
    docker-compose ps
}

# Function to start services in development mode
start_development() {
    print_status "Starting CryptoTradeNinja in development mode..."
    docker-compose -f docker-compose.dev.yml up -d
    print_success "Development services started"
    print_status "Services running:"
    docker-compose -f docker-compose.dev.yml ps
}

# Function to stop services
stop_services() {
    print_status "Stopping all CryptoTradeNinja services..."
    docker-compose down
    docker-compose -f docker-compose.dev.yml down
    print_success "All services stopped"
}

# Function to view logs
view_logs() {
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml logs -f
    else
        docker-compose logs -f
    fi
}

# Function to setup database
setup_database() {
    print_status "Setting up database..."
    docker-compose exec app npm run db:push
    print_success "Database setup completed"
}

# Function to open database studio
open_db_studio() {
    print_status "Opening database studio..."
    docker-compose exec app npm run db:studio
}

# Function to clean up Docker resources
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose down -v
    docker-compose -f docker-compose.dev.yml down -v
    docker system prune -f
    print_success "Cleanup completed"
}

# Function to show help
show_help() {
    echo "CryptoTradeNinja Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build           Build the application"
    echo "  start           Start services in production mode"
    echo "  start-dev       Start services in development mode"
    echo "  stop            Stop all services"
    echo "  logs            View production logs"
    echo "  logs-dev        View development logs"
    echo "  setup-db        Setup database (run migrations)"
    echo "  db-studio       Open database studio"
    echo "  cleanup         Clean up Docker resources"
    echo "  status          Show status of running containers"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 build         # Build the application"
    echo "  $0 start-dev     # Start in development mode"
    echo "  $0 logs-dev      # View development logs"
    echo "  $0 stop          # Stop all services"
}

# Function to show status
show_status() {
    print_status "Docker containers status:"
    docker ps -a --filter "name=cryptotradeninja"
    echo ""
    print_status "Docker networks:"
    docker network ls --filter "name=cryptotradeninja"
    echo ""
    print_status "Docker volumes:"
    docker volume ls --filter "name=cryptotradeninja"
}

# Main script logic
case "$1" in
    "build")
        check_docker
        build_app
        ;;
    "start")
        check_docker
        start_production
        ;;
    "start-dev")
        check_docker
        start_development
        ;;
    "stop")
        check_docker
        stop_services
        ;;
    "logs")
        view_logs
        ;;
    "logs-dev")
        view_logs "dev"
        ;;
    "setup-db")
        check_docker
        setup_database
        ;;
    "db-studio")
        check_docker
        open_db_studio
        ;;
    "cleanup")
        check_docker
        cleanup
        ;;
    "status")
        check_docker
        show_status
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
