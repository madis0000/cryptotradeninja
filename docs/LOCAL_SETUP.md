# Local PostgreSQL Setup for CryptoTradeNinja

This guide will help you set up a local PostgreSQL database for the CryptoTradeNinja project.

## Prerequisites

1. **Install PostgreSQL**
   - Windows: Download from https://www.postgresql.org/download/windows/
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

## Database Setup

1. **Start PostgreSQL service**
   - Windows: PostgreSQL should start automatically, or use Services app
   - macOS: `brew services start postgresql`
   - Linux: `sudo service postgresql start`

2. **Create database and user**
   ```sql
   -- Connect to PostgreSQL as superuser
   psql -U postgres

   -- Create database
   CREATE DATABASE cryptotradeninja;

   -- Create user
   CREATE USER cryptotradeninja WITH ENCRYPTED PASSWORD 'cryptotradeninja';

   -- Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE cryptotradeninja TO cryptotradeninja;

   -- Connect to the new database
   \c cryptotradeninja

   -- Grant schema privileges
   GRANT ALL ON SCHEMA public TO cryptotradeninja;

   -- Exit
   \q
   ```

3. **Update environment variables**
   The `.env` file is already configured with:
   ```
   DATABASE_URL=postgresql://cryptotradeninja:cryptotradeninja@localhost:5432/cryptotradeninja
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database
- `npm run db:generate` - Generate migration files
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Drizzle Studio

## Troubleshooting

### Connection Issues
- Ensure PostgreSQL is running: `pg_isready`
- Check if port 5432 is available: `netstat -an | grep 5432`
- Verify credentials match those in `.env` file

### Permission Issues
- Make sure the database user has proper permissions
- Try connecting manually: `psql -U cryptotradeninja -d cryptotradeninja -h localhost`

### Migration Issues
- Check if database schema exists
- Run `npm run db:generate` first, then `npm run db:push`
